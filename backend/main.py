from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pandas as pd
import numpy as np
import duckdb
import json
import io
import os
import re
from typing import Optional
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="DataAnalyst AI Agent", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict = {}
MODEL = "llama-3.1-8b-instant"


# ── Helpers ──────────────────────────────────────────────────────────────────

def safe_json(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records", date_format="iso"))


def detect_types(df: pd.DataFrame) -> dict:
    types = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            types[col] = "number"
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            types[col] = "date"
        else:
            try:
                pd.to_datetime(df[col].dropna().head(20))
                types[col] = "date"
            except Exception:
                types[col] = "string"
    return types


def compute_stats(df: pd.DataFrame) -> dict:
    stats = {}
    for col in df.select_dtypes(include=[np.number]).columns:
        s = df[col].dropna()
        if len(s) == 0:
            continue
        q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
        iqr = q3 - q1
        stats[col] = {
            "mean":     round(float(s.mean()), 4),
            "median":   round(float(s.median()), 4),
            "std":      round(float(s.std()), 4),
            "min":      round(float(s.min()), 4),
            "max":      round(float(s.max()), 4),
            "q1":       round(q1, 4),
            "q3":       round(q3, 4),
            "outliers": int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum()),
            "skewness": round(float(s.skew()), 4),
            "kurtosis": round(float(s.kurtosis()), 4),
        }
    return stats


def compute_correlations(df: pd.DataFrame) -> dict:
    num = df.select_dtypes(include=[np.number])
    if num.shape[1] < 2:
        return {}
    corr = num.corr().round(3)
    return {col: corr[col].to_dict() for col in corr.columns}


def compute_quality(df: pd.DataFrame) -> dict:
    total = df.shape[0] * df.shape[1]
    null_count = int(df.isnull().sum().sum())
    dup_count  = int(df.duplicated().sum())
    null_by_col = {k: int(v) for k, v in df.isnull().sum().to_dict().items()}
    missing_rate = null_count / total if total > 0 else 0

    issues = []
    for col, n in null_by_col.items():
        if n > 0:
            pct = round(n / len(df) * 100, 1)
            issues.append({
                "type": "missing", "column": col, "count": n, "pct": pct,
                "severity": "high" if pct > 20 else "medium" if pct > 5 else "low",
                "message": f"{n} missing values ({pct}%)"
            })

    for col in df.select_dtypes(include=[np.number]).columns:
        s = df[col].dropna()
        if len(s) < 4:
            continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        n_out = int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum())
        if n_out > 0:
            issues.append({
                "type": "outlier", "column": col, "count": n_out,
                "pct": round(n_out / len(s) * 100, 1),
                "severity": "high" if n_out / len(s) >= 0.05 else "medium",
                "message": f"{n_out} outliers detected (IQR method)"
            })

    if dup_count > 0:
        issues.append({
            "type": "duplicate", "column": None, "count": dup_count,
            "pct": round(dup_count / len(df) * 100, 1),
            "severity": "high", "message": f"{dup_count} duplicate rows"
        })

    score = max(0, round(100 - missing_rate * 60 - (dup_count / max(len(df), 1)) * 30 - len(issues) * 2))
    return {
        "score": score, "null_count": null_count, "null_by_col": null_by_col,
        "dup_count": dup_count, "missing_rate": round(missing_rate * 100, 2),
        "total_cells": total, "issues": issues,
    }


def build_summary(df: pd.DataFrame, col_types: dict, quality: dict, stats: dict) -> str:
    str_cols = [c for c, t in col_types.items() if t == "string"]
    stat_lines = [
        f"{col}: mean={s['mean']}, std={s['std']}, min={s['min']}, max={s['max']}, outliers={s['outliers']}"
        for col, s in list(stats.items())[:6]
    ]
    cat_lines = [
        f"{col}({df[col].nunique()} unique): {dict(list(df[col].value_counts().head(4).items()))}"
        for col in str_cols[:3]
    ]
    corr_lines = []
    num = df.select_dtypes(include=[np.number])
    if num.shape[1] >= 2:
        corr = num.corr()
        for i, c1 in enumerate(corr.columns):
            for c2 in corr.columns[i + 1:]:
                v = corr.loc[c1, c2]
                if abs(v) > 0.4:
                    corr_lines.append(f"{c1}+{c2}={v:.2f}")

    return (
        f"DATASET: {len(df):,} rows x {len(df.columns)} cols | Quality: {quality['score']}/100\n"
        f"Columns: {', '.join(df.columns.tolist())}\n"
        f"Types: {', '.join(f'{c}({t[0]})' for c, t in col_types.items())}\n"
        f"Missing: {quality['null_count']} ({quality['missing_rate']}%) | Dupes: {quality['dup_count']}\n"
        f"Issues: {'; '.join(i['message'] for i in quality['issues'][:5]) or 'none'}\n"
        f"STATS: {' | '.join(stat_lines) or 'none'}\n"
        f"CATEGORIES: {' | '.join(cat_lines) or 'none'}\n"
        f"CORRELATIONS(>0.4): {', '.join(corr_lines) or 'none'}\n"
        f"SAMPLE: {df.head(2).to_dict('records')}"
    )


