import React, { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "../style/KmlTodatabase.css";

/* ---------------- ALLOWED DB FIELDS ---------------- */
const ALLOWED_FIELDS = [
  "farmer_id",
  "OBJECTID",
  "id",
  "onboarding_date",
  "farmer_name",
  "state",
  "district",
  "blocks",
  "grampanchayat",
  "village",
  "land_owner",
  "relationship_to_land_owner",
  "plot_number",
  "project_code"
];

/* ---------------- VALIDATION ---------------- */
const validateRow = (row) => {
  const errors = [];

  ["farmer_name", "state", "district", "village"].forEach((field) => {
    if (!row[field]?.trim()) errors.push(`${field} is required`);
  });

  if (!row.farmer_id || isNaN(Number(row.farmer_id)) || Number(row.farmer_id) <= 0) {
    errors.push("farmer_id must be a valid number");
  }

  if (!row.onboarding_date || isNaN(new Date(row.onboarding_date).getTime())) {
    errors.push("onboarding_date must be a valid date");
  }

  return { isValid: errors.length === 0, errors };
};

/* ---------------- HEADER NORMALIZATION ---------------- */
const normalizeFieldName = (name) => {
  if (!name) return "";
  const lower = name.trim().toLowerCase();

  const mapping = {
    farmerid: "farmer_id",
    "farmer id": "farmer_id",
    objectid: "OBJECTID",
    onboardingdate: "onboarding_date",
    "onboarding date": "onboarding_date",
    "farmer name": "farmer_name",
    grampanchayat: "grampanchayat",
    "gram panchayat": "grampanchayat",
    landowner: "land_owner",
    "land owner": "land_owner",
    relationshiptolandowner: "relationship_to_land_owner",
    "relationship to land owner": "relationship_to_land_owner",
    plotnumber: "plot_number",
    "plot number": "plot_number",
    projectcode: "project_code",
    "project code": "project_code",
    blocks: "blocks",
    village: "village",
    district: "district",
    state: "state",
    id: "id"
  };

  return mapping[lower] || lower;
};

const FarmerDataUpload = () => {
  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const fileInputRef = useRef(null);

  /* ---------------- FILE CHANGE ---------------- */
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setCorrectedRows([]);
      setIncorrectRows([]);
      setParsedData([]);
      setMessage("");
    }
  };

  /* ---------------- RESET ---------------- */
  const handleReset = () => {
    setFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setParsedData([]);
    setMessage("");
    setUploading(false);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ---------------- READ & VALIDATE ---------------- */
  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Please select a .xlsx or .csv file first");
      return;
    }

    setMessage("Processing file...");

    try {
      let rawRows = [];

      /* ===== CSV ===== */
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();

        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeFieldName,
        });

        if (result.errors.length) {
          throw new Error(result.errors.map((e) => e.message).join("; "));
        }

        rawRows = result.data;
      }

      /* ===== EXCEL ===== */
      else if (file.name.toLowerCase().endsWith(".xlsx")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        rawRows = json.map((row) => {
          const normalized = {};
          Object.entries(row).forEach(([key, val]) => {
            const normKey = normalizeFieldName(key);
            normalized[normKey] = String(val).trim();
          });
          return normalized;
        });
      }

      else {
        throw new Error("Only .xlsx and .csv files are supported");
      }

      /* ===== FIELD FILTERING ===== */
      const processed = rawRows.map((row) => {
        const normalized = {};

        Object.entries(row).forEach(([key, val]) => {
          if (ALLOWED_FIELDS.includes(key)) {
            normalized[key] = val || "";
          }
        });

        ALLOWED_FIELDS.forEach((f) => {
          if (!(f in normalized)) normalized[f] = "";
        });

        return normalized;
      });

      const valid = [];
      const invalid = [];

      processed.forEach((row) => {
        const check = validateRow(row);
        if (check.isValid) valid.push(row);
        else invalid.push({ ...row, __errors: check.errors });
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setParsedData(valid);

      setMessage(`Validation complete • Valid: ${valid.length} | Invalid: ${invalid.length}`);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  };

  /* ---------------- EDIT ---------------- */
  const handleEdit = (index, field, value) => {
    const updated = [...incorrectRows];
    updated[index] = { ...updated[index], [field]: value };
    setIncorrectRows(updated);
  };

  const approveRow = (index) => {
    const row = { ...incorrectRows[index] };
    const newIncorrect = incorrectRows.filter((_, i) => i !== index);
    const newValid = [...correctedRows, row];

    setIncorrectRows(newIncorrect);
    setCorrectedRows(newValid);
    setParsedData(newValid);
  };

  /* ---------------- SEND TO DB ---------------- */
  const handleSendToDB = async () => {
    if (!parsedData.length) return;

    setUploading(true);
    setMessage("Uploading to database...");

    try {
      const res = await fetch(
        "https://datauploadingbackend-13977221722.asia-south2.run.app/api/farmerdata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedData),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      setMessage("✅ Successfully uploaded to database!");
    } catch (err) {
      setMessage(`❌ Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const columns =
    correctedRows.length > 0
      ? Object.keys(correctedRows[0])
      : incorrectRows.length > 0
      ? Object.keys(incorrectRows[0])
      : [];

  return (
    <div className="kml-upload-container">
      <h2>Farmer Data Upload (.xlsx / .csv)</h2>

      <div className="file-action-row">
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          ref={fileInputRef}
        />

        <div className="button-outline-row">
          <button onClick={handleReadFile} disabled={!file}>
            1️⃣ Read & Validate File
          </button>

          <button
            onClick={handleReset}
            className="reset-btn outline"
            disabled={!file && !correctedRows.length && !incorrectRows.length}
          >
            🔄 Reset
          </button>
        </div>
      </div>

      <div className="stack-container">
        {/* VALID */}
        <div className="box green">
          <h3>✅ Valid Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {correctedRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{row[c] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading || !parsedData.length}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          {message && <p className="upload-message">{message}</p>}
        </div>

        {/* INVALID */}
        <div className="box red">
          <h3>❌ Incorrect Data (Edit & Approve)</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => <th key={c}>{c}</th>)}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1}>No Incorrect Data</td>
                  </tr>
                ) : (
                  incorrectRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c}>
                          <input
                            value={row[c] || ""}
                            onChange={(e) => handleEdit(i, c, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => approveRow(i)}>Approve</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerDataUpload;