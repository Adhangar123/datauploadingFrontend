import React, { useState, useRef } from "react";
import "../style/KmlTodatabase.css";
import { kml } from "@tmcw/togeojson";

/* =========================
   FIELD TYPE VALIDATION
========================= */

const NUMBER_FIELDS = [
  "OBJECTID",
  "id",
  "area_ha",
  "Shape_Length",
  "Shape_Area",
];

const STRING_FIELDS = [
  "parcel_id",
  "project_id",
  "farmer_name",
  "onboarding_date",
  "drone_image_url",
  "drone_tile_url",
  "drone_survey", // ✅ now varchar
];

const validateRow = (row) => {
  if (!row.geom) return false;

  for (let field of NUMBER_FIELDS) {
    if (
      row[field] !== null &&
      row[field] !== undefined &&
      row[field] !== "" &&
      isNaN(Number(row[field]))
    ) {
      return false;
    }
  }

  for (let field of STRING_FIELDS) {
    if (
      row[field] !== null &&
      row[field] !== undefined &&
      row[field] !== "" &&
      typeof row[field] !== "string"
    ) {
      return false;
    }
  }

  if (
    row.farmer_id !== null &&
    row.farmer_id !== undefined &&
    row.farmer_id !== ""
  ) {
    if (typeof row.farmer_id !== "string") return false;
  }

  return true;
};

/* =========================
   NORMALIZE ROW (MATCHED WITH BACKEND)
========================= */

const normalizeRow = (f, i, fileName) => ({
  parcel_id: f.properties?.parcel_id ?? `parcel_${i + 1}`,
  project_id: f.properties?.project_id ?? null,

  OBJECTID:
    f.properties?.OBJECTID !== undefined &&
    f.properties?.OBJECTID !== null
      ? Number(f.properties.OBJECTID)
      : null,

  id:
    f.properties?.id !== undefined &&
    f.properties?.id !== null
      ? Number(f.properties.id)
      : null,

  farmer_id:
    f.properties?.farmer_id !== undefined &&
    f.properties?.farmer_id !== null
      ? String(f.properties.farmer_id)
      : null,

  farmer_name: f.properties?.farmer_name ?? null,

  onboarding_date: f.properties?.onboarding_date
    ? new Date(f.properties.onboarding_date).toISOString()
    : null,

  geom: f.geometry ?? null,

  area_ha:
    f.properties?.area_ha !== undefined &&
    f.properties?.area_ha !== null
      ? Number(f.properties.area_ha)
      : null,

  // ✅ IMPORTANT FIX — now VARCHAR not boolean
  drone_survey:
    f.properties?.drone_survey !== undefined &&
    f.properties?.drone_survey !== null
      ? String(f.properties.drone_survey)
      : null,

  drone_image_url: f.properties?.drone_image_url ?? null,

  Shape_Length:
    f.properties?.Shape_Length ??
    f.properties?.shape_length ??
    null,

  Shape_Area:
    f.properties?.Shape_Area ??
    f.properties?.shape_area ??
    null,

  drone_tile_url: f.properties?.drone_tile_url ?? null,

  source_file: fileName,
});

/* =========================
   PARSE
========================= */

const parseKML = (text, fileName) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const geojson = kml(xml);
  return geojson.features.map((f, i) => normalizeRow(f, i, fileName));
};

const parseGeoJSON = (text, fileName) => {
  const geojson = JSON.parse(text);
  return geojson.features.map((f, i) => normalizeRow(f, i, fileName));
};

/* =========================
   MAIN COMPONENT
========================= */

const Landparceldata = () => {
  const [file, setFile] = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  const fileInputRef = useRef(null);

  const columns = [
    "parcel_id",
    "project_id",
    "OBJECTID",
    "id",
    "farmer_id",
    "farmer_name",
    "onboarding_date",
    "geom",
    "area_ha",
    "drone_survey",
    "drone_image_url",
    "Shape_Length",
    "Shape_Area",
    "drone_tile_url",
  ];

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setCorrectedRows([]);
      setIncorrectRows([]);
      setMessage("");
      setFileCount(1);
      setProgress(0);
    }
  };

  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Select .kml or .geojson file");
      return;
    }

    try {
      let rows = [];
      const text = await file.text();

      if (file.name.endsWith(".kml")) {
        rows = parseKML(text, file.name);
      } else if (
        file.name.endsWith(".geojson") ||
        file.name.endsWith(".json")
      ) {
        rows = parseGeoJSON(text, file.name);
      } else {
        throw new Error("Only .kml or .geojson supported");
      }

      const validRows = rows.filter(validateRow);
      const invalidRows = rows.filter((r) => !validateRow(r));

      setCorrectedRows(validRows);
      setIncorrectRows(invalidRows);
      setProgress(100);

      setMessage(
        `✅ Parsed ${rows.length} parcels | Valid: ${validRows.length} | Invalid: ${invalidRows.length}`
      );
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  };

  const handleReset = () => {
    setFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setMessage("");
    setProgress(0);
    setFileCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEdit = (index, field, value) => {
    const updated = [...incorrectRows];

    if (NUMBER_FIELDS.includes(field)) {
      updated[index][field] = value === "" ? null : Number(value);
    } else {
      updated[index][field] = value === "" ? null : value;
    }

    setIncorrectRows(updated);
  };

  const approveRow = (index) => {
    const row = incorrectRows[index];
    if (validateRow(row)) {
      setCorrectedRows([...correctedRows, row]);
      setIncorrectRows(incorrectRows.filter((_, i) => i !== index));
    } else {
      alert("Row still invalid!");
    }
  };

  const handleSendToDB = async () => {
    if (!correctedRows.length) return;

    setUploading(true);
    setMessage("🚀 Bulk Uploading...");

    try {
      const res = await fetch(
        "https://datauploadingbackend-13977221722.asia-south2.run.app/api/land-parcel/upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(correctedRows),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      setMessage(
        `✅ Bulk UPSERT completed | Processed: ${result.processed}`
      );
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="kml-upload-container">
      <h2>Land Parcel Data Upload (.kml / .geojson)</h2>

      <div className="file-action-row">
        <input
          type="file"
          accept=".kml,.geojson,.json"
          onChange={handleFileChange}
          ref={fileInputRef}
        />

        <div className="button-outline-row">
          <button onClick={handleReadFile} disabled={!file}>
            1️⃣ Read & Validate File
          </button>

          <button onClick={handleReset}>🔄 Reset</button>

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
                        {c === "geom" ? "Polygon" : row[c] ?? null}
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
            disabled={uploading || !correctedRows.length}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          {message && <p className="upload-message">{message}</p>}
        </div>

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
                          {c === "geom" ? (
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