import React, { useState, useRef } from "react";
import { uploadLandParcelData } from "../api/LandparcelDataApi";
import "../style/KmlTodatabase.css";
import { kml } from "@tmcw/togeojson";

/* ─────────────────────────────────────────────────────────────
   FIELD TYPE MAPS
───────────────────────────────────────────────────────────── */
const NUMBER_FIELDS = ["area_ha"];

const STRING_FIELDS = [
  "parcel_id",
  "project_code",
  "farmer_id",
  "plot_num",
  "khata_num",
];

/* ─────────────────────────────────────────────────────────────
   BACKEND REQUIRED FIELDS (matches REQUIRED_FIELDS in controller)
───────────────────────────────────────────────────────────── */
const BACKEND_REQUIRED = ["parcel_id", "geom", "project_code", "farmer_id"];

/* ─────────────────────────────────────────────────────────────
   VALID GEOMETRY TYPES (matches VALID_GEOM_TYPES in controller)
───────────────────────────────────────────────────────────── */
const VALID_GEOM_TYPES = new Set([
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/* ─────────────────────────────────────────────────────────────
   MULTIGEOMETRY NORMALIZER
───────────────────────────────────────────────────────────── */
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
    return { type: "GeometryCollection", geometries: polygons };
  }

  return null;
};

/* ─────────────────────────────────────────────────────────────
   FIELD ALIASES
   Real-world KML/SHP exports are inconsistent about field naming
   (typos, project_id vs project_code, trailing underscores, etc).
   Each logical field below lists every raw key we've seen in the
   wild that should map to it. Add new variants here as you
   encounter them — no need to touch normalizeRow/validateRow.
───────────────────────────────────────────────────────────── */
const FIELD_ALIASES = {
  parcel_id: ["parcel_id"],
  project_code: [
    "project_code",
    "project_id",
    "proejct_id",   // <- typo seen in source KML ("proejct" instead of "project")
    "proejct_code",
    "projectcode",
  ],
  farmer_id: ["farmer_id"],
  area_ha: ["area_ha"],
  plot_num: ["plot_num"],
  khata_num: ["khata_num"],
};

/* ─────────────────────────────────────────────────────────────
   PROPERTY RESOLVER
   Looks up a logical field name against every known alias,
   also checking each alias with a trailing underscore (KML
   fields sometimes export that way too).
───────────────────────────────────────────────────────────── */
const prop = (properties, key) => {
  if (!properties) return null;

  const aliases = FIELD_ALIASES[key] || [key];

  for (const alias of aliases) {
    if (properties[alias] !== undefined && properties[alias] !== null) {
      return properties[alias];
    }
    const underscored = `${alias}_`;
    if (properties[underscored] !== undefined && properties[underscored] !== null) {
      return properties[underscored];
    }
  }

  return null;
};

/* ─────────────────────────────────────────────────────────────
   VALIDATE ROW (mirrors backend validateRow exactly)
───────────────────────────────────────────────────────────── */
const validateRow = (row) => {
  const errors = [];

  if (!row.parcel_id || typeof row.parcel_id !== "string" || row.parcel_id.trim() === "") {
    errors.push("parcel_id is required");
  }
  if (!row.project_code || row.project_code.toString().trim() === "") {
    errors.push("project_code is required");
  }
  if (!row.farmer_id || row.farmer_id.toString().trim() === "") {
    errors.push("farmer_id is required");
  }
  if (!row.geom || !VALID_GEOM_TYPES.has(row.geom?.type)) {
    errors.push("geom is required and must be Polygon, MultiPolygon, or GeometryCollection");
  }

  for (const field of NUMBER_FIELDS) {
    const val = row[field];
    if (val !== null && val !== undefined && val !== "" && isNaN(Number(val))) {
      errors.push(`${field} must be a valid number`);
    }
  }

  for (const field of STRING_FIELDS) {
    const val = row[field];
    if (val !== null && val !== undefined && val !== "" && typeof val !== "string") {
      errors.push(`${field} must be a string`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

/* ─────────────────────────────────────────────────────────────
   NORMALIZE ROW
───────────────────────────────────────────────────────────── */
const normalizeRow = (f, i) => {
  const p = f.properties ?? {};
  return {
    parcel_id: prop(p, "parcel_id")
      ? String(prop(p, "parcel_id"))
      : `parcel_${i + 1}`,

    project_code:
      prop(p, "project_code") != null ? String(prop(p, "project_code")) : null,

    farmer_id:
      prop(p, "farmer_id") != null ? String(prop(p, "farmer_id")) : null,

    geom: normalizeGeometry(f.geometry ?? null),

    area_ha:
      prop(p, "area_ha") != null && !isNaN(Number(prop(p, "area_ha")))
        ? Number(prop(p, "area_ha"))
        : null,

    plot_num:
      prop(p, "plot_num") != null ? String(prop(p, "plot_num")) : null,

    khata_num:
      prop(p, "khata_num") != null ? String(prop(p, "khata_num")) : null,
  };
};

/* ─────────────────────────────────────────────────────────────
   PARSERS
───────────────────────────────────────────────────────────── */
const parseKML = (text) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const geojson = kml(xml);
  return geojson.features.map((f, i) => normalizeRow(f, i));
};

const parseGeoJSON = (text) => {
  const geojson = JSON.parse(text);
  return geojson.features.map((f, i) => normalizeRow(f, i));
};

/* ─────────────────────────────────────────────────────────────
   formatRowErrors — turns backend's [{parcel_id, reason}] into readable text
───────────────────────────────────────────────────────────── */
const formatRowErrors = (rows = []) =>
  rows.map((e) => `• ${e.parcel_id ?? "—"}: ${e.reason}`).join("\n");

/* ─────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────── */
const Landparceldata = () => {
  const [file, setFile]                   = useState(null);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [message, setMessage]             = useState("");
  const [dbError, setDbError]             = useState("");
  const [uploading, setUploading]         = useState(false);
  const [progress, setProgress]           = useState(0);
  const [fileCount, setFileCount]         = useState(0);

  const fileInputRef = useRef(null);

  const columns = [
    "parcel_id",
    "project_code",
    "farmer_id",
    "geom",
    "area_ha",
    "plot_num",
    "khata_num",
  ];

  /* ── File select ── */
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setMessage("");
    setDbError("");
    setFileCount(1);
    setProgress(0);
  };

  /* ── Read & Validate ── */
  const handleReadFile = async () => {
    if (!file) {
      setMessage("❌ Select a .kml or .geojson file");
      return;
    }

    try {
      let rows = [];
      const text = await file.text();

      if (file.name.endsWith(".kml")) {
        rows = parseKML(text);
      } else if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
        rows = parseGeoJSON(text);
      } else {
        throw new Error("Only .kml or .geojson files are supported");
      }

      const valid   = [];
      const invalid = [];

      rows.forEach((row) => {
        const { isValid, errors } = validateRow(row);
        if (isValid) {
          valid.push(row);
        } else {
          invalid.push({ ...row, __errors: errors });
        }
      });

      setCorrectedRows(valid);
      setIncorrectRows(invalid);
      setProgress(100);
      setMessage(
        `✅ Parsed ${rows.length} parcels | Valid: ${valid.length} | Invalid: ${invalid.length}`
      );
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  };

  /* ── Reset ── */
  const handleReset = () => {
    setFile(null);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setMessage("");
    setDbError("");
    setProgress(0);
    setFileCount(0);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── Inline edit (immutable) ── */
  const handleEdit = (index, field, value) => {
    setIncorrectRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: NUMBER_FIELDS.includes(field)
          ? value === "" ? null : Number(value)
          : value === "" ? null : value,
      };
      return updated;
    });
  };

  /* ── Approve single invalid row ── */
  const approveRow = (index) => {
    const row = incorrectRows[index];
    const { __errors, ...cleanRow } = row;
    const { isValid, errors } = validateRow(cleanRow);

    if (!isValid) {
      alert("Row is still invalid:\n" + errors.join("\n"));
      return;
    }

    setCorrectedRows((prev) => [...prev, cleanRow]);
    setIncorrectRows((prev) => prev.filter((_, i) => i !== index));
  };

  /* ── Send to DB ── */
  const handleSendToDB = async () => {
    if (!correctedRows.length) return;

    setUploading(true);
    setDbError("");
    setMessage("Uploading...");

    const user   = JSON.parse(localStorage.getItem("user"));
    const userId = user?.user_id;

    if (!userId) {
      setDbError("❌ User not logged in");
      setUploading(false);
      return;
    }

    // Unix epoch timestamp — matches backend's BIGINT created_at/updated_at columns
    const nowUnix = Math.floor(Date.now() / 1000);

    const payload = correctedRows.map((row) => ({
      parcel_id:  row.parcel_id,
      project_code: row.project_code,
      farmer_id:  row.farmer_id,
      geom:       row.geom,
      area_ha:    row.area_ha   ?? null,
      plot_num:   row.plot_num  ?? null,
      khata_num:  row.khata_num ?? null,

      created_by: userId,
      updated_by: userId,
      created_at: nowUnix,
      updated_at: nowUnix,
    }));

    try {
      const result = await uploadLandParcelData(payload);

      setMessage(
        `✅ Successfully uploaded! | Processed: ${result.processed} | Skipped: ${result.skipped ?? 0}`
      );

      // ✅ backend may still report per-row skip reasons even on success (skipped_errors)
      if (result.skipped_errors?.length) {
        setDbError("⚠️ Some rows were skipped:\n" + formatRowErrors(result.skipped_errors));
      } else {
        setDbError("");
      }

      setCorrectedRows([]);
    } catch (err) {
      // ✅ surface backend's per-row validation errors (400 — all rows failed) if present
      const detail = err.errors?.length ? "\n" + formatRowErrors(err.errors) : "";
      setDbError("❌ " + err.message + detail);
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
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p>{progress}%</p>
        </div>
      )}

      <div className="stack-container">

        {/* ── VALID TABLE ── */}
        <div className="box green">
          <h3>✅ Valid Data ({correctedRows.length})</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      {BACKEND_REQUIRED.includes(c) ? `${c} *` : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        {c === "geom"
                          ? row.geom?.type ?? "—"
                          : row[c] != null ? String(row[c]) : "—"}
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
            disabled={uploading || correctedRows.length === 0}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          {message && <p className="upload-message">{message}</p>}
          {dbError && <p style={{ color: "red", whiteSpace: "pre-line" }}>{dbError}</p>}
        </div>

        {/* ── INVALID TABLE ── */}
        <div className="box red">
          <h3>❌ Incorrect Data ({incorrectRows.length}) — Edit & Approve</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      {BACKEND_REQUIRED.includes(c) ? `${c} *` : c}
                    </th>
                  ))}
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2}>No Incorrect Data</td>
                  </tr>
                ) : (
                  incorrectRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c}>
                          {c === "geom" ? (
                            <span style={{ color: "red", fontSize: "12px" }}>
                              Invalid Geometry
                            </span>
                          ) : (
                            <input
                              value={row[c] ?? ""}
                              onChange={(e) => handleEdit(i, c, e.target.value)}
                            />
                          )}
                        </td>
                      ))}
                      <td style={{ color: "red", fontSize: "12px" }}>
                        {row.__errors?.join(", ")}
                      </td>
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