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
  "tree_count",
  "mode_of_data",
  "plantation_and_monitoring_date",
];

/* ---------------- REQUIRED HEADERS ---------------- */
const REQUIRED_HEADERS = ["parcel_id", "species_name", "tree_count"];

/* ---------------- FLEXIBLE DATE PARSER ---------------- */
// FIX #1: Moved OUTSIDE validateRow so it can be reused in handleSendToDB
const parseFlexibleDate = (value) => {
  if (!value) return null;

  // Already a numeric timestamp
  if (!isNaN(value) && String(value).length >= 10) {
    const timestampDate = new Date(Number(value));
    if (!isNaN(timestampDate.getTime())) return timestampDate;
  }

  let str = value.toString().trim();

  // Replace dots with slash
  str = str.replace(/\./g, "/");

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) {
    const [day, month, year] = str.split(/[-/]/);
    str = `${year}-${month}-${day}`;
  }
  // MM/DD/YYYY
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [month, day, year] = str.split("/");
    str = `${year}-${month}-${day}`;
  }
  // YYYY-MM-DD → already fine, no change needed

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
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

    const value = rawValue.toString().trim();

    if (
      value === "" ||
      value.toLowerCase() === "not available" ||
      value.toLowerCase() === "na"
    ) {
      cleaned[key] = null;
      return;
    }

    if (key === "tree_count") {
      cleaned[key] = Number(value);
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

  if (row.tree_count === null || row.tree_count === undefined || row.tree_count === "") {
    errors.push("tree_count is required");
  } else if (Number.isNaN(Number(row.tree_count)) || Number(row.tree_count) <= 0) {
    errors.push("tree_count must be a valid positive number");
  }

  // FIX #2: Actually validate the date field using parseFlexibleDate
  if (
    row.plantation_and_monitoring_date !== null &&
    row.plantation_and_monitoring_date !== undefined &&
    row.plantation_and_monitoring_date !== ""
  ) {
    const parsed = parseFlexibleDate(row.plantation_and_monitoring_date);
    if (!parsed) {
      errors.push("plantation_and_monitoring_date is not a valid date");
    }
  }

  return { isValid: errors.length === 0, errors };
};

/* ---------------- HEADER NORMALIZATION ---------------- */
const normalizeFieldName = (name) => {
  if (!name) return "";

  const lower = name.trim().toLowerCase();

  const mapping = {
    parcelid: "parcel_id",
    "parcel id": "parcel_id",
    parcel_id: "parcel_id",

    projectcode: "project_code",
    "project code": "project_code",
    project_code: "project_code",

    speciesname: "species_name",
    "species name": "species_name",
    species_name: "species_name",

    treecount: "tree_count",
    "tree count": "tree_count",
    tree_count: "tree_count",

    modeofdata: "mode_of_data",
    "mode of data": "mode_of_data",
    mode_of_data: "mode_of_data",

    plantationandmonitoringdate: "plantation_and_monitoring_date",
    "plantation and monitoring date": "plantation_and_monitoring_date",
    "plantation monitoring date": "plantation_and_monitoring_date",
    plantation_and_monitoring_date: "plantation_and_monitoring_date",
  };

  return mapping[lower] || lower;
};

const TreeDataUpload = () => {
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReadFile = async () => {
    if (!file) {
      setMessage("Please select file");
      return;
    }

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

      rawRows.forEach((row) => {
        let filtered = {};
        ALLOWED_FIELDS.forEach((field) => {
          filtered[field] = row[field] ?? null;
        });

        filtered = sanitizeRow(filtered);
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

    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user?.user_id || user?.id;

    // FIX #3: Use parseFlexibleDate instead of plain new Date() for correct date parsing
    const cleanedData = correctedRows.map((row) => ({
      parcel_id: row.parcel_id,
      project_code: row.project_code || null,
      species_name: row.species_name,
      tree_count: Number(row.tree_count),
      mode_of_data: row.mode_of_data || null,
      plantation_and_monitoring_date: row.plantation_and_monitoring_date
        ? parseFlexibleDate(row.plantation_and_monitoring_date)
        : null,
      uploaded_by: userId || "system",
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

  // FIX #4: Inline edit handler now re-runs validation and updates __errors live
  const handleIncorrectRowChange = (index, column, value) => {
    const updated = incorrectRows.map((row, i) => {
      if (i !== index) return row;

      const updatedRow = { ...row, [column]: value };
      const rowWithoutErrors = { ...updatedRow };
      delete rowWithoutErrors.__errors;

      const cleaned = sanitizeRow(rowWithoutErrors);
      const check = validateRow(cleaned);

      return { ...cleaned, __errors: check.errors };
    });

    setIncorrectRows(updated);
  };

  const handleApproveRow = (index) => {
    const row = incorrectRows[index];
    const rowWithoutErrors = { ...row };
    delete rowWithoutErrors.__errors;

    const cleaned = sanitizeRow(rowWithoutErrors);
    const check = validateRow(cleaned);

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

      <button onClick={handleReadFile} disabled={!file}>
        Read & Validate
      </button>

      <button onClick={handleReset}>Reset</button>

      <div className="stack-container">
        <div className="box green">
          <h3>Valid Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>
                      {REQUIRED_HEADERS.includes(column) ? `${column} *` : column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {correctedRows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column}>{row[column] ?? ""}</td>
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

        <div className="box red">
          <h3>Incorrect Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>
                      {REQUIRED_HEADERS.includes(column) ? `${column} *` : column}
                    </th>
                  ))}
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {incorrectRows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column}>
                        {/* FIX #4: Uses extracted handler with live re-validation */}
                        <input
                          value={row[column] ?? ""}
                          onChange={(e) =>
                            handleIncorrectRowChange(index, column, e.target.value)
                          }
                        />
                      </td>
                    ))}

                    <td style={{ color: "red", fontSize: "12px" }}>
                      {row.__errors?.join(", ")}
                    </td>

                    <td>
                      <button onClick={() => handleApproveRow(index)}>
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

export default TreeDataUpload;