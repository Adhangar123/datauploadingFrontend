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

/* ---------------- REQUIRED HEADERS ---------------- */
const REQUIRED_HEADERS = [
  "farmer_id",
  "project_code",
  "farmer_name"
];

/* ---------------- UNIVERSAL SANITIZER ---------------- */
const sanitizeRow = (row) => {
  const cleaned = {};

  Object.keys(row).forEach((key) => {
    const rawValue = row[key];

    if (rawValue === undefined || rawValue === null) {
      cleaned[key] = null;
      return;
    }

    const value = rawValue.toString().trim().toLowerCase();

    if (
      value === "" ||
      value === "not available" ||
      value === "na"
    ) {
      cleaned[key] = null;
    } else {
      cleaned[key] = rawValue;
    }
  });

  return cleaned;
};

/* ---------------- VALIDATION ---------------- */
const validateRow = (row, existingFarmerIds = []) => {
  const errors = [];
  const farmerIdPattern = /^[A-Za-z0-9-]+$/;

  if (!row.farmer_id) errors.push("farmer_id is required");
  if (!row.farmer_name) errors.push("farmer_name is required");
  if (!row.project_code) errors.push("project_code is required");

  if (row.farmer_id && !farmerIdPattern.test(row.farmer_id.trim())) {
    errors.push("farmer_id must be alphanumeric (letters, numbers, dash only)");
  }

  if (existingFarmerIds.includes(row.farmer_id?.trim())) {
    errors.push("Duplicate farmer_id in file");
  }

  if (row.OBJECTID !== null && row.OBJECTID !== "" && isNaN(Number(row.OBJECTID))) {
    errors.push("OBJECTID must be number");
  }

  if (row.id !== null && row.id !== "" && isNaN(Number(row.id))) {
    errors.push("id must be number");
  }

  if (row.plot_number !== null && row.plot_number !== "" && isNaN(Number(row.plot_number))) {
    errors.push("plot_number must be number");
  }

  if (row.onboarding_date !== null && row.onboarding_date !== "") {
    const date = new Date(row.onboarding_date);
    if (isNaN(date.getTime())) {
      errors.push("onboarding_date must be valid date");
    }
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
    "gram panchayat": "grampanchayat",
    landowner: "land_owner",
    "land owner": "land_owner",
    relationshiptolandowner: "relationship_to_land_owner",
    "relationship to land owner": "relationship_to_land_owner",
    plotnumber: "plot_number",
    "plot number": "plot_number",
    projectcode: "project_code",
    "project code": "project_code",
  };

  return mapping[lower] || lower;
};

const FarmerDataUpload = () => {

  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [dbError, setDbError] = useState("");   // ✅ NEW ERROR BOX
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

  /* ---------------- SEND TO DB ---------------- */
  const handleSendToDB = async () => {
    if (!correctedRows.length) return;

    setUploading(true);
    setDbError("");
    setMessage("Uploading...");

    const cleanedData = correctedRows.map((row) => ({
      ...row,
      OBJECTID: row.OBJECTID ? Number(row.OBJECTID) : null,
      id: row.id ? Number(row.id) : null,
      onboarding_date: row.onboarding_date
        ? new Date(row.onboarding_date)
        : null,
    }));

    try {
      const res = await fetch(
        "https://datauploadingbackend-13977221722.asia-south2.run.app/api/farmerdata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanedData),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setDbError(data.message || "Database error occurred");
        return;
      }

      setMessage("Successfully uploaded!");
    } catch (err) {
      setDbError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const columns = ALLOWED_FIELDS;


  return (
    <div className="kml-upload-container">
      <h2>Farmer Data Upload (.xlsx / .csv)</h2>

      <input type="file" accept=".xlsx,.csv" onChange={handleFileChange} ref={fileInputRef} />

      <button onClick={handleReadFile} disabled={!file}>
        1️⃣ Read & Validate
      </button>

      <button onClick={handleReset}>🔄 Reset</button>

      <div className="stack-container">

        {/* VALID DATA */}
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
                    {columns.map((c) => <td key={c}>{row[c]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={handleSendToDB} disabled={uploading}>
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          <p>{message}</p>
        </div>

        {/* INVALID DATA */}
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
                            correctedRows.map(r => r.farmer_id)
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