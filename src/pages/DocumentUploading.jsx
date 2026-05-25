import React, { useState, useRef } from "react";
import { uploadFarmerDocsZip } from "../api/farmerDocsApi";
import "../style/KmlTodatabase.css";

// farmer_photo is optional — not included in required headers
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
  const [zipRootFolder, setZipRootFolder] = useState(null); // ✅ ZIP root folder track karo
  const [message, setMessage] = useState("");
  const [dbError, setDbError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);

  const fileInputRef = useRef();

  const handleZipSelect = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Please select a .zip file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setZipFile(file);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setZipRootFolder(null);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
  };

  const handleReadFile = async () => {
    if (!zipFile) return;

    setPreviewing(true);
    setMessage("");
    setDbError("");
    setUploadSummary(null);
    setZipRootFolder(null);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipFile);
      const farmerMap = {};
      let detectedRootFolder = null; // ✅ ZIP root folder detect karo

      for (const [relPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;

        const parts = relPath
          .replace(/\\/g, "/")
          .replace(/^\//, "")
          .split("/")
          .filter(Boolean);

        // Minimum: <root>/<docType>/<farmerId>/<file> = 4 parts
        if (parts.length < 4) continue;

        // ✅ Pehla part ZIP root folder hai (e.g. "Prasari")
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

        // ✅ Root folder pehli valid entry se set karo
        if (!detectedRootFolder) {
          detectedRootFolder = rootFolder;
        }

        if (!farmerMap[farmerId]) {
          farmerMap[farmerId] = { farmer_id: farmerId };
        }

        farmerMap[farmerId][mappedDocType] = fileName;
      }

      // ✅ Detected root folder state mein save karo
      setZipRootFolder(detectedRootFolder);

      const valid = [];
      const invalid = [];
      const seenIds = new Set();

      for (const row of Object.values(farmerMap)) {
        const errors = [];

        if (!row.farmer_id) errors.push("farmer_id missing");
        if (!row.aadhar) errors.push("aadhar missing");
        if (!row.agreement_letter) errors.push("agreement_letter missing");
        // farmer_photo is optional — no error if missing

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
          "No valid files found. Expected ZIP structure: <FolderName>/aadhar/<farmer_id>/<file>, <FolderName>/agreement_letter/<farmer_id>/<file>, <FolderName>/farmer_photo/<farmer_id>/<file> (optional)"
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

  const handleSendToDB = async () => {
    if (!zipFile || correctedRows.length === 0) return;

    try {
      setUploading(true);
      setMessage("");
      setDbError("");
      setUploadSummary(null);

      const data = await uploadFarmerDocsZip(zipFile);

      setMessage(data.message || "ZIP uploaded successfully");
      setUploadSummary(data);
    } catch (err) {
      console.error(err);
      setDbError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err.message ||
          "Upload failed"
      );
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setZipFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setZipRootFolder(null);
    setMessage("");
    setDbError("");
    setUploadSummary(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
        </span>
      )}

      <button onClick={handleReadFile} disabled={!zipFile || previewing}>
        {previewing ? "Reading..." : "1. Read & Validate"}
      </button>

      <button onClick={handleReset}>Reset</button>

      <div className="stack-container">
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
            {uploading ? "Uploading..." : "2. Send to Database"}
          </button>

          {message && <p style={{ color: "green" }}>{message}</p>}
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}

          {/* ✅ Upload summary mein zip_folder bhi dikhao */}
          {uploadSummary && (
            <div style={{ marginTop: 10, fontSize: 14 }}>
              <p>Total: {uploadSummary.total}</p>
              <p>Succeeded: {uploadSummary.succeeded}</p>
              <p>Failed: {uploadSummary.failed}</p>
            </div>
          )}
        </div>

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