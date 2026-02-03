import React, { useState } from "react";
import * as toGeoJSON from "@tmcw/togeojson";
import Papa from "papaparse";
import "../style/KmlTodatabase.css";

/* ---------------- ALLOWED DB FIELDS ---------------- */
const ALLOWED_FIELDS = [
  "farmer_id",
  "farmer_name",
  "project_id",
  "village",
  "gram_panchayat",
  "block",
  "district",
  "state",
  "parcel_id",
  "onboarding_date",
];

/* ---------------- VALIDATION ---------------- */
const validateRow = (row) => {
  const errors = [];

  ["farmer_name", "project_id", "village", "gram_panchayat", "block", "district", "state", "parcel_id"].forEach(
    (field) => {
      if (!row[field]?.trim()) errors.push(`${field} is required`);
    }
  );

  if (!row.farmer_id || isNaN(Number(row.farmer_id)) || Number(row.farmer_id) <= 0) {
    errors.push("farmer_id must be a valid number");
  }

  if (!row.onboarding_date || isNaN(new Date(row.onboarding_date).getTime())) {
    errors.push("onboarding_date must be a valid date");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const FarmerDataUpload = () => {
  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

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

  const normalizeFieldName = (name) => {
    if (!name) return "";
    const lower = name.trim().toLowerCase();
    const mapping = {
      "farmerid": "farmer_id",
      "farmer id": "farmer_id",
      "gram panchayat": "gram_panchayat",
      "parcel id": "parcel_id",
      "onboardingdate": "onboarding_date",
    };
    return mapping[lower] || lower;
  };

  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Please select a .kml, .json or .csv file first");
      return;
    }

    setMessage("Processing file...");

    try {
      const text = await file.text();
      let rawFeatures = [];

      // ───────── KML Parsing (Browser-safe) ─────────
      if (file.name.toLowerCase().endsWith(".kml")) {
        const parser = new DOMParser();
        const kmlDom = parser.parseFromString(text, "text/xml");
        const geojson = toGeoJSON.kml(kmlDom);
        rawFeatures = geojson.features.map((f) => f.properties || {});
      } 
      // ───────── JSON Parsing ─────────
      else if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(text);
        rawFeatures = Array.isArray(json) ? json : [json];
      } 
      // ───────── CSV Parsing ─────────
      else if (file.name.toLowerCase().endsWith(".csv")) {
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeFieldName,
          dynamicTyping: false,
        });

        if (result.errors.length > 0) {
          throw new Error(
            "CSV parsing error: " + result.errors.map((e) => e.message).join("; ")
          );
        }

        rawFeatures = result.data;
      } 
      else {
        throw new Error("Unsupported file type. Use .kml, .json or .csv");
      }

      // ───────── Normalize fields ─────────
      const processed = rawFeatures.map((row) => {
        const normalized = {};
        Object.entries(row).forEach(([key, val]) => {
          const normKey = normalizeFieldName(key);
          if (ALLOWED_FIELDS.includes(normKey)) {
            normalized[normKey] = val == null ? "" : String(val).trim();
          }
        });
        ALLOWED_FIELDS.forEach((f) => {
          if (!(f in normalized)) normalized[f] = "";
        });
        return normalized;
      });

      // ───────── Validate rows ─────────
      const valid = [];
      const invalid = [];
      processed.forEach((payload) => {
        const validation = validateRow(payload);
        if (validation.isValid) valid.push(payload);
        else invalid.push({ ...payload, __errors: validation.errors });
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setParsedData(valid);

      setMessage(
        `Validation complete\nValid rows: ${valid.length}   •   Invalid: ${invalid.length}`
      );
    } catch (err) {
      console.error(err);
      setMessage(`❌ ${err.message || "Failed to process file"}`);
    }
  };

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

    setMessage(
      `Updated → Valid: ${newValid.length}   •   Invalid: ${newIncorrect.length}`
    );
  };

  const handleSendToDB = async () => {
    if (!parsedData.length) return;

    setUploading(true);
    setMessage("Uploading to database...");

    try {
      const res = await fetch("https://datauploadingbackend-13977221722.asia-south2.run.app/api/farmerdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData),
      });

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
      <h2>Farmer Data Upload (.kml / .json / .csv)</h2>

      <div className="file-area">
        <input type="file" accept=".kml,.json,.csv" onChange={handleFileChange} />
        <button onClick={handleReadFile} disabled={!file}>
          1️⃣ Read & Validate File
        </button>
      </div>

      <div className="stack-container">
        {/* VALID DATA */}
        <div className="box green">
          <h3>✅ Valid Records ({correctedRows.length})</h3>

          {correctedRows.length === 0 ? (
            <p className="no-data">No valid records yet</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {correctedRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col}>{row[col] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading || parsedData.length === 0}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>
        </div>

        {message && <p className="status-message">{message}</p>}

        {/* INVALID / EDITABLE DATA */}
        <div className="box red">
          <h3>❌ Records to Fix ({incorrectRows.length})</h3>

          {incorrectRows.length === 0 ? (
            <p className="no-data">No incorrect records</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {columns.map((col) => <th key={col}>{col}</th>)}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incorrectRows.map((row, i) => (
                    <React.Fragment key={i}>
                      <tr>
                        {columns.map((col) => (
                          <td key={col}>
                            <input
                              className="edit-input"
                              value={row[col] ?? ""}
                              onChange={(e) => handleEdit(i, col, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="action-cell">
                          <button
                            className="approve-btn"
                            onClick={() => approveRow(i)}
                          >
                            Approve ✓
                          </button>
                        </td>
                      </tr>
                      {row.__errors && row.__errors.length > 0 && (
                        <tr className="error-row">
                          <td colSpan={columns.length + 1} style={{ color: "red", fontSize: "0.85em" }}>
                            ❌ {row.__errors.join(" • ")}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FarmerDataUpload;
