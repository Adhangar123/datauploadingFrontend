import React, { useState, useRef } from "react";
import { uploadDocumentZip } from "../api/farmerDocsApi";
import "../style/KmlTodatabase.css";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const REQUIRED_HEADERS = ["farmer_id", "aadhar", "agreement_letter"];
const BATCH_SIZE       = 2;

const ZIP_DOC_TYPE_MAP = {
  aadhar:           "aadhar",
  agreement:        "agreement_letter",
  agreement_letter: "agreement_letter",
  photo:            "farmer_photo",
  farmer_photo:     "farmer_photo",
};

const VALID_DOC_FOLDERS = Object.keys(ZIP_DOC_TYPE_MAP);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const getZipFileInfo = (relPath) => {
  const parts = relPath
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean);

  if (parts.length < 4) return null;

  const rootFolder    = parts[0];
  const docTypeIndex  = parts.findIndex((part) =>
    VALID_DOC_FOLDERS.includes(part.toLowerCase())
  );

  if (docTypeIndex === -1) return null;

  const rawDocType    = parts[docTypeIndex].toLowerCase();
  const mappedDocType = ZIP_DOC_TYPE_MAP[rawDocType];
  const farmerId      = parts[docTypeIndex + 1];
  const fileName      = parts[parts.length - 1];

  if (!mappedDocType || !farmerId || !fileName) return null;

  return { rootFolder, docType: mappedDocType, farmerId, fileName, relPath };
};

// ─────────────────────────────────────────────
// Batch status constants
// ─────────────────────────────────────────────

