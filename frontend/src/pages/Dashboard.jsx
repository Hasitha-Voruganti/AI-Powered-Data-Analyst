import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line, Scatter, Pie } from "react-chartjs-2";
import {
  getData,
  getChartData,
  cleanData,
  exportCsvUrl,
  streamChat,
  streamQuickAnalysis,
} from "../utils/api.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
);

// ── Constants ────────────────────────────────────────────────────────────────
const PALETTE = [
  "#6d5aff",
  "#00e5a0",
  "#ffb547",
  "#4da8ff",
  "#ff6eb4",
  "#00d4ff",
  "#ff5757",
  "#a99dff",
  "#ff9f40",
  "#66d9e8",
];

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { color: "#9999bb", font: { size: 11 } } },
    tooltip: {
      backgroundColor: "#14141f",
      titleColor: "#eeeef8",
      bodyColor: "#9999bb",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 0.5,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      ticks: { color: "#9999bb", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,0.04)" },
      border: { color: "rgba(255,255,255,0.06)" },
    },
    y: {
      ticks: { color: "#9999bb", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,0.04)" },
      border: { color: "rgba(255,255,255,0.06)" },
    },
  },
};

const TABS = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "table", label: "Data Table", icon: "⊞" },
  { id: "visualize", label: "Visualize", icon: "◉" },
  { id: "cleaning", label: "Cleaning", icon: "✦" },
  { id: "chat", label: "AI Chat", icon: "◎" },
];

const CHART_TYPES = [
  { type: "bar", label: "Bar", icon: "▊" },
  { type: "line", label: "Line", icon: "◌" },
  { type: "scatter", label: "Scatter", icon: "⋮" },
  { type: "pie", label: "Pie", icon: "◑" },
  { type: "histogram", label: "Histogram", icon: "▤" },
  { type: "correlation", label: "Heatmap", icon: "⧉" },
];

const QUICK_ACTIONS = [
  { type: "full", label: "Full Analysis", icon: "🔍" },
  { type: "insights", label: "Key Insights", icon: "💡" },
  { type: "anomalies", label: "Anomalies", icon: "⚠️" },
  { type: "correlations", label: "Correlations", icon: "🔗" },
  { type: "viz", label: "Suggest Charts", icon: "📊" },
  { type: "clean", label: "Clean Audit", icon: "🧹" },
];

