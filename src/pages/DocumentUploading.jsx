import React, { useState, useRef } from "react";
import { uploadDocumentZip } from "../api/farmerDocsApi";
import "../style/KmlTodatabase.css";

const REQUIRED_HEADERS = ["farmer_id", "aadhar", "agreement_letter"];

const ZIP_DOC_TYPE_MAP = {
  aadhar: "aadhar",
  agreement: "agreement_letter",
  agreement_letter: "agreement_letter",
  photo: "farmer_photo",
  farmer_photo: "farmer_photo",
};

const VALID_DOC_FOLDERS = Object.keys(ZIP_DOC_TYPE_MAP);
const DocumentUploading = () => {
  const [zipFile, setZipFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [zipRootFolder, setZipRootFolder] = useState(null);
  const [message, setMessage] = useState("");
  const [dbError, setDbError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);

  // ── Batch progress state ──────────────────────────────────────────────────
  const [batchProgress, setBatchProgress] = useState(null);
  // { total_farmers, total_batches, batch_size, current_batch, percent, succeeded, failed, zip_folder }
  const [batchLog, setBatchLog] = useState([]);
  // [{ batch, succeeded, failed, errors, farmer_ids }]

  const fileInputRef = useRef();

  // ── File select ───────────────────────────────────────────────────────────
  const handleZipSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Please select a .zip file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setZipFile(file);
    resetUploadState();
  };

  const resetUploadState = () => {
    setCorrectedRows([]);
    setIncorrectRows([]);
    setZipRootFolder(null);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchProgress(null);
    setBatchLog([]);
  };

  // ── Read & validate ZIP client-side ──────────────────────────────────────
  const handleReadFile = async () => {
    if (!zipFile) return;
    setPreviewing(true);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchProgress(null);
    setBatchLog([]);
    setZipRootFolder(null);

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
        const docTypeIndex = parts.findIndex((part) =>
          VALID_DOC_FOLDERS.includes(part.toLowerCase())
        );
        if (docTypeIndex === -1) continue;

        const rawDocType = parts[docTypeIndex].toLowerCase();
        const mappedDocType = ZIP_DOC_TYPE_MAP[rawDocType];
        const farmerId = parts[docTypeIndex + 1];
        const fileName = parts[parts.length - 1];

        if (!mappedDocType || !farmerId || !fileName) continue;
        if (!detectedRootFolder) detectedRootFolder = rootFolder;

        if (!farmerMap[farmerId]) farmerMap[farmerId] = { farmer_id: farmerId };
        farmerMap[farmerId][mappedDocType] = fileName;
      }

      setZipRootFolder(detectedRootFolder);

      const valid = [];
      const invalid = [];
      const seenIds = new Set();

      for (const row of Object.values(farmerMap)) {
        const errors = [];
        if (!row.farmer_id) errors.push("farmer_id missing");
        if (!row.aadhar) errors.push("aadhar missing");
        if (!row.agreement_letter) errors.push("agreement_letter missing");
        if (row.farmer_id && seenIds.has(row.farmer_id))
          errors.push("Duplicate farmer_id");

        if (errors.length === 0) {
          valid.push(row);
          seenIds.add(row.farmer_id);
        } else {
          invalid.push({ ...row, __errors: errors });
        }
      }

      if (valid.length === 0 && invalid.length === 0) {
        setDbError(
          "No valid files found. Expected: <FolderName>/aadhar/<farmer_id>/<file>"
        );
      }

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
    } catch (err) {
      setDbError(`Could not read ZIP: ${err.message}`);
    } finally {
      setPreviewing(false);
    }
  };

  // ── SSE stream se ZIP upload + batch progress ─────────────────────────────
  const handleSendToDB = async () => {
  if (!zipFile || correctedRows.length === 0) return;

  setUploading(true);
  setMessage("");
  setDbError("");
  setUploadSummary(null);
  setBatchProgress(null);
  setBatchLog([]);

  const formData = new FormData();
  formData.append("zipFile", zipFile);

  try {
    const res = await uploadDocumentZip(formData);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server error: ${res.status}`);
    }

    // SSE stream read
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(line.slice(6));
          handleSSEEvent(data);
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      }
    }
  } catch (err) {
    console.error("Upload error:", err);
    setDbError(err.message || "Upload failed");
  } finally {
    setUploading(false);
  }
};

  // ── SSE events handle karo ────────────────────────────────────────────────
  const handleSSEEvent = (data) => {
    switch (data.event) {
      case "start":
        setBatchProgress({
          zip_folder: data.zip_folder,
          total_farmers: data.total_farmers,
          total_batches: data.total_batches,
          batch_size: data.batch_size,
          current_batch: 0,
          percent: 0,
          succeeded: 0,
          failed: 0,
        });
        break;

      case "batch_progress":
        setBatchProgress((prev) => ({
          ...prev,
          current_batch: data.batch_number,
          percent: data.percent,
          succeeded: data.cumulative_succeeded,
          failed: data.cumulative_failed,
        }));
        setBatchLog((prev) => [
          {
            batch: data.batch_number,
            succeeded: data.batch_succeeded,
            failed: data.batch_failed,
            errors: data.batch_errors || [],
          },
          ...prev,
        ]);
        break;

      case "done":
        setMessage(data.message || "ZIP upload complete");
        setUploadSummary(data);
        setBatchProgress(null); // progress bar hata do — summary show hogi
        break;

      case "error":
        setDbError(data.message || "Upload failed");
        setBatchProgress(null);
        break;

      default:
        break;
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setZipFile(null);
    resetUploadState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Approve invalid row ───────────────────────────────────────────────────
  const handleApprove = (index) => {
    const row = incorrectRows[index];
    const errors = [];
    if (!row.farmer_id) errors.push("farmer_id missing");
    if (!row.aadhar) errors.push("aadhar missing");
    if (!row.agreement_letter) errors.push("agreement_letter missing");
    if (correctedRows.some((item) => item.farmer_id === row.farmer_id))
      errors.push("Duplicate farmer_id");

    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }

    const { __errors, ...cleanRow } = row;
    setCorrectedRows([...correctedRows, cleanRow]);
    setIncorrectRows(incorrectRows.filter((_, i) => i !== index));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="kml-upload-container">
      <h2>Document Upload (.zip file only)</h2>

      <input
        type="file"
        accept=".zip"
        onChange={handleZipSelect}
        ref={fileInputRef}
      />

      {zipFile && (
        <span style={{ fontSize: 13, color: "#475569", marginLeft: 8 }}>
          {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
          {zipRootFolder && (
            <span style={{ marginLeft: 6, color: "#64748b" }}>
              · Folder: <strong>{zipRootFolder}</strong>
            </span>
          )}
        </span>
      )}

      <button onClick={handleReadFile} disabled={!zipFile || previewing}>
        {previewing ? "Reading..." : "1. Read & Validate"}
      </button>

      <button onClick={handleReset}>Reset</button>

      {/* ── Batch progress bar (uploading ke waqt) ─────────────────────── */}
      {uploading && batchProgress && (
        <div
          style={{
            margin: "16px 0",
            padding: "14px 16px",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            background: "#f8fafc",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8,
              fontSize: 13,
              color: "#475569",
            }}
          >
            <span>
              Batch {batchProgress.current_batch}/{batchProgress.total_batches}{" "}
              · {batchProgress.batch_size} farmers/batch · Folder:{" "}
              <strong>{batchProgress.zip_folder}</strong>
            </span>
            <span style={{ fontWeight: 600 }}>{batchProgress.percent}%</span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 8,
              background: "#e2e8f0",
              borderRadius: 99,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${batchProgress.percent}%`,
                background: "#3b82f6",
                borderRadius: 99,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Counts */}
          <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
            <span>Total: {batchProgress.total_farmers}</span>
            <span style={{ color: "#16a34a" }}>
              ✓ Succeeded: {batchProgress.succeeded}
            </span>
            <span style={{ color: batchProgress.failed > 0 ? "#dc2626" : "#64748b" }}>
              ✗ Failed: {batchProgress.failed}
            </span>
          </div>

          {/* Batch log — latest batch on top */}
          {batchLog.length > 0 && (
            <div
              style={{
                marginTop: 10,
                maxHeight: 140,
                overflowY: "auto",
                fontSize: 12,
                color: "#475569",
                borderTop: "1px solid #e2e8f0",
                paddingTop: 8,
              }}
            >
              {batchLog.map((b) => (
                <div
                  key={b.batch}
                  style={{
                    marginBottom: 4,
                    paddingBottom: 4,
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <span style={{ marginRight: 8 }}>Batch {b.batch}:</span>
                  <span style={{ color: "#16a34a", marginRight: 8 }}>
                    ✓ {b.succeeded}
                  </span>
                  {b.failed > 0 && (
                    <>
                      <span style={{ color: "#dc2626", marginRight: 8 }}>
                        ✗ {b.failed}
                      </span>
                      {b.errors.map((e, i) => (
                        <span key={i} style={{ color: "#dc2626" }}>
                          {e.farmer_id}: {e.error}
                          {i < b.errors.length - 1 ? " · " : ""}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="stack-container">
        {/* ── Valid rows ─────────────────────────────────────────────────── */}
        <div className="box green">
          <h3>Valid Data ({correctedRows.length})</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {REQUIRED_HEADERS.map((col) => (
                    <th key={col}>{col} *</th>
                  ))}
                  <th>farmer_photo (optional)</th>
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, index) => (
                  <tr key={`${row.farmer_id}-${index}`}>
                    {REQUIRED_HEADERS.map((col) => (
                      <td key={col}>{row[col]}</td>
                    ))}
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
          >
            {uploading
              ? `Uploading... ${batchProgress ? `(${batchProgress.percent}%)` : ""}`
              : "2. Send to Database"}
          </button>

          {message && <p style={{ color: "green" }}>{message}</p>}
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}

          {/* ── Final summary (done ke baad) ───────────────────────────── */}
          {uploadSummary && !uploading && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                background: uploadSummary.failed > 0 ? "#fff7ed" : "#f0fdf4",
                border: `1px solid ${uploadSummary.failed > 0 ? "#fed7aa" : "#bbf7d0"}`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Upload Summary</p>
              <p>
                Folder: <strong>{uploadSummary.zip_folder}</strong>
              </p>
              <p>Total farmers: {uploadSummary.total}</p>
              <p>
                Batches: {uploadSummary.total_batches} × {uploadSummary.batch_size} farmers
              </p>
              <p style={{ color: "#16a34a" }}>
                ✓ Succeeded: {uploadSummary.succeeded}
              </p>
              <p
                style={{
                  color: uploadSummary.failed > 0 ? "#dc2626" : "#64748b",
                }}
              >
                ✗ Failed: {uploadSummary.failed}
              </p>

              {/* Failed farmer details */}
              {uploadSummary.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>
                    Failed farmers:
                  </p>
                  <div
                    style={{
                      maxHeight: 120,
                      overflowY: "auto",
                      fontSize: 12,
                    }}
                  >
                    {uploadSummary.errors.map((e, i) => (
                      <div key={i} style={{ color: "#dc2626", marginBottom: 2 }}>
                        {e.farmer_id}: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Invalid rows ───────────────────────────────────────────────── */}
        <div className="box red">
          <h3>Incorrect Data ({incorrectRows.length})</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {REQUIRED_HEADERS.map((col) => (
                    <th key={col}>{col} *</th>
                  ))}
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
                            updated[index] = {
                              ...updated[index],
                              [col]: e.target.value,
                            };
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
                    <td style={{ color: "red" }}>
                      {row.__errors?.join(", ")}
                    </td>
                    <td>
                      <button onClick={() => handleApprove(index)}>
                        Approve
                      </button>
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