def get_groq_client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY is not set. Run: $env:GROQ_API_KEY='your-key'")
    return Groq(api_key=key)


# ── DuckDB SQL Query Engine ───────────────────────────────────────────────────

def build_schema_description(df: pd.DataFrame, col_types: dict) -> str:
    """Build a rich schema description for the LLM."""
    lines = []
    for col in df.columns:
        dtype = col_types.get(col, "string")
        sample = df[col].dropna().head(5).tolist()
        nunique = df[col].nunique()
        if dtype == "number":
            col_min = round(float(df[col].min()), 3) if not df[col].isna().all() else "N/A"
            col_max = round(float(df[col].max()), 3) if not df[col].isna().all() else "N/A"
            lines.append(
                f'  "{col}" ({dtype}, min={col_min}, max={col_max}, {nunique} unique) '
                f'-- e.g. {sample[:3]}'
            )
        else:
            lines.append(
                f'  "{col}" ({dtype}, {nunique} unique values) -- e.g. {[str(s) for s in sample[:5]]}'
            )
    return "\n".join(lines)



# ── Rule-based SQL Builder (no LLM needed for common patterns) ────────────────

def find_column(name_hint: str, col_types: dict, want_type: str = None) -> str:
    """
    Find the best matching column for a hint word, optionally filtering by type.
    Returns the exact column name or None.
    """
    hint = name_hint.lower().strip()
    candidates = list(col_types.keys())

    # Exact match (case-insensitive)
    for col in candidates:
        if col.lower() == hint:
            if want_type is None or col_types[col] == want_type:
                return col

    # Partial match
    for col in candidates:
        if hint in col.lower() or col.lower() in hint:
            if want_type is None or col_types[col] == want_type:
                return col

    return None


def extract_columns_from_question(question: str, col_types: dict):
    """
    Try to identify which columns the user is referring to.
    Returns (group_col, metric_col, agg_fn, limit, order).
    """
    q = question.lower()
    num_cols  = [c for c, t in col_types.items() if t == "number"]
    cat_cols  = [c for c, t in col_types.items() if t == "string"]
    date_cols = [c for c, t in col_types.items() if t == "date"]

    # --- Detect aggregation function ---
    if any(w in q for w in ["average", "avg", "mean"]):
        agg_fn = "AVG"
    elif any(w in q for w in ["count", "how many", "number of"]):
        agg_fn = "COUNT"
    elif any(w in q for w in ["minimum", "lowest value", "min value"]):
        agg_fn = "MIN"
    elif any(w in q for w in ["maximum", "highest value", "max value"]):
        agg_fn = "MAX"
    else:
        agg_fn = "SUM"   # default for "total", "highest X by Y", "which has most"

    # --- Detect limit ---
    import re as _re
    top_match = _re.search(r"top\s*(\d+)", q)
    limit = int(top_match.group(1)) if top_match else (1 if any(w in q for w in ["highest", "lowest", "which", "best", "worst", "most", "least"]) else 50)

    # --- Detect order ---
    order = "ASC" if any(w in q for w in ["lowest", "least", "worst", "minimum", "ascending"]) else "DESC"

    # --- Find metric column (numeric) ---
    metric_col = None
    for col in num_cols:
        if col.lower() in q or any(word in q for word in col.lower().split()):
            metric_col = col
            break
    if metric_col is None and num_cols:
        metric_col = num_cols[0]   # fallback: first numeric col

    # --- Find group column (categorical or date) ---
    group_col = None
    all_dim_cols = cat_cols + date_cols
    for col in all_dim_cols:
        if col.lower() in q or any(word in q for word in col.lower().split() if len(word) > 2):
            group_col = col
            break

    return group_col, metric_col, agg_fn, limit, order


def try_rule_based_sql(question: str, df, col_types: dict):
    """
    Attempt to build a correct SQL query using rules alone.
    Returns SQL string if successful, None if the query is too complex for rules.
    """
    q = question.lower().strip()
    num_cols  = [c for c, t in col_types.items() if t == "number"]
    cat_cols  = [c for c, t in col_types.items() if t == "string"]

    group_col, metric_col, agg_fn, limit, order = extract_columns_from_question(question, col_types)

    # Pattern 1: "which/what [dim] has highest/lowest/most [metric]"
    ranking_triggers  = ["highest", "lowest", "most", "least", "which", "what", "top", "best", "worst", "maximum", "minimum"]
    grouping_triggers = ["by", "per", "each", "every", "group", "breakdown", "across"]
    is_ranking  = any(w in q for w in ranking_triggers)
    is_grouping = any(w in q for w in grouping_triggers)

    if (is_ranking or is_grouping) and group_col and metric_col:
        alias = metric_col.replace(" ", "_").replace("/", "_").lower()
        sql = (
            f'SELECT "{group_col}", ROUND({agg_fn}("{metric_col}"), 2) AS {agg_fn.lower()}_{alias} '
            f'FROM df '
            f'GROUP BY "{group_col}" '
            f'ORDER BY {agg_fn.lower()}_{alias} {order} '
            f'LIMIT {limit}'
        )
        return sql

    # Pattern 2: "total/sum/average of [metric]" (no grouping)
    scalar_triggers = ["total", "sum", "average", "avg", "mean", "overall"]
    if any(w in q for w in scalar_triggers) and metric_col and not is_grouping:
        alias = metric_col.replace(" ", "_").lower()
        fn = "AVG" if any(w in q for w in ["average", "avg", "mean"]) else "SUM"
        sql = f'SELECT ROUND({fn}("{metric_col}"), 2) AS {fn.lower()}_{alias} FROM df'
        return sql

    # Pattern 3: "count of rows" / "how many rows/records"
    if any(w in q for w in ["how many rows", "how many records", "row count", "total rows", "count rows"]):
        return "SELECT COUNT(*) AS row_count FROM df"

    # Pattern 4: count by group "how many X per/by Y"
    if any(w in q for w in ["how many", "count"]) and group_col:
        sql = (
            f'SELECT "{group_col}", COUNT(*) AS count '
            f'FROM df '
            f'GROUP BY "{group_col}" '
            f'ORDER BY count {order} '
            f'LIMIT {limit}'
        )
        return sql

    # Pattern 5: "show/list/get all [column]" or simple SELECT
    if any(w in q for w in ["show", "list", "display", "get", "select all", "all rows"]) and not is_ranking:
        cols = []
        for col in col_types:
            if col.lower() in q:
                cols.append(f'"{col}"')
        select_cols = ", ".join(cols) if cols else "*"
        return f"SELECT {select_cols} FROM df LIMIT 50"

    return None   # Hand off to LLM


