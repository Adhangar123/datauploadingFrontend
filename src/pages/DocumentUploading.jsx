import React, { useState, useRef } from "react";
import { uploadDocumentZip } from "../api/farmerDocsApi";
import "../style/KmlTodatabase.css";
 
const REQUIRED_HEADERS = ["farmer_id", "aadhar", "agreement_letter"];
const BATCH_SIZE = 100;
 
const ZIP_DOC_TYPE_MAP = {
  aadhar: "aadhar",
  agreement: "agreement_letter",
  agreement_letter: "agreement_letter",
  photo: "farmer_photo",
  farmer_photo: "farmer_photo",
};
 
const VALID_DOC_FOLDERS = Object.keys(ZIP_DOC_TYPE_MAP);
 
const getZipFileInfo = (relPath) => {
  const parts = relPath
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean);
 
  if (parts.length < 4) return null;
 
  const rootFolder = parts[0];
  const docTypeIndex = parts.findIndex((part) =>
    VALID_DOC_FOLDERS.includes(part.toLowerCase())
  );
 
  if (docTypeIndex === -1) return null;
 
  const rawDocType = parts[docTypeIndex].toLowerCase();
  const mappedDocType = ZIP_DOC_TYPE_MAP[rawDocType];
  const farmerId = parts[docTypeIndex + 1];
  const fileName = parts[parts.length - 1];
 
  if (!mappedDocType || !farmerId || !fileName) return null;
 
  return { rootFolder, docType: mappedDocType, farmerId, fileName };
};
 
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};
 
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
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchLog, setBatchLog] = useState([]);
  // ✅ NEW: per-batch XHR network upload percent (0–100)
  const [xhrPercent, setXhrPercent] = useState(0);
 
  const fileInputRef = useRef();
 
  const resetUploadState = () => {
    setCorrectedRows([]);
    setIncorrectRows([]);
    setZipRootFolder(null);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchProgress(null);
    setBatchLog([]);
    setXhrPercent(0);
  };
 
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
 
        const fileInfo = getZipFileInfo(relPath);
        if (!fileInfo) continue;
 
        if (!detectedRootFolder) detectedRootFolder = fileInfo.rootFolder;
 
        if (!farmerMap[fileInfo.farmerId]) {
          farmerMap[fileInfo.farmerId] = { farmer_id: fileInfo.farmerId };
        }
 
        farmerMap[fileInfo.farmerId][fileInfo.docType] = fileInfo.fileName;
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
 
        if (row.farmer_id && seenIds.has(row.farmer_id)) {
          errors.push("Duplicate farmer_id");
        }
 
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
 
  const createBatchZipFile = async (sourceZip, batchFarmerIds, batchNumber) => {
    const JSZip = (await import("jszip")).default;
    const batchZip = new JSZip();
    const farmerIdSet = new Set(batchFarmerIds);
 
    for (const [relPath, entry] of Object.entries(sourceZip.files)) {
      if (entry.dir) continue;
 
      const fileInfo = getZipFileInfo(relPath);
      if (!fileInfo || !farmerIdSet.has(fileInfo.farmerId)) continue;
 
      const fileBlob = await entry.async("blob");
      batchZip.file(relPath, fileBlob);
    }
 
    const batchBlob = await batchZip.generateAsync({ type: "blob" });
 
    return new File(
      [batchBlob],
      `${zipRootFolder || "farmers"}-batch-${batchNumber}.zip`,
      { type: "application/zip" }
    );
  };
 
  const handleSendToDB = async () => {
    if (!zipFile || correctedRows.length === 0) return;
 
    setUploading(true);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchLog([]);
    setXhrPercent(0);
 
    const totalFarmers = correctedRows.length;
    const batches = chunkArray(correctedRows, BATCH_SIZE);
    const totalBatches = batches.length;
 
    setBatchProgress({
      zip_folder: zipRootFolder,
      total_farmers: totalFarmers,
      total_batches: totalBatches,
      batch_size: BATCH_SIZE,
      current_batch: 0,
      percent: 0,
      succeeded: 0,
      failed: 0,
    });
 
    try {
      const JSZip = (await import("jszip")).default;
      const sourceZip = await JSZip.loadAsync(zipFile);
 
      const allSuccess = [];
      const allErrors = [];
 
      for (let index = 0; index < batches.length; index++) {
        const batchNumber = index + 1;
        const batchRows = batches[index];
        const batchFarmerIds = batchRows.map((row) => row.farmer_id);
 
        // Reset XHR percent for each new batch
        setXhrPercent(0);
 
        setBatchProgress((prev) => ({
          ...prev,
          current_batch: batchNumber,
          percent: Math.round(((batchNumber - 1) / totalBatches) * 100),
        }));
 
        const batchZipFile = await createBatchZipFile(
          sourceZip,
          batchFarmerIds,
          batchNumber
        );
 
        const formData = new FormData();
        formData.append("zipFile", batchZipFile);
        formData.append("batch_number", String(batchNumber));
        formData.append("batch_size", String(BATCH_SIZE));
        formData.append("total_farmers", String(totalFarmers));
 
        // ✅ CHANGED: uploadDocumentZip ab Promise return karta hai
        //    onUploadProgress → XHR network upload % track karta hai
        const res = await uploadDocumentZip(formData, (percent) => {
          setXhrPercent(percent);
        });
 
        // ✅ CHANGED: pehle res.ok + res.json() tha
        //    ab res.data directly available hai — res.json() nahi karni
        if (!res.ok) {
          throw new Error(
            res.data?.message || `Batch ${batchNumber} failed: ${res.status}`
          );
        }
 
        const data = res.data;
 
        allSuccess.push(...(data.success || []));
        allErrors.push(...(data.errors || []));
 
        setBatchLog((prev) => [
          {
            batch: batchNumber,
            succeeded: data.succeeded || 0,
            failed: data.failed || 0,
            errors: data.errors || [],
            farmer_ids: data.farmer_ids || batchFarmerIds,
          },
          ...prev,
        ]);
 
        setBatchProgress((prev) => ({
          ...prev,
          current_batch: batchNumber,
          percent: Math.round((batchNumber / totalBatches) * 100),
          succeeded: allSuccess.length,
          failed: allErrors.length,
        }));
      }
 
      const finalSummary = {
        message: "ZIP upload complete",
        zip_folder: zipRootFolder,
        total: totalFarmers,
        total_batches: totalBatches,
        batch_size: BATCH_SIZE,
        succeeded: allSuccess.length,
        failed: allErrors.length,
        success: allSuccess,
        errors: allErrors,
      };
 
      setUploadSummary(finalSummary);
      setMessage("ZIP upload complete");
    } catch (err) {
      console.error("Upload error:", err);
      setDbError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setXhrPercent(0);
    }
  };
 
  const handleReset = () => {
    setZipFile(null);
    resetUploadState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
 
  const handleApprove = (index) => {
    const row = incorrectRows[index];
    const errors = [];
 
    if (!row.farmer_id) errors.push("farmer_id missing");
    if (!row.aadhar) errors.push("aadhar missing");
    if (!row.agreement_letter) errors.push("agreement_letter missing");
 
    if (correctedRows.some((item) => item.farmer_id === row.farmer_id)) {
      errors.push("Duplicate farmer_id");
    }
 
    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }
 
    const { __errors, ...cleanRow } = row;
    setCorrectedRows([...correctedRows, cleanRow]);
    setIncorrectRows(incorrectRows.filter((_, i) => i !== index));
  };
 
  const plannedBatches =
    correctedRows.length > 0 ? Math.ceil(correctedRows.length / BATCH_SIZE) : 0;
 
  const overallPercent = batchProgress?.percent ?? 0;
 
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
              {" "}Folder: <strong>{zipRootFolder}</strong>
            </span>
          )}
        </span>
      )}
 
      <button onClick={handleReadFile} disabled={!zipFile || previewing}>
        {previewing ? "Reading..." : "1. Read & Validate"}
      </button>
 
      <button onClick={handleReset}>Reset</button>
 
      {/* Batch plan */}
      {correctedRows.length > 0 && !uploading && (
        <div
          style={{
            margin: "16px 0",
            padding: "12px 14px",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            background: "#f8fafc",
            fontSize: 13,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Batch Plan</p>
          <p>Total valid farmers: {correctedRows.length}</p>
          <p>
            Data will be sent in {plannedBatches} batch
            {plannedBatches > 1 ? "es" : ""} of max {BATCH_SIZE} farmers.
          </p>
        </div>
      )}
 
      {/* Upload progress */}
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
          {/* Batch level progress */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              fontSize: 13,
              color: "#475569",
            }}
          >
            <span>
              Batch {batchProgress.current_batch}/{batchProgress.total_batches}{" "}
              — {BATCH_SIZE} farmers/batch
            </span>
            <span style={{ fontWeight: 600 }}>{overallPercent}%</span>
          </div>
 
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
                width: `${overallPercent}%`,
                background: "#3b82f6",
                borderRadius: 99,
                transition: "width 0.3s ease",
              }}
            />
          </div>
 
          {/* ✅ NEW: XHR network upload progress for current batch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              fontSize: 12,
              color: "#64748b",
            }}
          >
            <span>Current batch uploading...</span>
            <span style={{ fontWeight: 600, color: "#f97316" }}>
              {xhrPercent}%
            </span>
          </div>
 
          <div
            style={{
              height: 5,
              background: "#e2e8f0",
              borderRadius: 99,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${xhrPercent}%`,
                background: "#f97316",
                borderRadius: 99,
                transition: "width 0.2s ease",
              }}
            />
          </div>
 
          <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
            <span>Total: {batchProgress.total_farmers}</span>
            <span style={{ color: "#16a34a" }}>
              Succeeded: {batchProgress.succeeded}
            </span>
            <span
              style={{
                color: batchProgress.failed > 0 ? "#dc2626" : "#64748b",
              }}
            >
              Failed: {batchProgress.failed}
            </span>
          </div>
 
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
                    {b.succeeded} succeeded
                  </span>
                  {b.failed > 0 && (
                    <span style={{ color: "#dc2626" }}>{b.failed} failed</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
 
      <div className="stack-container">
        {/* Valid data table */}
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
                    <td>{row.farmer_photo ?? "-"}</td>
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
              ? `Uploading... ${batchProgress ? `(${overallPercent}%)` : ""}`
              : "2. Send to Database"}
          </button>
 
          {message && <p style={{ color: "green" }}>{message}</p>}
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}
 
          {uploadSummary && !uploading && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                background: uploadSummary.failed > 0 ? "#fff7ed" : "#f0fdf4",
                border: `1px solid ${
                  uploadSummary.failed > 0 ? "#fed7aa" : "#bbf7d0"
                }`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Upload Summary</p>
              <p>Total farmers: {uploadSummary.total}</p>
              <p>
                Batches: {uploadSummary.total_batches} x{" "}
                {uploadSummary.batch_size} farmers
              </p>
              <p style={{ color: "#16a34a" }}>
                Succeeded: {uploadSummary.succeeded}
              </p>
              <p
                style={{
                  color: uploadSummary.failed > 0 ? "#dc2626" : "#64748b",
                }}
              >
                Failed: {uploadSummary.failed}
              </p>
 
              {uploadSummary.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p
                    style={{
                      fontWeight: 600,
                      color: "#dc2626",
                      marginBottom: 4,
                    }}
                  >
                    Failed farmers:
                  </p>
                  <div
                    style={{ maxHeight: 120, overflowY: "auto", fontSize: 12 }}
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
 
        {/* Incorrect data table */}
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