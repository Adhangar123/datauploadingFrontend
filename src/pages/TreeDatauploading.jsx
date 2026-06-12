import React, { useState, useRef } from "react";
import { uploadTreeData } from "../api/TreeDataApi";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "../style/KmlTodatabase.css";

/* ---------------- ALLOWED DB FIELDS ---------------- */
const ALLOWED_FIELDS = [
  "parcel_id",
  "project_code",
  "species_name",
  "plantation_type",
  "plantation_year",
  "surviving_plants",
  "actual_planted",
  "mortality",
  "actual_area_ha", // ✅ Added
];

/* ---------------- REQUIRED HEADERS ---------------- */
const REQUIRED_HEADERS = ["parcel_id", "species_name"];

/* ---------------- SANITIZER ---------------- */
const sanitizeRow = (row) => {
  const cleaned = {};

  Object.keys(row).forEach((key) => {
    const rawValue = row[key];

    if (rawValue === undefined || rawValue === null) {
      cleaned[key] = null;
      return;
    }

    const value = rawValue.toString().trim();

    if (
      value === "" ||
      value.toLowerCase() === "not available" ||
      value.toLowerCase() === "na"
    ) {
      cleaned[key] = null;
      return;
    }

    // Numeric fields
    if (
      ["plantation_year", "surviving_plants", "actual_planted", "mortality", "actual_area_ha"].includes(key) // ✅ Added
    ) {
      const num = Number(value);
      cleaned[key] = isNaN(num) ? null : num;
      return;
    }

    cleaned[key] = value;
  });

  return cleaned;
};

/* ---------------- VALIDATION ---------------- */
const validateRow = (row) => {
  const errors = [];

  if (!row.parcel_id) errors.push("parcel_id is required");
  if (!row.species_name) errors.push("species_name is required");

  if (
    row.plantation_year !== null &&
    row.plantation_year !== undefined &&
    row.plantation_year !== ""
  ) {
    const yr = Number(row.plantation_year);
    if (isNaN(yr) || yr < 1900 || yr > 2100) {
      errors.push("plantation_year must be a valid year (1900–2100)");
    }
  }

  if (
    row.surviving_plants !== null &&
    row.surviving_plants !== undefined &&
    row.surviving_plants !== "" &&
    isNaN(Number(row.surviving_plants))
  ) {
    errors.push("surviving_plants must be a valid number");
  }

  if (
    row.actual_planted !== null &&
    row.actual_planted !== undefined &&
    row.actual_planted !== "" &&
    isNaN(Number(row.actual_planted))
  ) {
    errors.push("actual_planted must be a valid number");
  }

  if (
    row.mortality !== null &&
    row.mortality !== undefined &&
    row.mortality !== "" &&
    isNaN(Number(row.mortality))
  ) {
    errors.push("mortality must be a valid number");
  }

  // ✅ Added
  if (
    row.actual_area_ha !== null &&
    row.actual_area_ha !== undefined &&
    row.actual_area_ha !== "" &&
    isNaN(Number(row.actual_area_ha))
  ) {
    errors.push("actual_area_ha must be a valid number");
  }

  return { isValid: errors.length === 0, errors };
};

/* ---------------- HEADER NORMALIZATION ---------------- */
const normalizeFieldName = (name) => {
  if (!name) return "";

  const lower = name.trim().toLowerCase();

  const mapping = {
    // parcel_id
    parcelid:       "parcel_id",
    "parcel id":    "parcel_id",
    parcel_id:      "parcel_id",

    // project_code
    projectcode:    "project_code",
    "project code": "project_code",
    project_code:   "project_code",

    // species_name
    speciesname:    "species_name",
    "species name": "species_name",
    species_name:   "species_name",

    // plantation_type
    plantationtype:    "plantation_type",
    "plantation type": "plantation_type",
    plantation_type:   "plantation_type",

    // plantation_year
    plantationyear:    "plantation_year",
    "plantation year": "plantation_year",
    plantation_year:   "plantation_year",

    // surviving_plants
    survivingplants:    "surviving_plants",
    "surviving plants": "surviving_plants",
    surviving_plants:   "surviving_plants",

    // actual_planted
    actualplanted:    "actual_planted",
    "actual planted": "actual_planted",
    actual_planted:   "actual_planted",

    // mortality
    mortality: "mortality",

    // actual_area_ha ✅ Added
    actualareaHA:       "actual_area_ha",
    actualareaha:       "actual_area_ha",
    "actual area ha":   "actual_area_ha",
    "actual area (ha)": "actual_area_ha",
    actual_area_ha:     "actual_area_ha",
  };

  return mapping[lower] || lower;
};