def generate_sql_query(question: str, df: pd.DataFrame, col_types: dict, client: Groq) -> str:
    """
    Build a DuckDB SQL query to answer the user question.
    Step 1: Try rule-based builder (fast, always correct for common patterns).
    Step 2: Fall back to LLM only for complex queries.
    """
    # --- Rule-based first (no LLM, always aggregates correctly) ---
    rule_sql = try_rule_based_sql(question, df, col_types)
    if rule_sql:
        return rule_sql

    # --- LLM fallback for complex queries ---
    schema = build_schema_description(df, col_types)
    num_cols  = [c for c, t in col_types.items() if t == "number"]
    cat_cols  = [c for c, t in col_types.items() if t == "string"]
    date_cols = [c for c, t in col_types.items() if t == "date"]

    few_shot = ""
    if cat_cols and num_cols:
        gc, nc = cat_cols[0], num_cols[0]
        alias = nc.replace(" ", "_").lower()
        few_shot = f"""
EXAMPLES (using actual columns from this dataset):
  Q: "which {gc} has highest {nc}?"
  CORRECT: SELECT "{gc}", ROUND(SUM("{nc}"), 2) AS sum_{alias} FROM df GROUP BY "{gc}" ORDER BY sum_{alias} DESC LIMIT 1

  Q: "total {nc} by {gc}"
  CORRECT: SELECT "{gc}", ROUND(SUM("{nc}"), 2) AS sum_{alias} FROM df GROUP BY "{gc}" ORDER BY sum_{alias} DESC LIMIT 50

  Q: "average {nc} per {gc}"
  CORRECT: SELECT "{gc}", ROUND(AVG("{nc}"), 2) AS avg_{alias} FROM df GROUP BY "{gc}" ORDER BY avg_{alias} DESC LIMIT 50
"""

    prompt = f"""You are an expert SQL analyst writing DuckDB SQL queries.

TABLE NAME: df
SCHEMA:
{schema}

Numeric columns  : {num_cols}
Categorical cols : {cat_cols}
Date columns     : {date_cols}
{few_shot}
CRITICAL RULES:
1. "which X has highest/lowest Y" → GROUP BY X, aggregate Y with SUM/AVG, ORDER BY alias LIMIT 1
2. Always double-quote column names. Table name df needs no quotes.
3. Alias every aggregation: ROUND(SUM("col"), 2) AS sum_col
4. ORDER BY the alias (not the raw column) after GROUP BY
5. LIMIT 50 by default; LIMIT 1 only for single best/worst
6. Return ONLY the SQL — no explanation, no markdown, no semicolon

User question: {question}

SQL:"""

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )
    sql = response.choices[0].message.content.strip()
    sql = re.sub(r"^```(?:sql)?", "", sql, flags=re.MULTILINE)
    sql = re.sub(r"```$", "", sql, flags=re.MULTILINE)
    sql = sql.strip().rstrip(";")

    # Guard: if still missing GROUP BY for a ranking question, force retry
    ranking_triggers = ["highest", "lowest", "most", "least", "top", "best", "worst", "which", "what"]
    q_lower = question.lower()
    needs_group = any(t in q_lower for t in ranking_triggers)
    has_group   = "group by" in sql.lower()
    has_agg     = any(fn in sql.upper() for fn in ("SUM(", "AVG(", "COUNT("))

    if needs_group and not has_group and not has_agg:
        retry = (
            f"WRONG SQL (missing GROUP BY + aggregation):\n{sql}\n\n"
            f"Question: \"{question}\"\n"
            f"Table: df | Columns: {schema}\n"
            f"Rewrite with GROUP BY + SUM/AVG/COUNT. Return ONLY the SQL, no backticks, no semicolon."
        )
        r2 = client.chat.completions.create(
            model=MODEL, max_tokens=400,
            messages=[{"role": "user", "content": retry}],
            temperature=0.0,
        )
        fixed = r2.choices[0].message.content.strip()
        fixed = re.sub(r"^```(?:sql)?", "", fixed, flags=re.MULTILINE)
        fixed = re.sub(r"```$", "", fixed, flags=re.MULTILINE)
        sql = fixed.strip().rstrip(";")

    return sql


def execute_sql_on_df(sql: str, df: pd.DataFrame) -> pd.DataFrame:
    """
    Register the DataFrame with DuckDB and run the SQL query.
    Returns a new DataFrame with the results.
    """
    con = duckdb.connect()
    con.register("df", df)
    result_df = con.execute(sql).df()
    con.close()
    return result_df


def fix_sql_query(sql: str, error: str, df: pd.DataFrame, col_types: dict, client: Groq) -> str:
    """Ask LLM to fix a broken SQL query, with aggregation-aware hints."""
    schema = build_schema_description(df, col_types)
    num_cols = [c for c, t in col_types.items() if t == "number"]
    cat_cols = [c for c, t in col_types.items() if t == "string"]

    fix_prompt = (
        f"This DuckDB SQL query failed with error:\n  {error}\n\n"
        f"Broken SQL:\n{sql}\n\n"
        f"TABLE NAME: df\n"
        f"COLUMNS:\n{schema}\n"
        f"Numeric cols: {num_cols}\n"
        f"Categorical cols: {cat_cols}\n\n"
        f"Fix rules:\n"
        f"1. Double-quote ALL column names.\n"
        f"2. If the question implies ranking/grouping, use GROUP BY + SUM/AVG/COUNT not just ORDER BY on raw values.\n"
        f"3. Alias all aggregations with AS.\n"
        f"4. No semicolons, no backticks, no markdown.\n\n"
        f"Return ONLY the corrected SQL query."
    )
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": fix_prompt}],
        temperature=0.0,
    )
    fixed = response.choices[0].message.content.strip()
    fixed = re.sub(r"^```(?:sql)?", "", fixed, flags=re.MULTILINE)
    fixed = re.sub(r"```$", "", fixed, flags=re.MULTILINE)
    return fixed.strip().rstrip(";")

def result_to_markdown_table(result_df: pd.DataFrame) -> str:
    """Convert a result DataFrame to a markdown table string."""
    df = result_df.copy()
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].round(2)
    return df.to_markdown(index=False)


