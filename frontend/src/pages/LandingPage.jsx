import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { uploadFile } from "../utils/api.js";

export default function LandingPage({ onSession }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  const handleFile = useCallback(
    async (file) => {
      setUploading(true);
      setFileName(file.name);
      setProgress(0);
      try {
        const { data } = await uploadFile(file, setProgress);
        toast.success(
          `Loaded ${data.rows.toLocaleString()} rows × ${data.columns.length} columns`,
        );
        onSession(data);
      } catch (e) {
        toast.error(
          e.response?.data?.detail || "Upload failed — check file format",
        );
        setUploading(false);
      }
    },
    [onSession],
  );

  const onDrop = useCallback(
    (accepted) => {
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: uploading,
    accept: {
      "text/csv": [".csv"],
      "application/json": [".json"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/octet-stream": [".parquet"],
      "application/vnd.apache.parquet": [".parquet"],
    },
  });

  const features = [
    "🧹 Auto-clean",
    "📊 Smart charts",
    "🤖 AI insights",
    "⚠️ Anomaly detection",
    "🔗 Correlations",
    "⬇ Export CSV",
  ];
  const formats = [".csv", ".xlsx", ".json", ".tsv", ".parquet"];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid bg */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(109,90,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(109,90,255,0.03) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />
      {/* Glow orbs */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "15%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(109,90,255,0.08) 0%,transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "20%",
          right: "10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(0,229,160,0.05) 0%,transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          maxWidth: 660,
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo + headline */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg,#6d5aff,#00e5a0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
              }}
            >
              📊
            </div>
            <span
              className="font-display"
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              DataMind
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-display"
            style={{
              fontSize: "clamp(30px,6vw,50px)",
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              marginBottom: 16,
            }}
          >
            AI-Powered
            <br />
            <span
              style={{
                background: "linear-gradient(90deg,#6d5aff,#00e5a0)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Data Analysis
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{
              fontSize: 15,
              color: "#9999bb",
              maxWidth: 460,
              margin: "0 auto",
              lineHeight: 1.7,
            }}
          >
            Upload any dataset. The AI agent cleans it, visualizes it, finds
            patterns, and delivers actionable insights — instantly and free.
          </motion.p>
        </div>

        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
        >
          {!uploading ? (
            <div
              {...getRootProps()}
              style={{
                border: `1.5px dashed ${isDragActive ? "#6d5aff" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 16,
                padding: "44px 32px",
                textAlign: "center",
                cursor: "pointer",
                background: isDragActive
                  ? "rgba(109,90,255,0.06)"
                  : "rgba(255,255,255,0.02)",
                transition: "all 0.2s",
              }}
            >
              <input {...getInputProps()} />
              <div style={{ fontSize: 44, marginBottom: 14 }}>
                {isDragActive ? "⬇️" : "📂"}
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                {isDragActive ? "Drop it here!" : "Drop your dataset here"}
              </p>
              <p style={{ fontSize: 13, color: "#9999bb", marginBottom: 20 }}>
                or{" "}
                <span style={{ color: "#8b75ff", textDecoration: "underline" }}>
                  browse files
                </span>
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {formats.map((f) => (
                  <span
                    key={f}
                    className="font-mono"
                    style={{
                      padding: "3px 10px",
                      borderRadius: 20,
                      background: "rgba(109,90,255,0.12)",
                      border: "0.5px solid rgba(109,90,255,0.3)",
                      color: "#a99dff",
                      fontSize: 11,
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "1.5px solid rgba(109,90,255,0.3)",
                borderRadius: 16,
                padding: "44px 32px",
                textAlign: "center",
                background: "rgba(109,90,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: 38,
                  marginBottom: 14,
                  display: "inline-block",
                  animation: "spin 1.2s linear infinite",
                }}
              >
                ⚙️
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Analysing {fileName}…
              </p>
              <p style={{ fontSize: 13, color: "#9999bb", marginBottom: 20 }}>
                Computing statistics, detecting types, running quality checks…
              </p>
              <div
                style={{
                  height: 4,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg,#6d5aff,#00e5a0)",
                    borderRadius: 4,
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "#55556a", marginTop: 8 }}>
                {progress}%
              </p>
            </div>
          )}
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.52 }}
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 28,
          }}
        >
          {features.map((f) => (
            <span
              key={f}
              style={{
                padding: "5px 13px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                color: "#9999bb",
                fontSize: 12,
              }}
            >
              {f}
            </span>
          ))}
        </motion.div>

        {/* Stack */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.62 }}
          style={{
            textAlign: "center",
            marginTop: 40,
            color: "#33334a",
            fontSize: 12,
          }}
        >
          Built with{" "}
          {["FastAPI", "React", "Groq AI", "Pandas", "Chart.js"].map((t, i) => (
            <span key={t}>
              <span style={{ color: "#6d5aff" }}>{t}</span>
              {i < 4 ? " · " : ""}
            </span>
          ))}
        </motion.p>
      </motion.div>
    </div>
  );
}