/* ---------------- COMPONENT ---------------- */
const TreeDataUpload = () => {
  const [file, setFile]                   = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [uploading, setUploading]         = useState(false);
  const [message, setMessage]             = useState("");
  const [dbError, setDbError]             = useState("");
  const fileInputRef                      = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setMessage("");
    setDbError("");
  };

  const handleReset = () => {
    setFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setMessage("");
    setDbError("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReadFile = async () => {
    if (!file) { setMessage("Please select file"); return; }

    try {
      let rawRows = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const text   = await file.text();
        const result = Papa.parse(text, {
          header:          true,
          skipEmptyLines:  true,
          transformHeader: normalizeFieldName,
        });
        rawRows = result.data;
      } else {
        const buffer   = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const json     = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        rawRows = json.map((row) => {
          const normalized = {};
          Object.entries(row).forEach(([key, val]) => {
            normalized[normalizeFieldName(key)] = val;
          });
          return normalized;
        });
      }

      const valid   = [];
      const invalid = [];

      rawRows.forEach((row) => {
        let filtered = {};
        ALLOWED_FIELDS.forEach((field) => {
          filtered[field] = row[field] ?? null;
        });

        filtered    = sanitizeRow(filtered);
        const check = validateRow(filtered);

        if (check.isValid) {
          valid.push(filtered);
        } else {
          invalid.push({ ...filtered, __errors: check.errors });
        }
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setMessage(`Valid: ${valid.length} | Invalid: ${invalid.length}`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSendToDB = async () => {
    if (!correctedRows.length) return;

    setUploading(true);
    setDbError("");
    setMessage("Uploading...");

    const user   = JSON.parse(localStorage.getItem("user"));
    const userId = user?.user_id || user?.id;

    const cleanedData = correctedRows.map((row) => ({
      parcel_id:        row.parcel_id,
      project_code:     row.project_code     || null,
      species_name:     row.species_name,
      plantation_type:  row.plantation_type  || null,
      plantation_year:  row.plantation_year  ? Number(row.plantation_year)  : null,
      uploaded_by:      userId               || "system",
      surviving_plants: row.surviving_plants ? Number(row.surviving_plants) : null,
      actual_planted:   row.actual_planted   ? Number(row.actual_planted)   : null,
      mortality:        row.mortality        ? Number(row.mortality)        : null,
      actual_area_ha:   row.actual_area_ha   ? Number(row.actual_area_ha)   : null, // ✅ Added
    }));

    try {
      const response = await uploadTreeData(cleanedData);
      setMessage(
        `Successfully uploaded! Processed: ${response?.processed ?? cleanedData.length}, Failed: ${response?.failed ?? 0}`
      );
      if (response?.errors?.length) {
        setDbError(response.errors.map((e) => e.message).join(", "));
      }
    } catch (err) {
      setDbError(err.message || "Upload failed");
      setMessage("");
    } finally {
      setUploading(false);
    }
  };

  const handleIncorrectRowChange = (index, column, value) => {
    const updated = incorrectRows.map((row, i) => {
      if (i !== index) return row;

      const updatedRow = { ...row, [column]: value };
      const rowWithoutErrors = { ...updatedRow };
      delete rowWithoutErrors.__errors;

      const cleaned = sanitizeRow(rowWithoutErrors);
      const check   = validateRow(cleaned);

      return { ...cleaned, __errors: check.errors };
    });

    setIncorrectRows(updated);
  };

  const handleApproveRow = (index) => {
    const row = incorrectRows[index];
    const rowWithoutErrors = { ...row };
    delete rowWithoutErrors.__errors;

    const cleaned = sanitizeRow(rowWithoutErrors);
    const check   = validateRow(cleaned);

    if (!check.isValid) {
      alert("Still invalid:\n" + check.errors.join("\n"));
      return;
    }

    setCorrectedRows([...correctedRows, cleaned]);
    setIncorrectRows(incorrectRows.filter((_, idx) => idx !== index));
  };

  const columns = ALLOWED_FIELDS;

  return (
    <div className="kml-upload-container">
      <h2>Tree Data Upload (.xlsx / .csv)</h2>

      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={handleFileChange}
        ref={fileInputRef}
      />

      <button onClick={handleReadFile} disabled={!file}>Read & Validate</button>
      <button onClick={handleReset}>Reset</button>

      <div className="stack-container">
        {/* ---------- VALID TABLE ---------- */}
        <div className="box green">
          <h3>Valid Data</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>
                      {REQUIRED_HEADERS.includes(col) ? `${col} *` : col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col}>{row[col] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading || !correctedRows.length}
          >
            {uploading ? "Uploading..." : "Send to Database"}
          </button>

          <p>{message}</p>
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}
        </div>

        {/* ---------- INVALID TABLE ---------- */}
        <div className="box red">
          <h3>Incorrect Data</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>
                      {REQUIRED_HEADERS.includes(col) ? `${col} *` : col}
                    </th>
                  ))}
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col}>
                        <input
                          value={row[col] ?? ""}
                          onChange={(e) =>
                            handleIncorrectRowChange(i, col, e.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td style={{ color: "red", fontSize: "12px" }}>
                      {row.__errors?.join(", ")}
                    </td>
                    <td>
                      <button onClick={() => handleApproveRow(i)}>Approve</button>
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

export default TreeDataUpload;