const BATCH_STATUS = {
  PENDING:   "pending",
  UPLOADING: "uploading",
  SUCCESS:   "success",
  PARTIAL:   "partial",
  FAILED:    "failed",
  SKIPPED:   "skipped",
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const DocumentUploading = () => {
  const [zipFile, setZipFile]               = useState(null);
  const [correctedRows, setCorrectedRows]   = useState([]);
  const [incorrectRows, setIncorrectRows]   = useState([]);
  const [zipRootFolder, setZipRootFolder]   = useState(null);
  const [message, setMessage]               = useState("");
  const [dbError, setDbError]               = useState("");
  const [uploading, setUploading]           = useState(false);
  const [paused, setPaused]                 = useState(false);
  const [previewing, setPreviewing]         = useState(false);
  const [uploadSummary, setUploadSummary]   = useState(null);
  const [batchProgress, setBatchProgress]   = useState(null);
  const [batchLog, setBatchLog]             = useState([]);
  const [xhrPercent, setXhrPercent]         = useState(0);
  const [batchStatusMap, setBatchStatusMap] = useState({});

  const cancelledRef        = useRef(false);
  const pausedRef           = useRef(false);
  const skipCurrentRef      = useRef(false);
  const fileInputRef        = useRef();
  const zipInstanceRef      = useRef(null);
  const farmerZipEntriesRef = useRef({});
  const abortControllerRef  = useRef(null);

  // ── Reset ──────────────────────────────────────────────────────────────
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
    setBatchStatusMap({});
    setPaused(false);

    cancelledRef.current        = false;
    pausedRef.current           = false;
    skipCurrentRef.current      = false;
    zipInstanceRef.current      = null;
    farmerZipEntriesRef.current = {};
    abortControllerRef.current  = null;
  };

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
    resetUploadState();
  };

  // ── Read & Validate ZIP ────────────────────────────────────────────────
  const handleReadFile = async () => {
    if (!zipFile) return;

    setPreviewing(true);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchProgress(null);
    setBatchLog([]);
    setZipRootFolder(null);
    setBatchStatusMap({});

    try {
      const JSZip = (await import("jszip")).default;
      const zip   = await JSZip.loadAsync(zipFile);

      zipInstanceRef.current = zip;

      const farmerMap        = {};
      const farmerZipEntries = {};
      let detectedRootFolder = null;

      for (const [relPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;

        const fileInfo = getZipFileInfo(relPath);
        if (!fileInfo) continue;

        if (!detectedRootFolder) detectedRootFolder = fileInfo.rootFolder;

        if (!farmerMap[fileInfo.farmerId]) {
          farmerMap[fileInfo.farmerId] = { farmer_id: fileInfo.farmerId };
        }
        if (!farmerMap[fileInfo.farmerId][fileInfo.docType]) {
          farmerMap[fileInfo.farmerId][fileInfo.docType] = [];
        }
        farmerMap[fileInfo.farmerId][fileInfo.docType].push(fileInfo.fileName);

        if (!farmerZipEntries[fileInfo.farmerId]) {
          farmerZipEntries[fileInfo.farmerId] = {};
        }
        if (!farmerZipEntries[fileInfo.farmerId][fileInfo.docType]) {
          farmerZipEntries[fileInfo.farmerId][fileInfo.docType] = [];
        }
        farmerZipEntries[fileInfo.farmerId][fileInfo.docType].push({
          relPath:  fileInfo.relPath,
          entry,
          fileName: fileInfo.fileName,
        });
      }

      farmerZipEntriesRef.current = farmerZipEntries;
      setZipRootFolder(detectedRootFolder);

      const valid   = [];
      const invalid = [];
      const seenIds = new Set();

      for (const row of Object.values(farmerMap)) {
        const errors = [];

        if (!row.farmer_id)                errors.push("farmer_id missing");
        if (!row.aadhar?.length)           errors.push("aadhar missing");
        if (!row.agreement_letter?.length) errors.push("agreement_letter missing");
        if (row.farmer_id && seenIds.has(row.farmer_id)) errors.push("Duplicate farmer_id");

        if (errors.length === 0) {
          valid.push(row);
          seenIds.add(row.farmer_id);
        } else {
          invalid.push({ ...row, __errors: errors });
        }
      }

      if (valid.length === 0 && invalid.length === 0) {
        setDbError("No valid files found. Expected: <FolderName>/aadhar/<farmer_id>/<file>");
      }

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
    } catch (err) {
      setDbError(`Could not read ZIP: ${err.message}`);
    } finally {
      setPreviewing(false);
    }
  };

  // ── Wait while paused ──────────────────────────────────────────────────
  const waitWhilePaused = () =>
    new Promise((resolve) => {
      const check = () => {
        if (!pausedRef.current) return resolve();
        setTimeout(check, 300);
      };
      check();
    });

  // ── Pause / Resume ─────────────────────────────────────────────────────
  const handlePauseResume = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  };

  // ── Skip current batch ─────────────────────────────────────────────────
  const handleSkipBatch = () => {
    skipCurrentRef.current = true;
    abortControllerRef.current?.abort();
  };

  // ── Send to DB ─────────────────────────────────────────────────────────
  const handleSendToDB = async () => {
    if (!zipFile || correctedRows.length === 0) return;

    setUploading(true);
    setPaused(false);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setBatchLog([]);
    setXhrPercent(0);
    setBatchStatusMap({});
    cancelledRef.current   = false;
    pausedRef.current      = false;
    skipCurrentRef.current = false;

    const totalFarmers = correctedRows.length;
    const totalBatches = Math.ceil(totalFarmers / BATCH_SIZE);

    const initialStatusMap = {};
    for (let i = 1; i <= totalBatches; i++) {
      initialStatusMap[i] = { status: BATCH_STATUS.PENDING, reason: "", farmerIds: [] };
    }
    setBatchStatusMap(initialStatusMap);

    setBatchProgress({
      zip_folder:    zipRootFolder,
      total_farmers: totalFarmers,
      total_batches: totalBatches,
      batch_size:    BATCH_SIZE,
      current_batch: 0,
      percent:       0,
      succeeded:     0,
      partial:       0,
      failed:        0,
      skipped:       0,
    });

    const allSuccess    = [];
    const allErrors     = [];
    const allFileErrors = [];
    let totalSkipped    = 0;

    try {
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        if (cancelledRef.current) {
          setDbError("Upload cancelled by user.");
          break;
        }

        await waitWhilePaused();

        if (cancelledRef.current) {
          setDbError("Upload cancelled by user.");
          break;
        }

        const clientBatchNumber = batchIndex + 1;
        const batchRows         = correctedRows.slice(
          batchIndex * BATCH_SIZE,
          batchIndex * BATCH_SIZE + BATCH_SIZE
        );
        const batchFarmerIds = batchRows.map((row) => row.farmer_id);

        setBatchStatusMap((prev) => ({
          ...prev,
          [clientBatchNumber]: {
            status:    BATCH_STATUS.UPLOADING,
            reason:    "",
            farmerIds: batchFarmerIds,
          },
        }));

        setXhrPercent(0);
        skipCurrentRef.current = false;

        setBatchProgress((prev) => ({
          ...prev,
          current_batch: clientBatchNumber,
          percent: Math.round((batchIndex / totalBatches) * 100),
        }));

        // ── Direct FormData build — NO ZIP ────────────────────────────
        let formData;
        try {
          formData = new FormData();
          const farmerEntries = farmerZipEntriesRef.current;
          const fileCountMeta = [];

          for (const farmerId of batchFarmerIds) {
            const docs = farmerEntries[farmerId] || {};

            const aadharFiles    = docs.aadhar           || [];
            const agreementFiles = docs.agreement_letter || [];
            const photoFiles     = docs.farmer_photo     || [];

            for (const doc of aadharFiles) {
              if (!doc?.entry) continue;
              const buffer = await doc.entry.async("arraybuffer");
              formData.append(
                "aadhar",
                new File([buffer], doc.fileName, { type: "application/octet-stream" })
              );
            }

            for (const doc of agreementFiles) {
              if (!doc?.entry) continue;
              const buffer = await doc.entry.async("arraybuffer");
              formData.append(
                "agreement_letter",
                new File([buffer], doc.fileName, { type: "application/octet-stream" })
              );
            }

            for (const doc of photoFiles) {
              if (!doc?.entry) continue;
              const buffer = await doc.entry.async("arraybuffer");
              formData.append(
                "farmer_photo",
                new File([buffer], doc.fileName, { type: "application/octet-stream" })
              );
            }

            fileCountMeta.push({
              farmer_id:              farmerId,
              aadhar_count:           aadharFiles.length,
              agreement_letter_count: agreementFiles.length,
              farmer_photo_count:     photoFiles.length,
            });
          }

          formData.append("farmer_ids",           JSON.stringify(batchFarmerIds));
          formData.append("file_counts",          JSON.stringify(fileCountMeta));
          formData.append("client_batch_number",  String(clientBatchNumber));
          formData.append("client_total_batches", String(totalBatches));
          formData.append("zip_folder",           zipRootFolder || "farmers");

        } catch (buildErr) {
          const reason = `FormData build failed: ${buildErr.message}`;
          totalSkipped += 1;

          setBatchStatusMap((prev) => ({
            ...prev,
            [clientBatchNumber]: { status: BATCH_STATUS.SKIPPED, reason, farmerIds: batchFarmerIds },
          }));

          setBatchLog((prev) => [{
            batch: clientBatchNumber, status: BATCH_STATUS.SKIPPED,
            succeeded: 0, partial: 0, failed: 0, skipped: batchFarmerIds.length,
            reason, farmer_ids: batchFarmerIds,
          }, ...prev]);

          setBatchProgress((prev) => ({
            ...prev,
            skipped: (prev?.skipped ?? 0) + batchFarmerIds.length,
          }));

          continue;
        }

        if (skipCurrentRef.current) {
          const reason = "Skipped by user before upload";
          totalSkipped += 1;

          setBatchStatusMap((prev) => ({
            ...prev,
            [clientBatchNumber]: { status: BATCH_STATUS.SKIPPED, reason, farmerIds: batchFarmerIds },
          }));

          setBatchLog((prev) => [{
            batch: clientBatchNumber, status: BATCH_STATUS.SKIPPED,
            succeeded: 0, partial: 0, failed: 0, skipped: batchFarmerIds.length,
            reason, farmer_ids: batchFarmerIds,
          }, ...prev]);

          setBatchProgress((prev) => ({
            ...prev,
            skipped: (prev?.skipped ?? 0) + batchFarmerIds.length,
            percent: Math.round((clientBatchNumber / totalBatches) * 100),
          }));

          skipCurrentRef.current = false;
          continue;
        }

        // ── Upload ─────────────────────────────────────────────────────
        abortControllerRef.current = new AbortController();

        let res;
        try {
          res = await uploadDocumentZip(
            formData,
            (pct) => { if (!skipCurrentRef.current) setXhrPercent(pct); },
            { signal: abortControllerRef.current.signal }
          );
        } catch (fetchErr) {
          const isSkip    = skipCurrentRef.current || fetchErr.name === "AbortError";
          const reason    = isSkip ? "Skipped by user during upload" : `Network error: ${fetchErr.message}`;
          const newStatus = isSkip ? BATCH_STATUS.SKIPPED : BATCH_STATUS.FAILED;

          if (isSkip) {
            totalSkipped += 1;
          } else {
            allErrors.push(...batchFarmerIds.map((id) => ({ farmer_id: id, error: reason })));
          }

          setBatchStatusMap((prev) => ({
            ...prev,
            [clientBatchNumber]: { status: newStatus, reason, farmerIds: batchFarmerIds },
          }));

          setBatchLog((prev) => [{
            batch: clientBatchNumber, status: newStatus,
            succeeded: 0, partial: 0,
            failed:  isSkip ? 0 : batchFarmerIds.length,
            skipped: isSkip ? batchFarmerIds.length : 0,
            reason, farmer_ids: batchFarmerIds,
          }, ...prev]);

          setBatchProgress((prev) => ({
            ...prev,
            skipped: isSkip ? (prev?.skipped ?? 0) + batchFarmerIds.length : prev?.skipped ?? 0,
            failed:  !isSkip ? (prev?.failed  ?? 0) + batchFarmerIds.length : prev?.failed  ?? 0,
            percent: Math.round((clientBatchNumber / totalBatches) * 100),
          }));

          skipCurrentRef.current = false;
          continue;
        }

        if (!res.ok) {
          const reason = res.data?.message || `Batch ${clientBatchNumber} failed with status ${res.status}`;
          allErrors.push(...batchFarmerIds.map((id) => ({ farmer_id: id, error: reason })));

          setBatchStatusMap((prev) => ({
            ...prev,
            [clientBatchNumber]: { status: BATCH_STATUS.FAILED, reason, farmerIds: batchFarmerIds },
          }));

          setBatchLog((prev) => [{
            batch: clientBatchNumber, status: BATCH_STATUS.FAILED,
            succeeded: 0, partial: 0, failed: batchFarmerIds.length, skipped: 0,
            reason, farmer_ids: batchFarmerIds,
          }, ...prev]);

          setBatchProgress((prev) => ({
            ...prev,
            failed: (prev?.failed ?? 0) + batchFarmerIds.length,
            percent: Math.round((clientBatchNumber / totalBatches) * 100),
          }));

          continue;
        }

        const data           = res.data;
        const batchSucceeded = data.succeeded || 0;
        const batchPartial   = data.partial   || 0;
        const batchFailed    = data.failed    || 0;

        allSuccess.push(...(data.success || []));
        allErrors.push(...(data.errors   || []));

        if (data.success?.length) {
          data.success.forEach((farmer) => {
            if (farmer.file_errors?.length) {
              allFileErrors.push(
                ...farmer.file_errors.map((fe) => ({ farmer_id: farmer.farmer_id, ...fe }))
              );
            }
          });
        }

        const batchFinalStatus =
          batchFailed > 0
            ? BATCH_STATUS.FAILED
            : batchPartial > 0
              ? BATCH_STATUS.PARTIAL
              : BATCH_STATUS.SUCCESS;

        setBatchStatusMap((prev) => ({
          ...prev,
          [clientBatchNumber]: {
            status:    batchFinalStatus,
            reason:    batchPartial > 0 ? `${batchPartial} farmer(s) partially uploaded` : "",
            farmerIds: data.farmer_ids || batchFarmerIds,
          },
        }));

        setBatchLog((prev) => [{
          batch:      clientBatchNumber,
          status:     batchFinalStatus,
          succeeded:  batchSucceeded,
          partial:    batchPartial,
          failed:     batchFailed,
          skipped:    0,
          reason:     batchPartial > 0 ? `${batchPartial} partial` : "",
          errors:     data.errors || [],
          fileErrors: data.success
            ?.filter((f) => f.file_errors?.length)
            .map((f) => ({ farmer_id: f.farmer_id, files: f.file_errors })) || [],
          farmer_ids: data.farmer_ids || batchFarmerIds,
        }, ...prev]);

        setBatchProgress((prev) => ({
          ...prev,
          current_batch: clientBatchNumber,
          percent:   Math.round((clientBatchNumber / totalBatches) * 100),
          succeeded: (prev?.succeeded ?? 0) + batchSucceeded,
          partial:   (prev?.partial   ?? 0) + batchPartial,
          failed:    (prev?.failed    ?? 0) + batchFailed,
        }));
      }

      if (!cancelledRef.current) {
        setUploadSummary({
          message:       "Upload complete",
          zip_folder:    zipRootFolder,
          total:         totalFarmers,
          total_batches: totalBatches,
          batch_size:    BATCH_SIZE,
          succeeded:     allSuccess.filter((f) => f.status === "success").length,
          partial:       allSuccess.filter((f) => f.status === "partial").length,
          failed:        allErrors.length,
          skipped:       totalSkipped,
          success:       allSuccess,
          errors:        allErrors,
          fileErrors:    allFileErrors,
        });
        setMessage("Upload complete");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setDbError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setPaused(false);
      pausedRef.current      = false;
      skipCurrentRef.current = false;
      setXhrPercent(0);
      abortControllerRef.current = null;
    }
  };

  // ── Cancel ─────────────────────────────────────────────────────────────
  const handleCancel = () => {
    cancelledRef.current = true;
    pausedRef.current    = false;
    setPaused(false);
    abortControllerRef.current?.abort();
  };

  // ── Full Reset ─────────────────────────────────────────────────────────
  const handleReset = () => {
    setZipFile(null);
    resetUploadState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Approve incorrect row ──────────────────────────────────────────────
  const handleApprove = (index) => {
    const row    = incorrectRows[index];
    const errors = [];

    if (!row.farmer_id)                errors.push("farmer_id missing");
    if (!row.aadhar?.length)           errors.push("aadhar missing");
    if (!row.agreement_letter?.length) errors.push("agreement_letter missing");

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

  // ── Derived ────────────────────────────────────────────────────────────
  const plannedBatches = correctedRows.length > 0
    ? Math.ceil(correctedRows.length / BATCH_SIZE)
    : 0;
  const overallPercent = batchProgress?.percent ?? 0;

  // ── Status colors/labels ───────────────────────────────────────────────
  const statusColor = {
    [BATCH_STATUS.PENDING]:   "#94a3b8",
    [BATCH_STATUS.UPLOADING]: "#3b82f6",
    [BATCH_STATUS.SUCCESS]:   "#16a34a",
    [BATCH_STATUS.PARTIAL]:   "#f59e0b",
    [BATCH_STATUS.FAILED]:    "#dc2626",
    [BATCH_STATUS.SKIPPED]:   "#f97316",
  };

  const statusLabel = {
    [BATCH_STATUS.PENDING]:   "Pending",
    [BATCH_STATUS.UPLOADING]: "Uploading…",
    [BATCH_STATUS.SUCCESS]:   "✓ Success",
    [BATCH_STATUS.PARTIAL]:   "◑ Partial",
    [BATCH_STATUS.FAILED]:    "✗ Failed",
    [BATCH_STATUS.SKIPPED]:   "⊘ Skipped",
  };

  const renderFileBadge = (files) => {
    if (!files?.length) return <span style={{ color: "#94a3b8" }}>—</span>;
    return (
      <span title={files.join("\n")} style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
        {files.map((f, i) => (
          <span key={i} style={{
            display: "inline-block", maxWidth: 160,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: 11, background: "#f0fdf4",
            border: "1px solid #bbf7d0", borderRadius: 4,
            padding: "1px 5px", color: "#15803d",
          }}>
            {f}
          </span>
        ))}
        {files.length > 1 && (
          <span style={{
            fontSize: 10, color: "#2563eb", background: "#eff6ff",
            border: "1px solid #bfdbfe", borderRadius: 4,
            padding: "1px 5px", fontWeight: 600,
          }}>
            {files.length} files
          </span>
        )}
      </span>
    );
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

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
              Folder: <strong>{zipRootFolder}</strong>
            </span>
          )}
        </span>
      )}

      <button onClick={handleReadFile} disabled={!zipFile || previewing}>
        {previewing ? "Reading..." : "1. Read & Validate"}
      </button>

      <button onClick={handleReset}>Reset</button>

      {correctedRows.length > 0 && !uploading && (
        <div style={{
          margin: "16px 0", padding: "12px 14px",
          border: "1px solid #cbd5e1", borderRadius: 8,
          background: "#f8fafc", fontSize: 13,
        }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Batch Plan</p>
          <p>Total valid farmers: {correctedRows.length}</p>
          <p>
            {plannedBatches} batch{plannedBatches > 1 ? "es" : ""} of {BATCH_SIZE} farmers each — direct file upload (no ZIP)
          </p>
          <p style={{ color: "#2563eb", marginTop: 4 }}>
            Total files to upload:{" "}
            <strong>
              {correctedRows.reduce((acc, row) =>
                acc +
                (row.aadhar?.length          || 0) +
                (row.agreement_letter?.length || 0) +
                (row.farmer_photo?.length     || 0), 0
              )}
            </strong>
          </p>
        </div>
      )}

      {uploading && batchProgress && (
        <div style={{
          margin: "16px 0", padding: "14px 16px",
          border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13, color: "#475569" }}>
            <span>Batch {batchProgress.current_batch}/{batchProgress.total_batches}</span>
            <span style={{ fontWeight: 600 }}>{overallPercent}%</span>
          </div>

          <div style={{ height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
            <div style={{
              height: "100%", width: `${overallPercent}%`,
              background: "#3b82f6", borderRadius: 99, transition: "width 0.3s ease",
            }} />
          </div>

          {!paused && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: "#64748b" }}>
                <span>Uploading files to server...</span>
                <span style={{ fontWeight: 600, color: "#f97316" }}>{xhrPercent}%</span>
              </div>
              <div style={{ height: 5, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                <div style={{
                  height: "100%", width: `${xhrPercent}%`,
                  background: "#f97316", borderRadius: 99, transition: "width 0.2s ease",
                }} />
              </div>
            </>
          )}

          {paused && (
            <div style={{
              padding: "8px 12px", background: "#fef9c3",
              border: "1px solid #fde047", borderRadius: 6,
              fontSize: 13, color: "#854d0e", marginBottom: 10,
            }}>
              ⏸ Upload paused — current batch will finish, then wait.
            </div>
          )}

          <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
            <span>Total: {batchProgress.total_farmers}</span>
            <span style={{ color: "#16a34a" }}>Succeeded: {batchProgress.succeeded}</span>
            <span style={{ color: "#f59e0b" }}>Partial: {batchProgress.partial ?? 0}</span>
            <span style={{ color: batchProgress.failed > 0 ? "#dc2626" : "#64748b" }}>Failed: {batchProgress.failed}</span>
            <span style={{ color: "#f97316" }}>Skipped: {batchProgress.skipped ?? 0}</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={handlePauseResume} style={{
              padding: "5px 14px", fontSize: 12,
              background: paused ? "#f0fdf4" : "#fff",
              border: `1px solid ${paused ? "#86efac" : "#93c5fd"}`,
              color: paused ? "#16a34a" : "#2563eb",
              borderRadius: 6, cursor: "pointer", fontWeight: 600,
            }}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>

            <button onClick={handleSkipBatch} disabled={paused} style={{
              padding: "5px 14px", fontSize: 12, background: "#fff",
              border: "1px solid #fcd34d", color: "#b45309",
              borderRadius: 6, cursor: paused ? "not-allowed" : "pointer",
              opacity: paused ? 0.5 : 1, fontWeight: 600,
            }}>
              ⊘ Skip This Batch
            </button>

            <button onClick={handleCancel} style={{
              padding: "5px 14px", fontSize: 12, background: "#fff",
              border: "1px solid #fca5a5", color: "#dc2626",
              borderRadius: 6, cursor: "pointer",
            }}>
              ✕ Cancel Upload
            </button>
          </div>

          {batchLog.length > 0 && (
            <div style={{
              marginTop: 10, maxHeight: 200, overflowY: "auto",
              fontSize: 12, color: "#475569",
              borderTop: "1px solid #e2e8f0", paddingTop: 8,
            }}>
              {batchLog.map((b) => (
                <div key={b.batch} style={{
                  marginBottom: 6, paddingBottom: 6,
                  borderBottom: "1px solid #f1f5f9",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>Batch {b.batch}</span>
                    <span style={{
                      padding: "1px 7px", borderRadius: 99,
                      background: statusColor[b.status] + "22",
                      color: statusColor[b.status], fontWeight: 600, fontSize: 11,
                    }}>
                      {statusLabel[b.status]}
                    </span>
                    {b.succeeded > 0 && <span style={{ color: "#16a34a" }}>{b.succeeded} ok</span>}
                    {b.partial   > 0 && <span style={{ color: "#f59e0b" }}>{b.partial} partial</span>}
                    {b.failed    > 0 && <span style={{ color: "#dc2626" }}>{b.failed} failed</span>}
                    {b.skipped   > 0 && <span style={{ color: "#f97316" }}>{b.skipped} skipped</span>}
                    {b.reason    && <span style={{ color: "#64748b", fontStyle: "italic" }}>— {b.reason}</span>}
                  </div>
                  {b.fileErrors?.length > 0 && (
                    <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #fef3c7" }}>
                      {b.fileErrors.map((fe, i) => (
                        <div key={i} style={{ color: "#b45309", fontSize: 11, marginBottom: 2 }}>
                          <strong>{fe.farmer_id}</strong>:{" "}
                          {fe.files.map((f) => `${f.fileName} (${f.error})`).join(", ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!uploading && Object.keys(batchStatusMap).length > 0 && (
        <div style={{
          margin: "16px 0", padding: "12px 14px",
          border: "1px solid #e2e8f0", borderRadius: 8,
          background: "#f8fafc", fontSize: 13,
        }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>
            Batch Overview ({Object.keys(batchStatusMap).length} batches)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
            {Object.entries(batchStatusMap).map(([bNum, info]) => (
              <div key={bNum} style={{
                padding: "7px 10px", borderRadius: 6,
                border: `1px solid ${statusColor[info.status]}44`,
                background: statusColor[info.status] + "11",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>Batch {bNum}</span>
                  <span style={{ fontSize: 11, color: statusColor[info.status], fontWeight: 600 }}>
                    {statusLabel[info.status]}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {info.farmerIds.length} farmer{info.farmerIds.length !== 1 ? "s" : ""}
                </div>
                {info.reason && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 2, fontStyle: "italic", wordBreak: "break-word" }}>
                    {info.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stack-container">
        <div className="box green">
          <h3>Valid Data ({correctedRows.length})</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>farmer_id *</th>
                  <th>aadhar * <span style={{ color: "#2563eb", fontWeight: 400, fontSize: 11 }}>(multi-file)</span></th>
                  <th>agreement_letter * <span style={{ color: "#2563eb", fontWeight: 400, fontSize: 11 }}>(multi-file)</span></th>
                  <th>farmer_photo <span style={{ color: "#64748b", fontWeight: 400, fontSize: 11 }}>(optional)</span></th>
                  <th style={{ color: "#2563eb" }}>Total Files</th>
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, index) => {
                  const totalFiles =
                    (row.aadhar?.length          || 0) +
                    (row.agreement_letter?.length || 0) +
                    (row.farmer_photo?.length     || 0);
                  return (
                    <tr key={`${row.farmer_id}-${index}`}>
                      <td style={{ fontWeight: 600 }}>{row.farmer_id}</td>
                      <td>{renderFileBadge(row.aadhar)}</td>
                      <td>{renderFileBadge(row.agreement_letter)}</td>
                      <td>{renderFileBadge(row.farmer_photo)}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          fontWeight: 700,
                          color: totalFiles > 3 ? "#2563eb" : "#475569",
                          background: totalFiles > 3 ? "#eff6ff" : "transparent",
                          padding: totalFiles > 3 ? "1px 6px" : "0",
                          borderRadius: 4,
                        }}>
                          {totalFiles}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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

          {message  && <p style={{ color: "green" }}>{message}</p>}
          {dbError  && <p style={{ color: "red"   }}>{dbError}</p>}

          {uploadSummary && !uploading && (
            <div style={{
              marginTop: 12, padding: "12px 14px",
              background: uploadSummary.failed > 0 || uploadSummary.skipped > 0 ? "#fff7ed" : "#f0fdf4",
              border: `1px solid ${uploadSummary.failed > 0 || uploadSummary.skipped > 0 ? "#fed7aa" : "#bbf7d0"}`,
              borderRadius: 8, fontSize: 13,
            }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Upload Summary</p>
              <p>Total farmers: {uploadSummary.total}</p>
              <p>Batches: {uploadSummary.total_batches} × {uploadSummary.batch_size} farmers</p>
              <p style={{ color: "#16a34a" }}>Succeeded: {uploadSummary.succeeded}</p>
              <p style={{ color: "#f59e0b" }}>Partial: {uploadSummary.partial}</p>
              <p style={{ color: uploadSummary.failed  > 0 ? "#dc2626" : "#64748b" }}>Failed: {uploadSummary.failed}</p>
              <p style={{ color: uploadSummary.skipped > 0 ? "#f97316" : "#64748b" }}>Skipped: {uploadSummary.skipped}</p>

              {uploadSummary.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>Failed farmers:</p>
                  <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
                    {uploadSummary.errors.map((e, i) => (
                      <div key={i} style={{ color: "#dc2626", marginBottom: 2 }}>
                        {e.farmer_id}: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadSummary.fileErrors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontWeight: 600, color: "#b45309", marginBottom: 4 }}>Partial uploads:</p>
                  <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 12 }}>
                    {uploadSummary.fileErrors.map((fe, i) => (
                      <div key={i} style={{ color: "#b45309", marginBottom: 2 }}>
                        <strong>{fe.farmer_id}</strong> — {fe.docType}/{fe.fileName}: {fe.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
                        {col === "farmer_id" ? (
                          <input
                            value={row[col] ?? ""}
                            onChange={(e) => {
                              const updated = [...incorrectRows];
                              updated[index] = { ...updated[index], [col]: e.target.value };
                              setIncorrectRows(updated);
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 12, color: "#475569" }}>
                            {Array.isArray(row[col]) ? row[col].join(", ") : (row[col] ?? "—")}
                          </span>
                        )}
                      </td>
                    ))}
                    <td>
                      <span style={{ fontSize: 12, color: "#475569" }}>
                        {Array.isArray(row.farmer_photo) ? row.farmer_photo.join(", ") : (row.farmer_photo ?? "—")}
                      </span>
                    </td>
                    <td style={{ color: "red" }}>{row.__errors?.join(", ")}</td>
                    <td><button onClick={() => handleApprove(index)}>Approve</button></td>
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