// ── Small components ─────────────────────────────────────────────────────────
function QualityGauge({ score }) {
  const color = score >= 80 ? "#00e5a0" : score >= 60 ? "#ffb547" : "#ff5757";
  const label =
    score >= 80
      ? "Excellent"
      : score >= 60
        ? "Good"
        : score >= 40
          ? "Fair"
          : "Poor";
  const r = 26,
    circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}
      >
        <svg
          viewBox="0 0 64 64"
          style={{ transform: "rotate(-90deg)", width: 56, height: 56 }}
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${(circ * score) / 100} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color,
          }}
        >
          {score}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: 11, color: "#9999bb" }}>Quality</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#6d5aff" }) {
  return (
    <div
      style={{
        background: "#0e0e1a",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#55556a",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className="font-display"
        style={{ fontSize: 24, fontWeight: 700, color }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#9999bb", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        border: "2px solid rgba(109,90,255,0.3)",
        borderTopColor: "#6d5aff",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#6d5aff",
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function CorrelationHeatmap({ cols, matrix }) {
  if (!cols?.length)
    return (
      <div style={{ color: "#9999bb", padding: 16 }}>
        Need ≥ 2 numeric columns
      </div>
    );
  const color = (v) =>
    v > 0.7
      ? "#00e5a0"
      : v > 0.3
        ? "#6d5aff"
        : v < -0.7
          ? "#ff5757"
          : v < -0.3
            ? "#ffb547"
            : "#333348";
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: 6, color: "#55556a" }} />
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  padding: "4px 8px",
                  color: "#9999bb",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  maxWidth: 90,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.slice(0, 12)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td
                style={{
                  padding: "4px 8px",
                  color: "#9999bb",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {cols[i]?.slice(0, 12)}
              </td>
              {row.map((v, j) => (
                <td
                  key={j}
                  title={`${cols[i]} ↔ ${cols[j]}: ${v}`}
                  style={{
                    padding: 6,
                    background: color(v) + "28",
                    border: "0.5px solid rgba(255,255,255,0.03)",
                    textAlign: "center",
                    color: color(v),
                    fontWeight: v === 1 ? 700 : 400,
                    borderRadius: 4,
                    minWidth: 48,
                  }}
                >
                  {Number(v).toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 14,
          fontSize: 11,
          color: "#9999bb",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#00e5a0" }}>● Strong positive (&gt;0.7)</span>
        <span style={{ color: "#6d5aff" }}>● Moderate positive</span>
        <span style={{ color: "#ffb547" }}>● Moderate negative</span>
        <span style={{ color: "#ff5757" }}>● Strong negative (&lt;-0.7)</span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ session, onReset }) {
  const [tab, setTab] = useState("overview");
  const [sessionData, setSessionData] = useState(session);
  const [tableData, setTableData] = useState({
    rows: [],
    total: 0,
    page: 1,
    total_pages: 1,
  });
  const [chartCfg, setChartCfg] = useState({
    type: "bar",
    x: session.columns[0] || "",
    y: "",
  });
  const [chartData, setChartData] = useState(null);
  const [corrData, setCorrData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [cleanLog, setCleanLog] = useState([]);
  const [hasBeenCleaned, setHasBeenCleaned] = useState(false); // ← NEW: track if cleaning was done
  const [downloadingClean, setDownloadingClean] = useState(false); // ← NEW: download button loading state
  const [messages, setMessages] = useState([
    {
      role: "ai",
      content: `## Welcome to DataMind!\n\nI've analysed **${session.filename}** — **${session.rows.toLocaleString()} rows × ${session.columns.length} columns**.\n\n**Quality score: ${session.quality.score}/100** | ${session.quality.issues.length} issue(s) found.\n\nAsk me anything, or use the quick actions in the sidebar!`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const numCols = sessionData.columns.filter(
    (c) => sessionData.col_types[c] === "number",
  );
  const strCols = sessionData.columns.filter(
    (c) => sessionData.col_types[c] === "string",
  );

  useEffect(() => {
    if (!chartCfg.y && numCols.length)
      setChartCfg((c) => ({ ...c, y: numCols[0] }));
  }, [numCols.length]);

  useEffect(() => {
    if (tab === "table") loadTable(1);
  }, [tab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadTable(page) {
    try {
      const { data } = await getData(session.session_id, page);
      setTableData(data);
    } catch {
      toast.error("Failed to load table data");
    }
  }

  // ── NEW: Download cleaned CSV directly in browser ──────────────────────────
  async function downloadCleanedCsv() {
    setDownloadingClean(true);
    try {
      const url = exportCsvUrl(session.session_id);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `cleaned_${session.filename.replace(/\.(xlsx|xls)$/i, ".csv")}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success("✓ Cleaned data downloaded!");
    } catch (e) {
      toast.error("Download failed: " + e.message);
    }
    setDownloadingClean(false);
  }

  // ── Chart ──
  async function loadChart() {
    if (!chartCfg.x) return;
    setChartLoading(true);
    setChartData(null);
    setCorrData(null);
    try {
      if (chartCfg.type === "correlation") {
        const { data } = await getChartData(session.session_id, {
          chart_type: "correlation",
          x: numCols[0] || sessionData.columns[0],
        });
        setCorrData(data);
      } else {
        const params = { chart_type: chartCfg.type, x: chartCfg.x };
        if (chartCfg.y && !["pie", "histogram"].includes(chartCfg.type))
          params.y = chartCfg.y;
        const { data } = await getChartData(session.session_id, params);
        setChartData(data);
      }
    } catch (e) {
      toast.error("Chart error: " + (e.response?.data?.detail || e.message));
    }
    setChartLoading(false);
  }

  function buildChart() {
    if (!chartData) return null;
    const isPie = ["pie", "donut"].includes(chartCfg.type);
    const ds = (chartData.datasets || []).map((d, i) => ({
      backgroundColor: isPie
        ? PALETTE.map((c) => c + "cc")
        : PALETTE[i % PALETTE.length] + "88",
      borderColor: isPie
        ? PALETTE.map((c) => c + "ff")
        : PALETTE[i % PALETTE.length],
      borderWidth: 1.5,
      borderRadius: chartCfg.type === "bar" ? 4 : 0,
      tension: 0.4,
      pointRadius: 3,
      ...d,
    }));
    const chartObj = { labels: chartData.labels || [], datasets: ds };
    const opts = isPie ? { ...CHART_OPTIONS, scales: {} } : CHART_OPTIONS;
    if (chartCfg.type === "bar") return <Bar data={chartObj} options={opts} />;
    if (chartCfg.type === "line")
      return <Line data={chartObj} options={opts} />;
    if (chartCfg.type === "scatter")
      return <Scatter data={{ datasets: ds }} options={CHART_OPTIONS} />;
    if (chartCfg.type === "pie") return <Pie data={chartObj} options={opts} />;
    if (chartCfg.type === "histogram")
      return <Bar data={chartObj} options={opts} />;
    return null;
  }

  // ── Cleaning ──
  async function applyAutoClean() {
    const ops = [];
    if (sessionData.quality.dup_count > 0)
      ops.push({ type: "drop_duplicates" });
    sessionData.quality.issues.forEach((issue) => {
      if (issue.type === "missing" && issue.column) {
        ops.push({
          type:
            sessionData.col_types[issue.column] === "number"
              ? "fill_median"
              : "fill_mode",
          column: issue.column,
        });
      }
      if (issue.type === "outlier" && issue.column) {
        ops.push({ type: "clip_outliers", column: issue.column });
      }
    });
    if (!ops.length) {
      toast.success("Data is already clean!");
      return;
    }
    try {
      const { data } = await cleanData(session.session_id, ops);
      setSessionData((d) => ({
        ...d,
        quality: data.quality,
        stats: data.stats,
        col_types: data.col_types,
        rows: data.rows,
        columns: data.columns,
      }));
      setCleanLog(data.log);
      setHasBeenCleaned(true); // ← mark as cleaned
      if (tab === "table") loadTable(1);
      toast.success(`✓ ${ops.length} operations applied — data cleaned!`);
    } catch (e) {
      toast.error(
        "Cleaning failed: " + (e.response?.data?.detail || e.message),
      );
    }
  }

  // ── AI Chat ──
  function appendAiChunk(chunk) {
    setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      if (last?.role === "ai" && last.streaming) {
        return [
          ...msgs.slice(0, -1),
          { ...last, content: last.content + chunk },
        ];
      }
      return msgs;
    });
  }

  function finaliseAiMsg() {
    setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      if (last?.role === "ai")
        return [...msgs.slice(0, -1), { ...last, streaming: false }];
      return msgs;
    });
    setChatLoading(false);
  }

  async function sendChat(textOverride) {
    const text = (textOverride || chatInput).trim();
    if (!text || chatLoading) return;
    setChatInput("");
    const history = messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "ai", content: "", streaming: true },
    ]);
    setChatLoading(true);
    await streamChat(
      session.session_id,
      text,
      history,
      appendAiChunk,
      finaliseAiMsg,
    );
  }

  async function runQuickAnalysis(type) {
    setTab("chat");
    if (chatLoading) return;
    const label = QUICK_ACTIONS.find((a) => a.type === type)?.label || type;
    setMessages((m) => [
      ...m,
      { role: "user", content: `Run: ${label}` },
      { role: "ai", content: "", streaming: true },
    ]);
    setChatLoading(true);
    await streamQuickAnalysis(
      session.session_id,
      type,
      appendAiChunk,
      finaliseAiMsg,
    );
  }

  // ── Render helpers ──
  const sidebarBtn = (onClick, children, active = false) => (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "9px 14px",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: active ? "rgba(109,90,255,0.12)" : "transparent",
        borderLeft: `2px solid ${active ? "#6d5aff" : "transparent"}`,
        border: "none",
        color: active ? "#a99dff" : "#666688",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );

  const card = (content, style = {}) => (
    <div
      style={{
        background: "#0e0e1a",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      {content}
    </div>
  );

  // ── JSX ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 18px",
          height: 52,
          borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          background: "#0e0e1a",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg,#6d5aff,#00e5a0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            📊
          </div>
          <span
            className="font-display"
            style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}
          >
            DataMind
          </span>
        </div>
        <div
          style={{
            width: "0.5px",
            height: 20,
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 11px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 20,
            border: "0.5px solid rgba(255,255,255,0.07)",
          }}
        >
          <span>📄</span>
          <span
            style={{
              fontSize: 12,
              color: "#9999bb",
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {session.filename}
          </span>
          <span style={{ fontSize: 11, color: "#44445a" }}>·</span>
          <span
            className="font-mono"
            style={{ fontSize: 11, color: "#6d5aff" }}
          >
            {sessionData.rows.toLocaleString()}r × {sessionData.columns.length}c
          </span>
        </div>
        <QualityGauge score={sessionData.quality.score} />
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* ── Header export button: shows "Cleaned" badge when data has been cleaned ── */}
          <button
            onClick={downloadCleanedCsv}
            disabled={downloadingClean}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 13px",
              borderRadius: 8,
              background: hasBeenCleaned
                ? "rgba(0,229,160,0.12)"
                : "rgba(255,255,255,0.04)",
              border: `0.5px solid ${hasBeenCleaned ? "rgba(0,229,160,0.35)" : "rgba(255,255,255,0.09)"}`,
              color: hasBeenCleaned ? "#00e5a0" : "#9999bb",
              fontSize: 12,
              fontWeight: 500,
              cursor: downloadingClean ? "wait" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {downloadingClean ? <Spinner /> : "⬇"}
            {hasBeenCleaned ? "Download Cleaned CSV" : "Export CSV"}
            {hasBeenCleaned && (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 20,
                  background: "rgba(0,229,160,0.2)",
                  color: "#00e5a0",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                CLEANED
              </span>
            )}
          </button>

          <button
            onClick={onReset}
            style={{
              padding: "5px 13px",
              borderRadius: 8,
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.09)",
              color: "#9999bb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← New
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 196,
            borderRight: "0.5px solid rgba(255,255,255,0.06)",
            background: "#0a0a10",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "10px 0" }}>
            {TABS.map((t) =>
              sidebarBtn(
                () => setTab(t.id),
                <>
                  <span style={{ fontSize: 13 }}>{t.icon}</span>
                  {t.label}
                </>,
                tab === t.id,
              ),
            )}
          </div>
          <div
            style={{
              padding: "10px 10px 16px",
              borderTop: "0.5px solid rgba(255,255,255,0.06)",
              marginTop: "auto",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#33334a",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
                paddingLeft: 4,
              }}
            >
              AI Quick Actions
            </div>
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.type}
                onClick={() => runQuickAnalysis(a.type)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  color: "#9999bb",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 7,
                  transition: "all 0.12s",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(109,90,255,0.09)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <span style={{ fontSize: 13 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", background: "#080810" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* ── OVERVIEW ── */}
              {tab === "overview" && (
                <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
                  <h2
                    className="font-display"
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      marginBottom: 18,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Dataset Overview
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    <StatCard
                      label="Total Rows"
                      value={sessionData.rows.toLocaleString()}
                      sub="records"
                    />
                    <StatCard
                      label="Columns"
                      value={sessionData.columns.length}
                      sub={`${numCols.length} numeric · ${strCols.length} text`}
                      color="#00e5a0"
                    />
                    <StatCard
                      label="Missing"
                      value={sessionData.quality.null_count}
                      sub={`${sessionData.quality.missing_rate}% rate`}
                      color={
                        sessionData.quality.null_count > 0
                          ? "#ffb547"
                          : "#00e5a0"
                      }
                    />
                    <StatCard
                      label="Duplicates"
                      value={sessionData.quality.dup_count}
                      sub={
                        sessionData.quality.dup_count
                          ? "to remove"
                          : "none found"
                      }
                      color={
                        sessionData.quality.dup_count ? "#ff5757" : "#00e5a0"
                      }
                    />
                    <StatCard
                      label="Issues"
                      value={sessionData.quality.issues.length}
                      sub="quality issues"
                      color={
                        sessionData.quality.issues.length > 2
                          ? "#ff5757"
                          : "#ffb547"
                      }
                    />
                  </div>

                  {Object.keys(sessionData.stats).length > 0 && (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#55556a",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        Numeric Statistics{" "}
                        <div
                          style={{
                            flex: 1,
                            height: "0.5px",
                            background: "rgba(255,255,255,0.05)",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          overflowX: "auto",
                          borderRadius: 10,
                          border: "0.5px solid rgba(255,255,255,0.06)",
                          marginBottom: 24,
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                          }}
                        >
                          <thead>
                            <tr style={{ background: "#0e0e1a" }}>
                              {[
                                "Column",
                                "Mean",
                                "Median",
                                "Std Dev",
                                "Min",
                                "Max",
                                "Outliers",
                                "Skewness",
                              ].map((h) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: "9px 12px",
                                    textAlign: "left",
                                    color: "#44445a",
                                    fontWeight: 600,
                                    fontSize: 10,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    borderBottom:
                                      "0.5px solid rgba(255,255,255,0.05)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(sessionData.stats).map(
                              ([col, s]) => (
                                <tr
                                  key={col}
                                  style={{
                                    borderBottom:
                                      "0.5px solid rgba(255,255,255,0.03)",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "rgba(109,90,255,0.04)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  <td
                                    className="font-mono"
                                    style={{
                                      padding: "8px 12px",
                                      fontWeight: 600,
                                      color: "#a99dff",
                                      fontSize: 11,
                                    }}
                                  >
                                    {col}
                                  </td>
                                  {[s.mean, s.median, s.std, s.min, s.max].map(
                                    (v, i) => (
                                      <td
                                        key={i}
                                        className="font-mono"
                                        style={{
                                          padding: "8px 12px",
                                          color: "#eeeef8",
                                        }}
                                      >
                                        {v}
                                      </td>
                                    ),
                                  )}
                                  <td style={{ padding: "8px 12px" }}>
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 20,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        background:
                                          s.outliers > 0
                                            ? "rgba(255,181,71,0.15)"
                                            : "rgba(0,229,160,0.1)",
                                        color:
                                          s.outliers > 0
                                            ? "#ffb547"
                                            : "#00e5a0",
                                      }}
                                    >
                                      {s.outliers}
                                    </span>
                                  </td>
                                  <td
                                    className="font-mono"
                                    style={{
                                      padding: "8px 12px",
                                      color:
                                        Math.abs(s.skewness) > 1
                                          ? "#ffb547"
                                          : "#9999bb",
                                    }}
                                  >
                                    {s.skewness}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {Object.keys(sessionData.correlations).length >= 2 && (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#55556a",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        Correlation Matrix{" "}
                        <div
                          style={{
                            flex: 1,
                            height: "0.5px",
                            background: "rgba(255,255,255,0.05)",
                          }}
                        />
                      </div>
                      {card(
                        <CorrelationHeatmap
                          cols={Object.keys(sessionData.correlations)}
                          matrix={Object.keys(sessionData.correlations).map(
                            (c) =>
                              Object.keys(sessionData.correlations).map(
                                (r) => sessionData.correlations[c][r] || 0,
                              ),
                          )}
                        />,
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── DATA TABLE ── */}
              {tab === "table" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 18px",
                      borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "#0a0a10",
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#9999bb" }}>
                      Page {tableData.page} of {tableData.total_pages} ·{" "}
                      {tableData.total.toLocaleString()} rows total
                    </span>
                    <div
                      style={{ marginLeft: "auto", display: "flex", gap: 6 }}
                    >
                      {[
                        [
                          "← Prev",
                          tableData.page <= 1,
                          () => loadTable(tableData.page - 1),
                        ],
                        [
                          "Next →",
                          tableData.page >= tableData.total_pages,
                          () => loadTable(tableData.page + 1),
                        ],
                      ].map(([label, disabled, fn]) => (
                        <button
                          key={label}
                          disabled={disabled}
                          onClick={fn}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 7,
                            background: "rgba(255,255,255,0.04)",
                            border: "0.5px solid rgba(255,255,255,0.08)",
                            color: disabled ? "#33334a" : "#eeeef8",
                            fontSize: 12,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflow: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                        <tr style={{ background: "#0e0e1a" }}>
                          <th
                            style={{
                              padding: "9px 12px",
                              color: "#33334a",
                              fontSize: 10,
                              borderBottom:
                                "0.5px solid rgba(255,255,255,0.05)",
                              textAlign: "left",
                            }}
                          >
                            #
                          </th>
                          {sessionData.columns.map((c) => (
                            <th
                              key={c}
                              style={{
                                padding: "9px 12px",
                                textAlign: "left",
                                color: "#55556a",
                                fontWeight: 600,
                                fontSize: 10,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderBottom:
                                  "0.5px solid rgba(255,255,255,0.05)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c}
                              <span
                                style={{
                                  marginLeft: 5,
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background:
                                    sessionData.col_types[c] === "number"
                                      ? "rgba(109,90,255,0.2)"
                                      : "rgba(0,229,160,0.1)",
                                  color:
                                    sessionData.col_types[c] === "number"
                                      ? "#8b75ff"
                                      : "#00c484",
                                  fontSize: 9,
                                }}
                              >
                                {sessionData.col_types[c] === "number"
                                  ? "#"
                                  : sessionData.col_types[c] === "date"
                                    ? "D"
                                    : "T"}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom:
                                "0.5px solid rgba(255,255,255,0.03)",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(109,90,255,0.04)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <td
                              className="font-mono"
                              style={{
                                padding: "7px 12px",
                                color: "#2a2a3a",
                                fontSize: 10,
                              }}
                            >
                              {(tableData.page - 1) * 100 + i + 1}
                            </td>
                            {sessionData.columns.map((c) => {
                              const v = row[c];
                              const isNull = v === null || v === undefined;
                              return (
                                <td
                                  key={c}
                                  style={{
                                    padding: "7px 12px",
                                    color: isNull ? "#ff575755" : "#eeeef8",
                                    fontStyle: isNull ? "italic" : "normal",
                                    maxWidth: 180,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontFamily:
                                      sessionData.col_types[c] === "number"
                                        ? "'JetBrains Mono',monospace"
                                        : "inherit",
                                  }}
                                >
                                  {isNull ? "null" : String(v)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {tableData.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={sessionData.columns.length + 1}
                              style={{
                                padding: 40,
                                textAlign: "center",
                                color: "#55556a",
                              }}
                            >
                              Loading…
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── VISUALIZE ── */}
              {tab === "visualize" && (
                <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      flexWrap: "wrap",
                      marginBottom: 22,
                      alignItems: "flex-end",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#55556a",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 8,
                        }}
                      >
                        Chart Type
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {CHART_TYPES.map((ct) => (
                          <button
                            key={ct.type}
                            onClick={() =>
                              setChartCfg((c) => ({ ...c, type: ct.type }))
                            }
                            style={{
                              padding: "6px 11px",
                              borderRadius: 8,
                              border: `0.5px solid ${chartCfg.type === ct.type ? "#6d5aff" : "rgba(255,255,255,0.08)"}`,
                              background:
                                chartCfg.type === ct.type
                                  ? "rgba(109,90,255,0.15)"
                                  : "rgba(255,255,255,0.03)",
                              color:
                                chartCfg.type === ct.type
                                  ? "#a99dff"
                                  : "#9999bb",
                              fontSize: 11,
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <span style={{ fontSize: 15 }}>{ct.icon}</span>
                            <span>{ct.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {chartCfg.type !== "correlation" && (
                      <div style={{ display: "flex", gap: 10 }}>
                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#55556a",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.07em",
                              marginBottom: 8,
                            }}
                          >
                            X Axis
                          </div>
                          <select
                            value={chartCfg.x}
                            onChange={(e) =>
                              setChartCfg((c) => ({ ...c, x: e.target.value }))
                            }
                            style={{
                              padding: "7px 11px",
                              borderRadius: 8,
                              border: "0.5px solid rgba(255,255,255,0.1)",
                              background: "#0e0e1a",
                              color: "#eeeef8",
                              fontSize: 13,
                              outline: "none",
                              minWidth: 130,
                            }}
                          >
                            {sessionData.columns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        {!["pie", "histogram"].includes(chartCfg.type) && (
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#55556a",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.07em",
                                marginBottom: 8,
                              }}
                            >
                              Y Axis
                            </div>
                            <select
                              value={chartCfg.y}
                              onChange={(e) =>
                                setChartCfg((c) => ({
                                  ...c,
                                  y: e.target.value,
                                }))
                              }
                              style={{
                                padding: "7px 11px",
                                borderRadius: 8,
                                border: "0.5px solid rgba(255,255,255,0.1)",
                                background: "#0e0e1a",
                                color: "#eeeef8",
                                fontSize: 13,
                                outline: "none",
                                minWidth: 130,
                              }}
                            >
                              <option value="">— none —</option>
                              {numCols.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={loadChart}
                      disabled={chartLoading}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 8,
                        background: "linear-gradient(135deg,#6d5aff,#8b75ff)",
                        border: "none",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        alignSelf: "flex-end",
                      }}
                    >
                      {chartLoading ? (
                        <>
                          <Spinner /> Plotting…
                        </>
                      ) : (
                        "Plot ↗"
                      )}
                    </button>
                  </div>

                  {corrData &&
                    chartCfg.type === "correlation" &&
                    card(
                      <>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 14,
                          }}
                        >
                          Correlation Heatmap
                        </div>
                        <CorrelationHeatmap
                          cols={corrData.cols}
                          matrix={corrData.matrix}
                        />
                      </>,
                    )}

                  {chartData &&
                    chartCfg.type !== "correlation" &&
                    card(buildChart())}

                  {!chartData && !corrData && !chartLoading && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 280,
                        color: "#55556a",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 48, opacity: 0.3 }}>◉</div>
                      <p>Select chart options above and click Plot</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── CLEANING ── */}
              {tab === "cleaning" && (
                <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 18,
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <h2
                      className="font-display"
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Data Cleaning
                    </h2>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      {/* ── Download Cleaned CSV button — only shown after cleaning ── */}
                      {hasBeenCleaned && (
                        <button
                          onClick={downloadCleanedCsv}
                          disabled={downloadingClean}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "8px 18px",
                            borderRadius: 8,
                            background: "rgba(0,229,160,0.1)",
                            border: "0.5px solid rgba(0,229,160,0.35)",
                            color: "#00e5a0",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: downloadingClean ? "wait" : "pointer",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (!downloadingClean)
                              e.currentTarget.style.background =
                                "rgba(0,229,160,0.18)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              "rgba(0,229,160,0.1)";
                          }}
                        >
                          {downloadingClean ? (
                            <>
                              <Spinner /> Preparing…
                            </>
                          ) : (
                            <>⬇ Download Cleaned CSV</>
                          )}
                        </button>
                      )}

                      <button
                        onClick={applyAutoClean}
                        style={{
                          padding: "8px 18px",
                          borderRadius: 8,
                          background: hasBeenCleaned
                            ? "rgba(255,255,255,0.08)"
                            : "linear-gradient(135deg,#6d5aff,#00e5a0)",
                          border: "0.5px solid rgba(255,255,255,0.1)",
                          color: hasBeenCleaned ? "#9999bb" : "#000",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {hasBeenCleaned
                          ? "✓ Already Cleaned"
                          : "✨ Auto-Clean All"}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                      gap: 10,
                      marginBottom: 22,
                    }}
                  >
                    <StatCard
                      label="Quality Score"
                      value={`${sessionData.quality.score}/100`}
                      color={
                        sessionData.quality.score >= 80 ? "#00e5a0" : "#ffb547"
                      }
                    />
                    <StatCard
                      label="Missing Cells"
                      value={sessionData.quality.null_count}
                      sub={`${sessionData.quality.missing_rate}%`}
                      color="#ffb547"
                    />
                    <StatCard
                      label="Affected Cols"
                      value={
                        Object.values(
                          sessionData.quality.null_by_col || {},
                        ).filter((v) => v > 0).length
                      }
                      color="#ffb547"
                    />
                    <StatCard
                      label="Duplicate Rows"
                      value={sessionData.quality.dup_count}
                      color={
                        sessionData.quality.dup_count > 0
                          ? "#ff5757"
                          : "#00e5a0"
                      }
                    />
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#55556a",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      marginBottom: 10,
                    }}
                  >
                    Issues Detected
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      marginBottom: 22,
                    }}
                  >
                    {sessionData.quality.issues.length === 0 ? (
                      <div
                        style={{
                          padding: 18,
                          background: "rgba(0,229,160,0.05)",
                          border: "0.5px solid rgba(0,229,160,0.18)",
                          borderRadius: 10,
                          color: "#00e5a0",
                          textAlign: "center",
                          fontSize: 13,
                        }}
                      >
                        ✓ No issues — dataset is clean!
                      </div>
                    ) : (
                      sessionData.quality.issues.map((issue, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 11,
                            padding: "11px 14px",
                            background: "#0e0e1a",
                            border: `0.5px solid ${issue.severity === "high" ? "rgba(255,87,87,0.18)" : "rgba(255,181,71,0.18)"}`,
                            borderRadius: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background:
                                issue.severity === "high"
                                  ? "#ff5757"
                                  : issue.severity === "medium"
                                    ? "#ffb547"
                                    : "#6d5aff",
                              marginTop: 5,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: "#eeeef8",
                                marginBottom: 2,
                              }}
                            >
                              {issue.type === "missing" &&
                                `Missing values in "${issue.column}"`}
                              {issue.type === "outlier" &&
                                `Outliers in "${issue.column}"`}
                              {issue.type === "duplicate" &&
                                "Duplicate rows detected"}
                            </div>
                            <div style={{ fontSize: 12, color: "#9999bb" }}>
                              {issue.message}
                            </div>
                          </div>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background:
                                issue.severity === "high"
                                  ? "rgba(255,87,87,0.13)"
                                  : "rgba(255,181,71,0.13)",
                              color:
                                issue.severity === "high"
                                  ? "#ff5757"
                                  : "#ffb547",
                            }}
                          >
                            {issue.severity}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {cleanLog.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#55556a",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 10,
                        }}
                      >
                        ✓ Cleaning Log — {cleanLog.length} operations
                      </div>
                      <div
                        style={{
                          background: "#0a0a10",
                          borderRadius: 10,
                          border: "0.5px solid rgba(0,229,160,0.12)",
                          padding: 14,
                        }}
                      >
                        {cleanLog.map((entry, i) => {
                          let msg = "";
                          if (entry.op === "drop_duplicates")
                            msg = `Removed ${entry.removed} duplicate rows`;
                          else if (entry.op === "fill_median")
                            msg = `"${entry.column}": filled ${entry.filled} nulls → median = ${entry.value}`;
                          else if (entry.op === "fill_mean")
                            msg = `"${entry.column}": filled ${entry.filled} nulls → mean = ${entry.value}`;
                          else if (entry.op === "fill_mode")
                            msg = `"${entry.column}": filled ${entry.filled} nulls → mode = "${entry.value}"`;
                          else if (entry.op === "clip_outliers")
                            msg = `"${entry.column}": clipped ${entry.clipped} outliers → [${entry.range?.[0]}, ${entry.range?.[1]}]`;
                          else if (entry.op === "drop_nulls")
                            msg = `"${entry.column}": dropped ${entry.removed} null rows`;
                          else if (entry.op === "drop_column")
                            msg = `Dropped column "${entry.column}"`;
                          return (
                            <div
                              key={i}
                              className="font-mono"
                              style={{
                                padding: "4px 0",
                                borderBottom:
                                  "0.5px solid rgba(255,255,255,0.04)",
                                color: "#00e5a0",
                                fontSize: 12,
                                display: "flex",
                                gap: 8,
                              }}
                            >
                              <span style={{ color: "#00c484", flexShrink: 0 }}>
                                ✓
                              </span>
                              <span>{msg}</span>
                            </div>
                          );
                        })}
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: "0.5px solid rgba(255,255,255,0.05)",
                            fontSize: 11,
                            color: "#9999bb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          <span>
                            Updated quality score:{" "}
                            <span style={{ color: "#00e5a0", fontWeight: 700 }}>
                              {sessionData.quality.score}/100
                            </span>
                            {" · "}Remaining issues:{" "}
                            <span
                              style={{
                                color: sessionData.quality.issues.length
                                  ? "#ffb547"
                                  : "#00e5a0",
                              }}
                            >
                              {sessionData.quality.issues.length}
                            </span>
                          </span>
                          {/* ── Inline download shortcut inside the log box ── */}
                          <button
                            onClick={downloadCleanedCsv}
                            disabled={downloadingClean}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "5px 14px",
                              borderRadius: 7,
                              background: "rgba(0,229,160,0.08)",
                              border: "0.5px solid rgba(0,229,160,0.25)",
                              color: "#00e5a0",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: downloadingClean ? "wait" : "pointer",
                            }}
                          >
                            {downloadingClean ? <Spinner /> : "⬇"} Download
                            cleaned_
                            {session.filename.replace(/\.(xlsx|xls)$/i, ".csv")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── AI CHAT ── */}
              {tab === "chat" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "18px 22px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {messages.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          display: "flex",
                          gap: 10,
                          maxWidth: "88%",
                          alignSelf:
                            msg.role === "user" ? "flex-end" : "flex-start",
                          flexDirection:
                            msg.role === "user" ? "row-reverse" : "row",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            background:
                              msg.role === "ai"
                                ? "linear-gradient(135deg,#6d5aff,#00e5a0)"
                                : "rgba(255,255,255,0.06)",
                            border: "0.5px solid rgba(255,255,255,0.09)",
                            marginTop: 2,
                          }}
                        >
                          {msg.role === "ai" ? "◎" : "◈"}
                        </div>
                        <div
                          style={{
                            padding: "10px 14px",
                            borderRadius:
                              msg.role === "user"
                                ? "14px 4px 14px 14px"
                                : "4px 14px 14px 14px",
                            background:
                              msg.role === "user"
                                ? "linear-gradient(135deg,#6d5aff,#7d6dff)"
                                : "#0e0e1a",
                            border:
                              msg.role === "ai"
                                ? "0.5px solid rgba(255,255,255,0.06)"
                                : "none",
                            color: "#eeeef8",
                            fontSize: 13,
                            lineHeight: 1.7,
                            maxWidth: "100%",
                            minWidth: 40,
                          }}
                        >
                          {msg.streaming && !msg.content ? (
                            <TypingDots />
                          ) : (
                            <div>
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => (
                                    <p style={{ margin: "4px 0" }}>
                                      {children}
                                    </p>
                                  ),
                                  strong: ({ children }) => (
                                    <strong
                                      style={{
                                        color:
                                          msg.role === "user"
                                            ? "#fff"
                                            : "#a99dff",
                                      }}
                                    >
                                      {children}
                                    </strong>
                                  ),
                                  code: ({ children }) => (
                                    <code
                                      style={{
                                        background: "#14141f",
                                        padding: "1px 5px",
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontFamily:
                                          "'JetBrains Mono',monospace",
                                        color: "#a99dff",
                                      }}
                                    >
                                      {children}
                                    </code>
                                  ),
                                  pre: ({ children }) => (
                                    <pre
                                      style={{
                                        background: "#14141f",
                                        borderRadius: 8,
                                        padding: 10,
                                        overflowX: "auto",
                                        margin: "6px 0",
                                        fontSize: 11,
                                        fontFamily:
                                          "'JetBrains Mono',monospace",
                                      }}
                                    >
                                      {children}
                                    </pre>
                                  ),
                                  ul: ({ children }) => (
                                    <ul
                                      style={{
                                        paddingLeft: 16,
                                        margin: "4px 0",
                                      }}
                                    >
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol
                                      style={{
                                        paddingLeft: 16,
                                        margin: "4px 0",
                                      }}
                                    >
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li style={{ marginBottom: 3 }}>
                                      {children}
                                    </li>
                                  ),
                                  h1: ({ children }) => (
                                    <h1
                                      className="font-display"
                                      style={{
                                        fontSize: 17,
                                        fontWeight: 700,
                                        margin: "8px 0 4px",
                                      }}
                                    >
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2
                                      className="font-display"
                                      style={{
                                        fontSize: 15,
                                        fontWeight: 600,
                                        margin: "8px 0 4px",
                                      }}
                                    >
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        margin: "6px 0 3px",
                                        color: "#a99dff",
                                      }}
                                    >
                                      {children}
                                    </h3>
                                  ),
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                              {msg.streaming && (
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 2,
                                    height: 13,
                                    background: "#6d5aff",
                                    marginLeft: 2,
                                    animation: "pulse 0.9s infinite",
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <div
                    style={{
                      padding: "0 22px 8px",
                      display: "flex",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      "What are the key trends?",
                      "Any data quality issues?",
                      "Which columns correlate?",
                      "Summarize for a non-technical reader",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => sendChat(q)}
                        disabled={chatLoading}
                        style={{
                          padding: "4px 11px",
                          borderRadius: 20,
                          border: "0.5px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.03)",
                          color: "#9999bb",
                          fontSize: 11,
                          cursor: chatLoading ? "not-allowed" : "pointer",
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          if (!chatLoading) {
                            e.target.style.borderColor = "rgba(109,90,255,0.4)";
                            e.target.style.color = "#a99dff";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.borderColor = "rgba(255,255,255,0.08)";
                          e.target.style.color = "#9999bb";
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      padding: "10px 22px",
                      borderTop: "0.5px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      gap: 10,
                      background: "#0a0a10",
                      flexShrink: 0,
                    }}
                  >
                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        setChatInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height =
                          Math.min(e.target.scrollHeight, 120) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChat();
                        }
                      }}
                      placeholder="Ask anything about your data… (Enter to send, Shift+Enter for newline)"
                      rows={1}
                      disabled={chatLoading}
                      style={{
                        flex: 1,
                        background: "#0e0e1a",
                        border: "0.5px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "9px 13px",
                        color: "#eeeef8",
                        fontSize: 13,
                        resize: "none",
                        outline: "none",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) =>
                        (e.target.style.borderColor = "rgba(109,90,255,0.4)")
                      }
                      onBlur={(e) =>
                        (e.target.style.borderColor = "rgba(255,255,255,0.1)")
                      }
                    />
                    <button
                      onClick={() => sendChat()}
                      disabled={chatLoading || !chatInput.trim()}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        border: "none",
                        background:
                          chatLoading || !chatInput.trim()
                            ? "rgba(109,90,255,0.3)"
                            : "linear-gradient(135deg,#6d5aff,#8b75ff)",
                        color: "#fff",
                        cursor:
                          chatLoading || !chatInput.trim()
                            ? "not-allowed"
                            : "pointer",
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.15s",
                      }}
                    >
                      {chatLoading ? <Spinner /> : "↑"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
