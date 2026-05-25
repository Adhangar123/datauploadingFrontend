import React, { useState, useRef, useCallback } from "react";
import "../style/KmlTodatabase.css";

// ── Constants ──────────────────────────────────────────────────────────────
const REQUIRED_HEADERS = ["farmer_id", "aadhar", "agreement_letter"];

const ZIP_DOC_TYPE_MAP = {
  aadhar: "aadhar",
  agreement: "agreement_letter",
  agreement_letter: "agreement_letter",
  photo: "farmer_photo",
  farmer_photo: "farmer_photo",
};

const VALID_DOC_FOLDERS = Object.keys(ZIP_DOC_TYPE_MAP);

// ── API base URL — apne env se lelo ───────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE || "";

// ─────────────────────────────────────────────────────────────────────────
const DocumentUploading = () => {
  const [zipFile, setZipFile]           = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [zipRootFolder, setZipRootFolder] = useState(null);
  const [message, setMessage]           = useState("");
  const [dbError, setDbError]           = useState("");
  const [previewing, setPreviewing]     = useState(false);

  // ── Upload progress state ──────────────────────────────────────────────
  const [uploading, setUploading]           = useState(false);
  const [uploadPhase, setUploadPhase]       = useState("idle"); // idle | parsing | uploading | done | error
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLog, setProgressLog]       = useState([]); // per-farmer messages
  const [uploadSummary, setUploadSummary]   = useState(null);
  const [stats, setStats]                   = useState({ completed: 0, total: 0, succeeded: 0, failed: 0 });

  const fileInputRef  = useRef();
  const logEndRef     = useRef();   // auto-scroll log to bottom
  const eventSourceRef = useRef(null);

  // ── Auto-scroll log ────────────────────────────────────────────────────
  const appendLog = useCallback((msg, type = "info") => {
    setProgressLog((prev) => [...prev, { msg, type, ts: Date.now() }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  // ── File select ────────────────────────────────────────────────────────
  const handleZipSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Please select a .zip file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setZipFile(file);
    resetState();
  };

  const resetState = () => {
    setCorrectedRows([]);
    setIncorrectRows([]);
    setZipRootFolder(null);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setProgressLog([]);
    setProgressPercent(0);
    setUploadPhase("idle");
    setStats({ completed: 0, total: 0, succeeded: 0, failed: 0 });
  };

  // ── Read & validate ZIP locally ────────────────────────────────────────
  const handleReadFile = async () => {
    if (!zipFile) return;
    setPreviewing(true);
    resetState();

    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipFile);
      const farmerMap = {};
      let detectedRootFolder = null;

      for (const [relPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const parts = relPath
          .replace(/\\/g, "/")
          .replace(/^\//, "")
          .split("/")
          .filter(Boolean);
        if (parts.length < 4) continue;

        const rootFolder = parts[0];
        const docTypeIndex = parts.findIndex((p) =>
          VALID_DOC_FOLDERS.includes(p.toLowerCase())
        );
        if (docTypeIndex === -1) continue;

        const rawDocType  = parts[docTypeIndex].toLowerCase();
        const mappedDocType = ZIP_DOC_TYPE_MAP[rawDocType];
        const farmerId    = parts[docTypeIndex + 1];
        const fileName    = parts[parts.length - 1];
        if (!mappedDocType || !farmerId || !fileName) continue;

        if (!detectedRootFolder) detectedRootFolder = rootFolder;
        if (!farmerMap[farmerId]) farmerMap[farmerId] = { farmer_id: farmerId };
        farmerMap[farmerId][mappedDocType] = fileName;
      }

      setZipRootFolder(detectedRootFolder);

      const valid   = [];
      const invalid = [];
      const seenIds = new Set();

      for (const row of Object.values(farmerMap)) {
        const errors = [];
        if (!row.farmer_id)        errors.push("farmer_id missing");
        if (!row.aadhar)           errors.push("aadhar missing");
        if (!row.agreement_letter) errors.push("agreement_letter missing");
        if (row.farmer_id && seenIds.has(row.farmer_id)) errors.push("Duplicate farmer_id");

        if (errors.length === 0) {
          valid.push(row);
          seenIds.add(row.farmer_id);
        } else {
          invalid.push({ ...row, __errors: errors });
        }
      }

      if (!valid.length && !invalid.length) {
        setDbError(
          "No valid files found. Expected: <FolderName>/aadhar/<farmer_id>/<file>, <FolderName>/agreement_letter/<farmer_id>/<file>"
        );
      }

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
    } catch (err) {
      setDbError(`ZIP read failed: ${err.message}`);
    } finally {
      setPreviewing(false);
    }
  };

  // ── Main upload with SSE progress ──────────────────────────────────────
  const handleSendToDB = async () => {
    if (!zipFile || correctedRows.length === 0) return;

    // Close any existing SSE
    if (eventSourceRef.current) eventSourceRef.current.abort?.();

    setUploading(true);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setProgressLog([]);
    setProgressPercent(0);
    setUploadPhase("parsing");
    setStats({ completed: 0, total: 0, succeeded: 0, failed: 0 });

    try {
      // ── 1. Multipart FormData banao ──
      const formData = new FormData();
      formData.append("zipFile", zipFile);

      // ── 2. fetch with ReadableStream for SSE ──
      const response = await fetch(`${API_BASE}/api/documents/upload-zip-stream`, {
        method: "POST",
        body: formData,
        // headers mein Content-Type mat dalo — browser khud boundary set karta hai
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // ── 3. SSE stream padhna ──
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // incomplete line rakh lo

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            const raw = line.replace("data:", "").trim();
            try {
              const payload = JSON.parse(raw);
              handleSSEEvent(eventType, payload);
            } catch (_) {}
            eventType = null;
          }
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
      setDbError(err.message || "Upload failed");
      setUploadPhase("error");
    } finally {
      setUploading(false);
    }
  };

  // ── SSE event handler ──────────────────────────────────────────────────
  const handleSSEEvent = (eventType, payload) => {
    switch (eventType) {
      case "status":
        appendLog(`🔄 ${payload.message}`, "info");
        setUploadPhase(payload.phase || "parsing");
        break;

      case "parsed":
        appendLog(`📦 ${payload.message}`, "info");
        setStats((s) => ({ ...s, total: payload.total }));
        setUploadPhase("uploading");
        break;

      case "progress": {
        const { completed, total, percent, message: msg, status } = payload;
        setProgressPercent(percent);
        setStats((s) => ({
          ...s,
          completed,
          total,
          succeeded: status === "success" ? s.succeeded + 1 : s.succeeded,
          failed:    status === "failed"  ? s.failed + 1  : s.failed,
        }));
        appendLog(msg, status === "success" ? "success" : "error");
        break;
      }

      case "complete":
        setProgressPercent(100);
        setUploadPhase("done");
        setUploadSummary(payload);
        setMessage(payload.message || "Upload complete!");
        setStats((s) => ({
          ...s,
          succeeded: payload.succeeded,
          failed: payload.failed,
          total: payload.total,
          completed: payload.total,
        }));
        appendLog(
          `🎉 Done! ${payload.succeeded} succeeded, ${payload.failed} failed`,
          "final"
        );
        break;

      case "error":
        setDbError(payload.message || "Upload failed");
        setUploadPhase("error");
        appendLog(`🚨 ${payload.message}`, "error");
        break;

      default:
        break;
    }
  };

  // ── Incorrect row approve ──────────────────────────────────────────────
  const handleApprove = (index) => {
    const row = incorrectRows[index];
    const errors = [];
    if (!row.farmer_id)        errors.push("farmer_id missing");
    if (!row.aadhar)           errors.push("aadhar missing");
    if (!row.agreement_letter) errors.push("agreement_letter missing");
    if (correctedRows.some((r) => r.farmer_id === row.farmer_id))
      errors.push("Duplicate farmer_id");

    if (errors.length > 0) { alert(errors.join("\n")); return; }

    const { __errors, ...cleanRow } = row;
    setCorrectedRows([...correctedRows, cleanRow]);
    setIncorrectRows(incorrectRows.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setZipFile(null);
    resetState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Progress bar color ─────────────────────────────────────────────────
  const barColor =
    uploadPhase === "done"  ? "#22c55e" :
    uploadPhase === "error" ? "#ef4444" :
    "#3b82f6";

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="kml-upload-container">
      <h2>Document Upload (.zip file only)</h2>

      {/* ── File selector ── */}
      <input
        type="file"
        accept=".zip"
        onChange={handleZipSelect}
        ref={fileInputRef}
      />

      {zipFile && (
        <span style={{ fontSize: 13, color: "#475569", marginLeft: 8 }}>
          {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
        </span>
      )}

      <button onClick={handleReadFile} disabled={!zipFile || previewing}>
        {previewing ? "Reading..." : "1. Read & Validate"}
      </button>

      <button onClick={handleReset}>Reset</button>

      {/* ── Upload Progress Panel ── */}
      {uploadPhase !== "idle" && (
        <div
          style={{
            margin: "18px 0",
            padding: "16px 20px",
            borderRadius: 10,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {/* Header with stats */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {uploadPhase === "parsing"   && "⏳ ZIP Parse ho rahi hai..."}
              {uploadPhase === "uploading" && `📤 Upload ho raha hai... (${stats.completed}/${stats.total})`}
              {uploadPhase === "done"      && "✅ Upload Complete!"}
              {uploadPhase === "error"     && "❌ Upload Failed"}
            </span>
            <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
              <span style={{ color: "#22c55e", fontWeight: 600 }}>
                ✅ {stats.succeeded} success
              </span>
              <span style={{ color: "#ef4444", fontWeight: 600 }}>
                ❌ {stats.failed} failed
              </span>
              <span style={{ color: "#64748b" }}>
                Total: {stats.total}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 12,
              background: "#e2e8f0",
              borderRadius: 99,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: barColor,
                borderRadius: 99,
                transition: "width 0.4s ease, background 0.3s ease",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#94a3b8",
              marginBottom: 12,
            }}
          >
            <span>{progressPercent}% complete</span>
            {stats.total > 0 && (
              <span>
                {stats.completed}/{stats.total} farmers
              </span>
            )}
          </div>

          {/* Scrollable log */}
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              background: "#0f172a",
              borderRadius: 8,
              padding: "10px 14px",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {progressLog.map((entry, i) => (
              <div
                key={i}
                style={{
                  color:
                    entry.type === "success" ? "#4ade80" :
                    entry.type === "error"   ? "#f87171" :
                    entry.type === "final"   ? "#facc15" :
                    "#94a3b8",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {entry.msg}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Success / Error messages ── */}
      {message  && <p style={{ color: "green",  marginTop: 8 }}>{message}</p>}
      {dbError  && <p style={{ color: "red",    marginTop: 8 }}>{dbError}</p>}

      {/* ── Summary after complete ── */}
      {uploadSummary && uploadPhase === "done" && (
        <div
          style={{
            padding: "12px 16px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          <strong>Upload Summary</strong>
          <div style={{ marginTop: 6, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span>📦 ZIP Folder: <b>{uploadSummary.zip_folder}</b></span>
            <span>🔢 Total: <b>{uploadSummary.total}</b></span>
            <span style={{ color: "#16a34a" }}>✅ Succeeded: <b>{uploadSummary.succeeded}</b></span>
            <span style={{ color: "#dc2626" }}>❌ Failed: <b>{uploadSummary.failed}</b></span>
          </div>
        </div>
      )}

      {/* ── Data tables ── */}
      <div className="stack-container">
        {/* Valid data */}
        <div className="box green">
          <h3>Valid Data ({correctedRows.length})</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {REQUIRED_HEADERS.map((col) => <th key={col}>{col} *</th>)}
                  <th>farmer_photo (optional)</th>
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, index) => (
                  <tr key={`${row.farmer_id}-${index}`}>
                    {REQUIRED_HEADERS.map((col) => <td key={col}>{row[col]}</td>)}
                    <td>{row.farmer_photo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading || correctedRows.length === 0}
            style={{ marginTop: 12 }}
          >
            {uploading
              ? `Uploading... ${progressPercent}%`
              : "2. Send to Database"}
          </button>
        </div>

        {/* Incorrect data */}
        <div className="box red">
          <h3>Incorrect Data ({incorrectRows.length})</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {REQUIRED_HEADERS.map((col) => <th key={col}>{col} *</th>)}
                  <th>farmer_photo (optional)</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.map((row, index) => (
                  <tr key={`${row.farmer_id || "invalid"}-${index}`}>
                    {REQUIRED_HEADERS.map((col) => (
                      <td key={col}>
                        <input
                          value={row[col] ?? ""}
                          onChange={(e) => {
                            const updated = [...incorrectRows];
                            updated[index] = { ...updated[index], [col]: e.target.value };
                            setIncorrectRows(updated);
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        value={row.farmer_photo ?? ""}
                        placeholder="optional"
                        onChange={(e) => {
                          const updated = [...incorrectRows];
                          updated[index] = {
                            ...updated[index],
                            farmer_photo: e.target.value || undefined,
                          };
                          setIncorrectRows(updated);
                        }}
                      />
                    </td>
                    <td style={{ color: "red" }}>{row.__errors?.join(", ")}</td>
                    <td>
                      <button onClick={() => handleApprove(index)}>Approve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentUploading;