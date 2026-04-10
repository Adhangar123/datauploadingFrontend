import React, { useState, useRef } from "react";
import { uploadLandParcelData } from "../api/LandparcelDataApi";
import "../style/KmlTodatabase.css";
import { kml } from "@tmcw/togeojson";

/* =========================
   FIELD TYPE VALIDATION
========================= */

const NUMBER_FIELDS = ["area_ha"];

const STRING_FIELDS = [
  "parcel_id",
  "project_id",
  "farmer_id",
  "plot_num",
  "khata_num",
];

/* =========================
   MULTIGEOMETRY → GEOMETRY NORMALIZER
   Backend accepts: Polygon | MultiPolygon | GeometryCollection
   @tmcw/togeojson converts KML <MultiGeometry> to GeometryCollection.
   We keep GeometryCollection as-is — backend handles it via ST_CollectionExtract.
========================= */

const normalizeGeometry = (geometry) => {
  if (!geometry) return null;

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return geometry;
  }

  if (geometry.type === "GeometryCollection") {
    const polygons = (geometry.geometries || []).filter((g) =>
      ["Polygon", "MultiPolygon"].includes(g.type)
    );
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return polygons[0];
    // Backend's ST_Multi + ST_CollectionExtract handles this correctly
    return {
      type: "GeometryCollection",
      geometries: polygons,
    };
  }

  return null;
};

/* =========================
   PROPERTY RESOLVER
   KML <SimpleData> fields sometimes export with a trailing underscore
   e.g. "farmer_id_", "parcel_id_", "area_ha_".
   Checks both variants so nothing is missed.
========================= */

const prop = (properties, key) =>
  properties?.[key] ?? properties?.[`${key}_`] ?? null;

/* =========================
   VALIDATE ROW
   Backend accepts Polygon | MultiPolygon | GeometryCollection
========================= */

const VALID_GEOM_TYPES = new Set(["Polygon", "MultiPolygon", "GeometryCollection"]);

const validateRow = (row) => {
  if (!row.parcel_id || typeof row.parcel_id !== "string") return false;
  if (!row.geom || !VALID_GEOM_TYPES.has(row.geom?.type)) return false;

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

  return true;
};

/* =========================
   NORMALIZE ROW
   Backend fields: parcel_id, project_id, farmer_id, geom,
                   area_ha, plot_num, khata_num
   is_active / created_at / updated_at → handled entirely by backend
   source_file → NOT a backend column, excluded from payload
========================= */

const normalizeRow = (f, i) => {
  const p = f.properties ?? {};
  return {
    parcel_id: prop(p, "parcel_id")
      ? String(prop(p, "parcel_id"))
      : `parcel_${i + 1}`,

    project_id: prop(p, "project_id") != null
      ? String(prop(p, "project_id"))
      : null,

    farmer_id: prop(p, "farmer_id") != null
      ? String(prop(p, "farmer_id"))
      : null,

    geom: normalizeGeometry(f.geometry ?? null),

    area_ha: prop(p, "area_ha") != null && !isNaN(Number(prop(p, "area_ha")))
      ? Number(prop(p, "area_ha"))
      : null,

    plot_num: prop(p, "plot_num") != null
      ? String(prop(p, "plot_num"))
      : null,

    khata_num: prop(p, "khata_num") != null
      ? String(prop(p, "khata_num"))
      : null,
  };
};

/* =========================
   PARSE
========================= */

const parseKML = (text, fileName) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const geojson = kml(xml);
  return geojson.features.map((f, i) => normalizeRow(f, i));
};

const parseGeoJSON = (text, fileName) => {
  const geojson = JSON.parse(text);
  return geojson.features.map((f, i) => normalizeRow(f, i));
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
    "farmer_id",
    "geom",
    "area_ha",
    "plot_num",
    "khata_num",
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
      alert(
        "Row still invalid! Ensure parcel_id is filled and geometry is a valid Polygon / MultiPolygon / GeometryCollection."
      );
    }
  };

  const handleSendToDB = async () => {
    if (!correctedRows.length) return;

    setUploading(true);
    setMessage("🚀 Bulk Uploading...");

    try {
      const result = await uploadLandParcelData(correctedRows);
      setMessage(
        `✅ Bulk UPSERT completed successfully | Processed: ${result.processed} | Skipped: ${result.skipped ?? 0}`
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
                        {c === "geom"
                          ? row.geom?.type ?? "—"
                          : row[c] != null
                          ? String(row[c])
                          : "—"}
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
                    <td colSpan={columns.length + 1}>No Incorrect Data</td>
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