def result_to_json(result_df: pd.DataFrame) -> list:
    """Convert result DataFrame to JSON-serialisable list of dicts."""
    df = result_df.copy()
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].round(2)
    return json.loads(df.to_json(orient="records", date_format="iso"))


def is_analytical_query(message: str) -> bool:
    """Detect if the user message is asking for data aggregation / SQL-like query."""
    keywords = [
        "average", "avg", "mean", "sum", "total", "count", "maximum", "minimum",
        "max", "min", "group by", "per", "by department", "by category", "by region",
        "by product", "by month", "by year", "by city", "by country", "by team",
        "highest", "lowest", "top", "bottom", "rank", "breakdown", "distribution",
        "how many", "how much", "compare", "versus", "vs", "each", "every",
        "percentage", "ratio", "proportion", "median", "mode", "variance", "std",
        "show me", "list", "find", "what is", "which", "where", "filter", "select",
        "greater than", "less than", "between", "sort", "order",
    ]
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in keywords)



# ── Deterministic narrative builder (no LLM) ─────────────────────────────────

def build_narrative(question: str, result_df) -> str:
    """
    Build a plain-English answer directly from the SQL result DataFrame.
    Never calls the LLM — always returns accurate numbers.
    """
    if result_df is None or len(result_df) == 0:
        return "No results found for that query."

    q = question.lower().strip()
    cols = list(result_df.columns)
    nrows = len(result_df)

    # Single value result (scalar aggregation)
    if result_df.shape == (1, 1):
        val = result_df.iloc[0, 0]
        col = cols[0]
        return f"**{col}**: {val:,.2f}" if isinstance(val, float) else f"**{col}**: {val:,}"

    # Two-column result: dimension + metric (most common: group by queries)
    if len(cols) == 2:
        dim_col, met_col = cols[0], cols[1]
        top_row = result_df.iloc[0]
        top_dim = top_row[dim_col]
        top_val = top_row[met_col]

        # Format metric value
        if isinstance(top_val, float):
            top_val_str = f"{top_val:,.2f}"
        else:
            top_val_str = f"{top_val:,}"

        # Single row answer (e.g. "which region has highest sales")
        if nrows == 1:
            # Detect question intent for natural phrasing
            if any(w in q for w in ["highest", "most", "maximum", "best", "top"]):
                verb = "highest"
            elif any(w in q for w in ["lowest", "least", "minimum", "worst"]):
                verb = "lowest"
            else:
                verb = "top"
            return (
                f"**{top_dim}** has the {verb} **{met_col}** with a value of **{top_val_str}**."
                + "\n\n" + result_df.to_markdown(index=False)
            )

        # Multi-row answer (e.g. "sales by region", "top 5 cities")
        lines = [
            f"Found **{nrows}** results. Top: **{top_dim}** = **{top_val_str}**",
            result_df.to_markdown(index=False)
        ]
        return "\n\n".join(lines)

    # Multi-column result — just show table with brief header
    return f"**{nrows} row(s) returned:**\n\n" + result_df.to_markdown(index=False)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "4.0.0", "model": MODEL, "engine": "duckdb"}


@app.get("/api/test-ai")
def test_ai():
    try:
        c = get_groq_client()
        msg = c.chat.completions.create(
            model=MODEL, max_tokens=10,
            messages=[{"role": "user", "content": "Say OK"}]
        )
        return {"status": "ok", "model": MODEL, "response": msg.choices[0].message.content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"API call failed: {str(e)}")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    fname = file.filename or "data.csv"
    ext = fname.rsplit(".", 1)[-1].lower()

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        elif ext in ("xlsx", "xls"):
            df = pd.read_excel(io.BytesIO(content))
        elif ext == "json":
            df = pd.read_json(io.BytesIO(content))
        elif ext == "tsv":
            df = pd.read_csv(io.BytesIO(content), sep="\t")
        elif ext == "parquet":
            df = pd.read_parquet(io.BytesIO(content))
        else:
            raise HTTPException(400, f"Unsupported format: .{ext}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")

    # Try to parse object columns as dates
    for col in df.columns:
        if df[col].dtype == object:
            try:
                converted = pd.to_datetime(df[col], infer_datetime_format=True)
                df[col] = converted
            except Exception:
                pass

    session_id   = fname.replace(".", "_") + "_" + str(len(df))
    col_types    = detect_types(df)
    quality      = compute_quality(df)
    stats        = compute_stats(df)
    correlations = compute_correlations(df)

    sessions[session_id] = {
        "df": df, "filename": fname,
        "col_types": col_types, "quality": quality,
        "stats": stats, "correlations": correlations,
        "summary": build_summary(df, col_types, quality, stats),
    }

    return {
        "session_id": session_id, "filename": fname,
        "rows": len(df), "columns": list(df.columns),
        "col_types": col_types, "quality": quality,
        "stats": stats, "correlations": correlations,
        "preview": safe_json(df.head(100)),
    }


