import React, { useState, useRef } from "react";
import { uploadFarmerData } from "../api/FarmerDataApi";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "../style/KmlTodatabase.css";

/* ---------------- ALLOWED DB FIELDS ---------------- */
const ALLOWED_FIELDS = [
  "farmer_id",
  "onboarding_date",
  "farmer_name",
  "state",
  "district",
  "blocks",
  "grampanchayat",
  "village",
  "project_code",
  "intervention_area_type",  // ✅ NEW
  "survey_date",             // ✅ NEW
  "interviewer_name",        // ✅ NEW
  "gender"                   // ✅ NEW
];

/* ---------------- REQUIRED HEADERS ---------------- */
const REQUIRED_HEADERS = [
  "farmer_id",
  "project_code",
  "farmer_name"
];

/* ---------------- NAME HELPER ---------------- */
const parseNames = (value) => {
  if (!value) return [];
  return value
    .toString()
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
};

/* ---------------- SANITIZER ---------------- */
const sanitizeRow = (row) => {
  const cleaned = {};

  Object.keys(row).forEach((key) => {
    const rawValue = row[key];

    if (rawValue === undefined || rawValue === null) {
      cleaned[key] = null;
      return;
    }

    // 🔥 farmer_name special handling
    if (key === "farmer_name") {
      const names = parseNames(rawValue);
      const unique = [...new Set(names.map((n) => n.toLowerCase()))];
      cleaned[key] = unique.length ? names.join(", ") : null;
      return;
    }

    const value = rawValue.toString().trim().toLowerCase();

    cleaned[key] =
      value === "" || value === "not available" || value === "na"
        ? null
        : rawValue;
  });

  return cleaned;
};

/* ---------------- VALIDATION ---------------- */
const validateRow = (row, existingRows = []) => {
  const errors = [];
const farmerIdPattern = /^[A-Za-z0-9-_]+$/;

  if (!row.farmer_id) errors.push("farmer_id is required");
  if (!row.project_code) errors.push("project_code is required");

  const names = parseNames(row.farmer_name);
  if (!names.length) errors.push("farmer_name is required");

  if (row.farmer_id && !farmerIdPattern.test(row.farmer_id.trim())) {
    errors.push("farmer_id must be alphanumeric (letters, numbers, dash only)");
  }

  // 🔥 Allow same farmer_id, but prevent exact duplicate name
  const duplicate = existingRows.find((r) => {
    if (r.farmer_id?.trim() !== row.farmer_id?.trim()) return false;

    const existingNames = parseNames(r.farmer_name).map((n) =>
      n.toLowerCase()
    );
    return names.some((n) => existingNames.includes(n.toLowerCase()));
  });

  if (duplicate) {
    errors.push("Duplicate farmer_id + farmer_name already exists");
  }

  if (row.onboarding_date) {
    const date = new Date(row.onboarding_date);
    if (isNaN(date.getTime())) {
      errors.push("onboarding_date must be valid date");
    }
  }

  // ✅ NEW: survey_date validation
  if (row.survey_date) {
    const date = new Date(row.survey_date);
    if (isNaN(date.getTime())) {
      errors.push("survey_date must be valid date");
    }
  }

  // ✅ NEW: gender validation (optional but if provided must be valid)
  const validGenders = ["male", "female", "other"];
  if (row.gender && !validGenders.includes(row.gender.toString().trim().toLowerCase())) {
    errors.push("gender must be male, female, or other");
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
    onboardingdate: "onboarding_date",
    "onboarding date": "onboarding_date",
    "farmer name": "farmer_name",
    farmername: "farmer_name",
    "gram panchayat": "grampanchayat",
    projectcode: "project_code",
    "project code": "project_code",
    // ✅ NEW mappings
    interventionareatype: "intervention_area_type",
    "intervention area type": "intervention_area_type",
    surveydate: "survey_date",
    "survey date": "survey_date",
    interviewername: "interviewer_name",
    "interviewer name": "interviewer_name",
  };

  return mapping[lower] || lower;
};

const FarmerDataUpload = () => {
  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [dbError, setDbError] = useState("");
  const fileInputRef = useRef(null);

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
    if (!file) return setMessage("Please select file");

    try {
      let rawRows = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeFieldName,
        });
        rawRows = result.data;
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        rawRows = json.map((row) => {
          const normalized = {};
          Object.entries(row).forEach(([key, val]) => {
            normalized[normalizeFieldName(key)] = val;
          });
          return normalized;
        });
      }

      const valid = [];
      const invalid = [];
      const farmerIds = [];

      rawRows.forEach((row) => {
        let filtered = {};
        ALLOWED_FIELDS.forEach((f) => {
          filtered[f] = row[f] ?? null;
        });

        filtered = sanitizeRow(filtered);
        const check = validateRow(filtered, farmerIds);

        if (check.isValid) {
          farmerIds.push(filtered.farmer_id?.trim());
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

  const user = JSON.parse(localStorage.getItem("user"));
  const userId = user?.user_id;

  if (!userId) {
    setDbError("❌ User not logged in");
    setUploading(false);
    return;
  }

  const cleanedData = correctedRows.map((row) => ({
    ...row,

    // 🔥 FINAL FIX
    created_by: userId,
    updated_by: userId,

    onboarding_date: row.onboarding_date
      ? new Date(row.onboarding_date)
      : null,

    survey_date: row.survey_date
      ? new Date(row.survey_date)
      : null,

    farmer_name: row.farmer_name,
  }));

  try {
    await uploadFarmerData(cleanedData);
    setMessage("✅ Successfully uploaded!");
  } catch (err) {
    setDbError("❌ " + err.message);
  } finally {
    setUploading(false);
  }
};

  const columns = ALLOWED_FIELDS;

  return (
    <div className="kml-upload-container">
      <h2>Farmer Data Upload (.xlsx / .csv)</h2>

      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={handleFileChange}
        ref={fileInputRef}
      />

      <button onClick={handleReadFile} disabled={!file}>
        1️⃣ Read & Validate
      </button>

      <button onClick={handleReset}>🔄 Reset</button>

      <div className="stack-container">

        {/* VALID */}
        <div className="box green">
          <h3>✅ Valid Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      {REQUIRED_HEADERS.includes(c) ? `${c} *` : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{row[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          <p>{message}</p>
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}
        </div>

        {/* INVALID */}
        <div className="box red">
          <h3>❌ Incorrect Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      {REQUIRED_HEADERS.includes(c) ? `${c} *` : c}
                    </th>
                  ))}
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        <input
                          value={row[c] ?? ""}
                          onChange={(e) => {
                            const updated = [...incorrectRows];
                            updated[i][c] = e.target.value;
                            setIncorrectRows(updated);
                          }}
                        />
                      </td>
                    ))}
                    <td style={{ color: "red", fontSize: "12px" }}>
                      {row.__errors?.join(", ")}
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          const cleaned = sanitizeRow(row);
                          const check = validateRow(
                            cleaned,
                            correctedRows.map((r) => r.farmer_id)
                          );

                          if (!check.isValid) {
                            alert("Still invalid:\n" + check.errors.join("\n"));
                            return;
                          }

                          setCorrectedRows([...correctedRows, cleaned]);
                          setIncorrectRows(
                            incorrectRows.filter((_, idx) => idx !== i)
                          );
                        }}
                      >
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

export default FarmerDataUpload;