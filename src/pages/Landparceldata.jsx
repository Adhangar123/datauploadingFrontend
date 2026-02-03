import React, { useState } from "react";
import "../style/KmlTodatabase.css";
import { kml } from "@tmcw/togeojson";

/* =========================
   ALLOWED FIELDS
========================= */
const ALLOWED_FIELDS = [
  "project_id",
  "parcel_id",
  "farmer_id",
  "onboarding_date",
  "area_ha",
  "farmer_name",
];

/* =========================
   VALIDATION
========================= */
const validateRow = (row) => {
  const errors = [];

  // Extra fields check
  Object.keys(row).forEach((key) => {
    if (!ALLOWED_FIELDS.includes(key)) {
      errors.push(`Invalid field: ${key}`);
    }
  });

  // Required fields
  if (!row.project_id?.trim()) errors.push("project_id missing");
  if (!row.parcel_id?.trim()) errors.push("parcel_id missing");
  if (!row.farmer_id?.trim()) errors.push("farmer_id missing");
  if (!row.onboarding_date?.trim()) errors.push("onboarding_date missing");
  if (!row.farmer_name?.trim()) errors.push("farmer_name missing");

  // area_ha must be a positive number
  if (!row.area_ha || isNaN(Number(row.area_ha)) || Number(row.area_ha) <= 0)
    errors.push("area_ha invalid");

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/* =========================
   CSV PARSER
========================= */
const parseCSV = (text) => {
  const lines = text.split("\n").filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i]?.trim() ?? "";
    });
    return obj;
  });
};

/* =========================
   KML PARSER (OPTIONAL)
========================= */
const parseKML = async (file) => {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const geojson = kml(xml);

  return geojson.features.map((f) => ({
    project_id: f.properties?.project_id || "",
    parcel_id: f.properties?.parcel_id || "",
    farmer_id: f.properties?.farmer_id || "",
    onboarding_date: f.properties?.onboarding_date || "",
    area_ha: Number(f.properties?.area_ha || 0),
    farmer_name: f.properties?.farmer_name || "",
  }));
};

/* =========================
   COMPONENT
========================= */
const Landparceldata = () => {
  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setParsedData([]);
    setMessage("");
  };

  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Please select CSV or KML file");
      return;
    }

    try {
      let rows = [];

      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (file.name.endsWith(".kml")) {
        rows = await parseKML(file);
      }

      const valid = [];
      const invalid = [];

      rows.forEach((r) => {
        const payload = {
          project_id: r.project_id ?? "",
          parcel_id: r.parcel_id ?? "",
          farmer_id: r.farmer_id ?? "",
          onboarding_date: r.onboarding_date ?? "",
          area_ha: Number(r.area_ha ?? 0),
          farmer_name: r.farmer_name ?? "",
        };

        const { isValid } = validateRow(payload);
        isValid ? valid.push(payload) : invalid.push(payload);
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setParsedData(valid);

      setMessage(
        `✅ Validation Done | Valid: ${valid.length} | Invalid: ${invalid.length}`
      );
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  };

  const handleEdit = (rowIndex, field, value) => {
    const updated = [...incorrectRows];
    updated[rowIndex][field] = value;
    setIncorrectRows(updated);
  };

  const approveRow = (index) => {
    const row = incorrectRows[index];

    // Re-validate edited row
    const { isValid } = validateRow(row);

    if (!isValid) {
      setMessage("❌ Row is still invalid. Please correct data before approving.");
      return;
    }

    // Move to corrected
    const updatedIncorrect = incorrectRows.filter((_, i) => i !== index);
    const updatedCorrected = [...correctedRows, row];

    setIncorrectRows(updatedIncorrect);
    setCorrectedRows(updatedCorrected);
    setParsedData(updatedCorrected);

    setMessage(
      `✅ Validation Updated | Valid: ${updatedCorrected.length} | Invalid: ${updatedIncorrect.length}`
    );
  };

  const handleSendToDB = async () => {
    if (!parsedData.length) return;

    setUploading(true);
    try {
      const res = await fetch("https://datauploadingbackend-13977221722.asia-south2.run.app/api/land-parcel/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      setMessage(`✅ Data uploaded successfully | Inserted: ${result.inserted}`);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const columns = correctedRows.length
    ? Object.keys(correctedRows[0])
    : incorrectRows.length
    ? Object.keys(incorrectRows[0])
    : [];

  return (
    <div className="kml-upload-container">
      <h2>CSV / KML → Land Parcel Data Upload</h2>

      <input type="file" accept=".csv,.kml" onChange={handleFileChange} />
      <button onClick={handleReadFile}>1️⃣ Read & Validate File</button>

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
                      <td key={c}>{String(row[c])}</td>
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
                    <td colSpan={columns.length + 1}>
                      No Incorrect Data
                    </td>
                  </tr>
                ) : (
                  incorrectRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c}>
                          <input
                            value={row[c] ?? ""}
                            onChange={(e) =>
                              handleEdit(i, c, e.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => approveRow(i)}>
                          Approve
                        </button>
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

export default Landparceldata;