@app.get("/api/data/{session_id}")
def get_data(session_id: str, page: int = 1, page_size: int = 100):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    df = sessions[session_id]["df"]
    start, end = (page - 1) * page_size, page * page_size
    return {
        "rows": safe_json(df.iloc[start:end]),
        "total": len(df), "page": page, "page_size": page_size,
        "total_pages": (len(df) + page_size - 1) // page_size,
    }


@app.get("/api/chart/{session_id}")
def get_chart_data(
    session_id: str, x: str,
    y: Optional[str] = None, chart_type: str = "bar", limit: int = 500
):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    sess = sessions[session_id]
    df   = sess["df"].copy()
    col_types = sess["col_types"]

    if x not in df.columns:
        raise HTTPException(400, f"Column '{x}' not found")

    if chart_type == "histogram":
        vals = df[x].dropna().astype(float)
        counts, edges = np.histogram(vals, bins=min(30, max(5, len(vals.unique()))))
        return {"labels": [round(float(e), 3) for e in edges[:-1]],
                "datasets": [{"label": x, "data": counts.tolist()}]}

    if chart_type in ("pie", "donut"):
        vc = df[x].value_counts().head(12)
        return {"labels": vc.index.astype(str).tolist(),
                "datasets": [{"data": vc.values.tolist()}]}

    if chart_type == "scatter" and y and y in df.columns:
        sample = df[[x, y]].dropna().head(limit)
        return {"datasets": [{"label": f"{x} vs {y}",
                "data": [{"x": float(r[x]), "y": float(r[y])} for _, r in sample.iterrows()]}]}

    if chart_type == "correlation":
        corr = sess["correlations"]
        cols = list(corr.keys())
        matrix = [[corr[c].get(r, 0) for r in cols] for c in cols]
        return {"cols": cols, "matrix": matrix}

    if y and y in df.columns:
        if col_types.get(x) == "string" or df[x].nunique() < 50:
            grouped = df.groupby(x)[y].mean().reset_index().head(limit)
            return {"labels": grouped[x].astype(str).tolist(),
                    "datasets": [{"label": f"avg({y})", "data": grouped[y].round(3).tolist()}]}
        sample = df[[x, y]].dropna().sort_values(x).head(limit)
        return {"labels": sample[x].astype(str).tolist(),
                "datasets": [{"label": y, "data": sample[y].round(3).tolist()}]}

    vc = df[x].value_counts().head(limit)
    return {"labels": vc.index.astype(str).tolist(),
            "datasets": [{"label": "count", "data": vc.values.tolist()}]}


class CleanRequest(BaseModel):
    session_id: str
    operations: list[dict]


