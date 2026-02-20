import React, { useState, useRef } from "react";
import "../style/KmlTodatabase.css";
import { kml } from "@tmcw/togeojson";
import shp from "shpjs";

/* =========================
   VALIDATION
========================= */
const validateRow = (row) => {
  const errors = [];

  if (!row.project_id?.trim()) errors.push("project_id missing");
  if (!row.parcel_id?.trim()) errors.push("parcel_id missing");
  if (!row.farmer_name?.trim()) errors.push("farmer_name missing");
  if (!row.onboarding_date?.trim()) errors.push("onboarding_date missing");
  if (!row.geometry) errors.push("geometry missing");

  return { isValid: errors.length === 0, errors };
};

/* =========================
   PARSE KML
========================= */
const parseKMLText = (text, sourceFile) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const geojson = kml(xml);

  return geojson.features.map((f, i) => ({
    project_id: f.properties?.project_id || "",
    parcel_id: f.properties?.parcel_id || `parcel_${i + 1}`,
    farmer_id: f.properties?.farmer_id || "",
    farmer_name: f.properties?.farmer_name || "",
    onboarding_date: f.properties?.onboarding_date || "",
    geometry: f.geometry,
    source_file: sourceFile,
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

  const [progress, setProgress] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  const fileInputRef = useRef(null);

  /* ================= FILE CHANGE ================= */
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setCorrectedRows([]);
      setIncorrectRows([]);
      setParsedData([]);
      setProgress(0);
      setFileCount(0);
      setMessage("");
    }
  };

  /* ================= RESET ================= */
  const handleReset = () => {
    setFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setParsedData([]);
    setProgress(0);
    setFileCount(0);
    setMessage("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ================= READ FILE ================= */
  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Please select .kml or .zip file");
      return;
    }

    try {
      let rows = [];
      setProgress(5);

      /* ---------- ZIP (SHAPEFILE) ---------- */
      if (file.name.endsWith(".zip")) {
        setMessage("📦 Reading Shapefile ZIP...");
        setFileCount(1);

        const arrayBuffer = await file.arrayBuffer(); // ✅ FIX
        const geojson = await shp(arrayBuffer);       // ✅ FIX

        if (!geojson?.features?.length) {
          throw new Error("No features found in shapefile ZIP");
        }

        setProgress(70);

        rows = geojson.features.map((f, i) => ({
          project_id: f.properties?.project_id || "",
          parcel_id: f.properties?.parcel_id || `parcel_${i + 1}`,
          farmer_id: f.properties?.farmer_id || "",
          farmer_name: f.properties?.farmer_name || "",
          onboarding_date: f.properties?.onboarding_date || "",
          geometry: f.geometry,
          source_file: file.name,
        }));

        setProgress(100);
      }

      /* ---------- KML ---------- */
      else if (file.name.endsWith(".kml")) {
        setMessage("🗺 Reading KML...");
        const text = await file.text();
        rows = parseKMLText(text, file.name);
        setFileCount(1);
        setProgress(100);
      } else {
        throw new Error("Only .kml or .zip supported");
      }

      const valid = [];
      const invalid = [];

      rows.forEach((row) => {
        const { isValid } = validateRow(row);
        isValid ? valid.push(row) : invalid.push(row);
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setParsedData(valid);

      setMessage(
        `✅ Parsed ${rows.length} parcels | Valid: ${valid.length} | Invalid: ${invalid.length}`
      );
    } catch (err) {
      console.error(err);
      setMessage(`❌ ${err.message}`);
    }
  };

  /* ================= EDIT INVALID ================= */
  const handleEdit = (rowIndex, field, value) => {
    const updated = [...incorrectRows];
    updated[rowIndex][field] = value;
    setIncorrectRows(updated);
  };

  const approveRow = (index) => {
    const row = incorrectRows[index];
    const { isValid } = validateRow(row);

    if (!isValid) {
      setMessage("❌ Row still invalid");
      return;
    }

    const updatedIncorrect = incorrectRows.filter((_, i) => i !== index);
    const updatedCorrected = [...correctedRows, row];

    setIncorrectRows(updatedIncorrect);
    setCorrectedRows(updatedCorrected);
    setParsedData(updatedCorrected);
  };

  /* ================= SEND TO DB ================= */
  const handleSendToDB = async () => {
    if (!parsedData.length) return;

    setUploading(true);
    setMessage("Uploading to database...");

    try {
      const res = await fetch(
        "https://datauploadingbackend-13977221722.asia-south2.run.app/api/land-parcel/upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedData),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Upload failed");

      setMessage(
        `✅ Uploaded | Inserted: ${result.inserted} | Failed: ${result.failed}`
      );
    } catch (err) {
      setMessage(`❌ ${err.message}`);
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

  /* ================= UI (UNCHANGED) ================= */
  return (
    <div className="kml-upload-container">
      <h2>Land Parcel Data Upload (.kml / .zip)</h2>

      <div className="file-action-row">
        <input
          type="file"
          accept=".kml,.zip"
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

      {fileCount > 0 && (
        <div className="progress-wrapper">
          <p>📂 Files: {fileCount}</p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p>{progress}%</p>
        </div>
      )}

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
                      <td key={c}>
                        {c === "geometry" ? "Polygon" : String(row[c])}
                      </td>
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
                          {c === "geometry" ? (
                            "Invalid Geometry"
                          ) : (
                            <input
                              value={row[c] ?? ""}
                              onChange={(e) =>
                                handleEdit(i, c, e.target.value)
                              }
                            />
                          )}
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

export default Landparceldata;