@app.post("/api/clean")
def clean_data(req: CleanRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")
    sess = sessions[req.session_id]
    df   = sess["df"].copy()
    log  = []

    for op in req.operations:
        kind = op.get("type")
        col  = op.get("column")

        if kind == "drop_duplicates":
            before = len(df)
            df = df.drop_duplicates()
            log.append({"op": "drop_duplicates", "removed": before - len(df)})

        elif kind == "fill_median" and col and col in df.columns:
            n = int(df[col].isnull().sum())
            median = df[col].median()
            df[col] = df[col].fillna(median)
            log.append({"op": "fill_median", "column": col,
                        "value": round(float(median), 4), "filled": n})

        elif kind == "fill_mean" and col and col in df.columns:
            n = int(df[col].isnull().sum())
            mean = df[col].mean()
            df[col] = df[col].fillna(mean)
            log.append({"op": "fill_mean", "column": col,
                        "value": round(float(mean), 4), "filled": n})

        elif kind == "fill_mode" and col and col in df.columns:
            n = int(df[col].isnull().sum())
            mode = df[col].mode()
            val  = mode[0] if not mode.empty else "Unknown"
            df[col] = df[col].fillna(val)
            log.append({"op": "fill_mode", "column": col, "value": str(val), "filled": n})

        elif kind == "drop_nulls" and col and col in df.columns:
            before = len(df)
            df = df.dropna(subset=[col])
            log.append({"op": "drop_nulls", "column": col, "removed": before - len(df)})

        elif kind == "clip_outliers" and col and col in df.columns:
            q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
            iqr = q3 - q1
            lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            clipped = int(((df[col] < lower) | (df[col] > upper)).sum())
            df[col] = df[col].clip(lower, upper)
            log.append({"op": "clip_outliers", "column": col, "clipped": clipped,
                        "range": [round(float(lower), 3), round(float(upper), 3)]})

        elif kind == "drop_column" and col and col in df.columns:
            df = df.drop(columns=[col])
            log.append({"op": "drop_column", "column": col})

    col_types    = detect_types(df)
    quality      = compute_quality(df)
    stats        = compute_stats(df)
    correlations = compute_correlations(df)

    sess.update({
        "df": df, "col_types": col_types, "quality": quality,
        "stats": stats, "correlations": correlations,
        "summary": build_summary(df, col_types, quality, stats),
    })

    return {
        "log": log, "rows": len(df), "columns": list(df.columns),
        "col_types": col_types, "quality": quality, "stats": stats,
        "preview": safe_json(df.head(100)),
    }


@app.get("/api/export/{session_id}")
def export_csv(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    sess = sessions[session_id]
    buf  = io.StringIO()
    sess["df"].to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=cleaned_{sess['filename']}"}
    )


# ── SQL Query endpoint (DuckDB-powered) ───────────────────────────────────────

class QueryRequest(BaseModel):
    session_id: str
    question: str


@app.post("/api/query")
def run_query(req: QueryRequest):
    """
    Converts a natural language question into a DuckDB SQL query,
    executes it on the real DataFrame in-memory, and returns exact results.
    Works for CSV, Excel, JSON, TSV, Parquet — any uploaded file.
    """
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found — please upload a dataset first.")

    sess      = sessions[req.session_id]
    df        = sess["df"]
    col_types = sess["col_types"]
    client    = get_groq_client()

    # Step 1: Generate SQL query
    try:
        sql = generate_sql_query(req.question, df, col_types, client)
    except Exception as e:
        raise HTTPException(500, f"Failed to generate SQL query: {str(e)}")

    # Step 2: Execute the SQL on the real DataFrame via DuckDB
    try:
        result_df = execute_sql_on_df(sql, df)
    except Exception as exec_err:
        # Attempt a self-correction pass
        try:
            fixed_sql = fix_sql_query(sql, str(exec_err), df, col_types, client)
            result_df = execute_sql_on_df(fixed_sql, df)
            sql = fixed_sql  # show corrected SQL
        except Exception as e2:
            raise HTTPException(
                500,
                f"SQL execution failed: {str(e2)}\n\nGenerated SQL:\n{sql}"
            )

    # Step 3: Format results
    table_md  = result_to_markdown_table(result_df)
    rows_json = result_to_json(result_df)

    # Step 4: Build narrative directly from result_df — no LLM, always accurate
    narrative = build_narrative(req.question, result_df)

    return {
        "question":  req.question,
        "sql":       sql,
        "code":      sql,          # Keep backwards compatibility
        "table":     table_md,
        "rows":      rows_json,
        "narrative": narrative,
        "row_count": len(rows_json),
        "engine":    "duckdb",
    }


# ── AI Chat endpoints ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[dict] = []


class QuickAnalysisRequest(BaseModel):
    session_id: str
    analysis_type: str


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found — please upload a dataset first.")

    sess   = sessions[req.session_id]
    df     = sess["df"]
    client = get_groq_client()

    # ── Smart routing: if analytical question, run exact SQL query first ──
    query_result_block = ""
    result_df = None
    sql_used = ""
    if is_analytical_query(req.message):
        try:
            sql = generate_sql_query(req.message, df, sess["col_types"], client)
            result_df = execute_sql_on_df(sql, df)
            table = result_to_markdown_table(result_df)
            sql_used = sql
            query_result_block = f"SQL executed successfully."
        except Exception as e1:
            try:
                if sql_used:
                    fixed_sql = fix_sql_query(sql_used, str(e1), df, sess["col_types"], client)
                    result_df = execute_sql_on_df(fixed_sql, df)
                    table = result_to_markdown_table(result_df)
                    query_result_block = "SQL executed successfully."
            except Exception:
                result_df = None
                query_result_block = ""

    # If we have exact SQL results, stream them directly — no LLM hallucination possible
    if query_result_block and result_df is not None:
        direct_narrative = build_narrative(req.message, result_df)
        direct_table     = result_to_markdown_table(result_df)

        async def stream_direct():
            answer = direct_narrative + "\n\n" + direct_table
            yield f"data: {json.dumps({'text': answer})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_direct(), media_type="text/event-stream")

    # No SQL result — use LLM for general/descriptive questions
    system_msg = (
        "You are a sharp data analyst. Answer concisely with bullet points and **bold** key numbers. "
        "Only reference data from this dataset:\n\n"
        + sess["summary"]
        + "\n\nKeep answers under 200 words. Use markdown. Never guess numbers not in the dataset summary."
    )

    messages = [{"role": "system", "content": system_msg}]
    for h in req.history[-8:]:
        role    = "assistant" if h.get("role") in ("ai", "assistant") else "user"
        content = h.get("content", "").strip()
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": req.message})

    async def stream_response():
        try:
            response = client.chat.completions.create(
                model=MODEL, max_tokens=600, messages=messages, stream=True
            )
            for chunk in response:
                delta = chunk.choices[0].delta
                text  = delta.content if delta.content else ""
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'text': f'**Error:** {str(e)}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


@app.post("/api/quick-analysis")
async def quick_analysis(req: QuickAnalysisRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    sess   = sessions[req.session_id]
    client = get_groq_client()

    prompts = {
        "full":         "Give a full analysis:\n## Quality\n## Top Stats\n## Key Insights (3 bullets with numbers)\n## Recommended Actions\nUse exact column names and values.",
        "insights":     "List exactly 5 insights. Each: **bold headline** + one sentence with specific numbers. No filler.",
        "anomalies":    "List all outliers/anomalies found. For each: column name, count/value, and whether to remove or investigate.",
        "correlations": "List all correlations above 0.4. Format each as: `col1 ↔ col2: r=X.XX` — one sentence of explanation.",
        "viz":          "Suggest 5 visualizations. Each on one line: **Chart type** — X: col — Y: col — insight it reveals.",
        "clean":        "Audit data quality. For each issue: [HIGH/MED/LOW] | column | problem | recommended fix.",
    }

    system_msg = (
        "You are a concise data analyst. Use this dataset:\n\n"
        + sess["summary"]
        + "\n\nAnswer in markdown. Use exact column names. Keep under 300 words."
    )

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user",   "content": prompts.get(req.analysis_type, prompts["full"])},
    ]

    async def stream_response():
        try:
            response = client.chat.completions.create(
                model=MODEL, max_tokens=700, messages=messages, stream=True
            )
            for chunk in response:
                delta = chunk.choices[0].delta
                text  = delta.content if delta.content else ""
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'text': f'**Error:** {str(e)}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ── NEW: Schema inspection endpoint ───────────────────────────────────────────

@app.get("/api/schema/{session_id}")
def get_schema(session_id: str):
    """Returns the full schema with DuckDB-inferred types for the uploaded dataset."""
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    sess = sessions[session_id]
    df   = sess["df"]

    con = duckdb.connect()
    con.register("df", df)
    schema_result = con.execute("DESCRIBE df").df()
    con.close()

    return {
        "session_id":  session_id,
        "filename":    sess["filename"],
        "rows":        len(df),
        "duckdb_schema": json.loads(schema_result.to_json(orient="records")),
        "col_types":   sess["col_types"],
    }


# ── NEW: Raw SQL execution endpoint ───────────────────────────────────────────

class RawSQLRequest(BaseModel):
    session_id: str
    sql: str


@app.post("/api/sql")
def run_raw_sql(req: RawSQLRequest):
    """
    Execute a raw DuckDB SQL query directly against the uploaded DataFrame.
    The table is always named `df`.
    Useful for power users who want to write their own SQL.
    """
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found — please upload a dataset first.")

    sess = sessions[req.session_id]
    df   = sess["df"]

    # Basic safety: block mutating statements
    sql_upper = req.sql.strip().upper()
    forbidden = ("DROP ", "DELETE ", "INSERT ", "UPDATE ", "ALTER ", "CREATE ", "TRUNCATE ")
    for kw in forbidden:
        if sql_upper.startswith(kw) or f" {kw}" in sql_upper:
            raise HTTPException(400, f"Mutating SQL statements are not allowed: {kw.strip()}")

    try:
        result_df = execute_sql_on_df(req.sql.rstrip(";"), df)
    except Exception as e:
        raise HTTPException(400, f"SQL execution error: {str(e)}")

    table_md  = result_to_markdown_table(result_df)
    rows_json = result_to_json(result_df)

    return {
        "sql":       req.sql,
        "table":     table_md,
        "rows":      rows_json,
        "row_count": len(rows_json),
        "engine":    "duckdb",
    }