import React, { useEffect, useState } from "react";
import "../style/WeeklyUpdate.css";

const API_BASE =
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1/project-update";

// ─── Auth headers with user_id ───────────────────────────────────────────────
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const getLoggedInUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user"));
    return user?.user_id ?? null;
  } catch {
    return null;
  }
};

const emptyProject = {
  project_id: "",
  project_name: "",
  area_mapped_new: "",
  area_mapped_existing: "",
  kml_verified_new: "",
  kml_verified_existing: "",
  cra_data_new: "",
  cra_data_existing: "",
  farmer_no_new: "",
  farmer_no_existing: "",
  tree_no_new: "",
  tree_no_existing: "",
};

const FLOAT_FIELDS = [
  "area_mapped_new",
  "area_mapped_existing",
  "kml_verified_new",
  "kml_verified_existing",
  "cra_data_new",
  "cra_data_existing",
];

const INT_FIELDS = [
  "farmer_no_new",
  "farmer_no_existing",
  "tree_no_new",
  "tree_no_existing",
];

const REQUIRED_FIELDS = ["project_id", "project_name"];

const FIELD_LABELS = {
  project_id:            "Project ID",
  project_name:          "Project Name",
  area_mapped_new:       "Area Mapped — New (ha)",
  area_mapped_existing:  "Area Mapped — Existing (ha)",
  kml_verified_new:      "KML Verified — New",
  kml_verified_existing: "KML Verified — Existing",
  cra_data_new:          "CRA Data — New",
  cra_data_existing:     "CRA Data — Existing",
  farmer_no_new:         "Farmer Count — New",
  farmer_no_existing:    "Farmer Count — Existing",
  tree_no_new:           "Tree Count — New",
  tree_no_existing:      "Tree Count — Existing",
};

const FIELD_PLACEHOLDERS = {
  project_id:            "e.g. PROJ-001",
  project_name:          "e.g. Green Valley Reforestation",
  area_mapped_new:       "e.g. 12.50",
  area_mapped_existing:  "e.g. 45.00",
  kml_verified_new:      "e.g. 8.75",
  kml_verified_existing: "e.g. 30.25",
  cra_data_new:          "e.g. 5.00",
  cra_data_existing:     "e.g. 20.00",
  farmer_no_new:         "e.g. 25",
  farmer_no_existing:    "e.g. 120",
  tree_no_new:           "e.g. 500",
  tree_no_existing:      "e.g. 3000",
};

// ─── Validation helpers ──────────────────────────────────────────────────────
const isValidProjectId = (id) =>
  typeof id === "string" &&
  id.trim().length > 0 &&
  id.trim().length <= 100 &&
  /^[a-zA-Z0-9_-]+$/.test(id.trim());

const isValidPositiveFloat = (val) => {
  if (val === "" || val === null || val === undefined) return true;
  const n = parseFloat(val);
  return !isNaN(n) && isFinite(n) && n >= 0;
};

const isValidNonNegativeInt = (val) => {
  if (val === "" || val === null || val === undefined) return true;
  const n = Number(val);
  return Number.isInteger(n) && n >= 0;
};

const validateProject = (proj, isEdit = false) => {
  const errors = {};

  if (!isEdit) {
    if (!proj.project_id || proj.project_id.trim() === "") {
      errors.project_id = "Project ID is required.";
    } else if (!isValidProjectId(proj.project_id)) {
      errors.project_id =
        "Only letters, numbers, hyphens (-) and underscores (_) are allowed (max 100 chars).";
    }
  }

  if (!proj.project_name || proj.project_name.trim() === "") {
    errors.project_name = "Project Name is required.";
  } else if (proj.project_name.trim().length > 255) {
    errors.project_name = "Project Name must not exceed 255 characters.";
  }

  FLOAT_FIELDS.forEach((field) => {
    if (proj[field] !== "" && !isValidPositiveFloat(proj[field])) {
      errors[field] = "Must be a positive number (e.g. 12.50).";
    }
  });

  INT_FIELDS.forEach((field) => {
    if (proj[field] !== "" && !isValidNonNegativeInt(proj[field])) {
      errors[field] = "Must be a whole non-negative number (e.g. 25).";
    }
  });

  return errors;
};

const preparePayload = (proj, userId, isEdit = false) => {
  const payload = { ...proj };

  FLOAT_FIELDS.forEach((f) => {
    payload[f] = proj[f] !== "" ? parseFloat(proj[f]) : null;
  });
  INT_FIELDS.forEach((f) => {
    payload[f] = proj[f] !== "" ? parseInt(proj[f], 10) : 0;
  });

  // ── User tracking ──────────────────────────────────────────────────────────
  if (!isEdit) {
    payload.created_by = userId;
    payload.updated_by = userId;
  } else {
    payload.updated_by = userId;
  }

  return payload;
};

// ─────────────────────────────────────────────────────────────────────────────

const WeeklyUpdate = () => {
  const [projects, setProjects]     = useState([{ ...emptyProject }]);
  const [addErrors, setAddErrors]   = useState([{}]);
  const [editData, setEditData]     = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [dataList, setDataList]     = useState([]);
  const [message, setMessage]       = useState({ text: "", type: "" });
  const [loading, setLoading]       = useState(false);

  const userId = getLoggedInUserId();

  // ── Toast auto-hide ────────────────────────────────────────────────────────
  useEffect(() => {
    if (message.text) {
      const t = setTimeout(() => setMessage({ text: "", type: "" }), 3500);
      return () => clearTimeout(t);
    }
  }, [message]);

  // ── Add form handlers ──────────────────────────────────────────────────────
  const handleAddChange = (index, e) => {
    const updated = [...projects];
    updated[index][e.target.name] = e.target.value;
    setProjects(updated);
    const updatedErrors = [...addErrors];
    if (updatedErrors[index]) delete updatedErrors[index][e.target.name];
    setAddErrors(updatedErrors);
  };

  const addRow = () => {
    setProjects([...projects, { ...emptyProject }]);
    setAddErrors([...addErrors, {}]);
  };

  const removeRow = (index) => {
    if (projects.length === 1) return;
    setProjects(projects.filter((_, i) => i !== index));
    setAddErrors(addErrors.filter((_, i) => i !== index));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleAddSubmit = async () => {
    const allErrors = projects.map((p) => validateProject(p, false));
    const hasErrors = allErrors.some((e) => Object.keys(e).length > 0);
    if (hasErrors) {
      setAddErrors(allErrors);
      setMessage({ text: "Please fix the errors before submitting.", type: "error" });
      return;
    }

    setLoading(true);
    let failedCount = 0;

    for (let project of projects) {
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(preparePayload(project, userId, false)),
        });
        const data = await res.json();
        if (!res.ok) {
          failedCount++;
          console.error(`Project ${project.project_id} failed:`, data.message);
        }
      } catch (err) {
        failedCount++;
        console.error("Network error:", err);
      }
    }

    setLoading(false);

    if (failedCount === 0) {
      setMessage({
        text: `${projects.length} project(s) added successfully. ✅`,
        type: "success",
      });
      setProjects([{ ...emptyProject }]);
      setAddErrors([{}]);
    } else {
      setMessage({
        text: `${failedCount} project(s) failed to submit. Check console for details.`,
        type: "error",
      });
    }
    fetchData();
  };

  // ── Fetch list ─────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}?limit=20`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setDataList(data.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
    if (editErrors[e.target.name]) {
      setEditErrors({ ...editErrors, [e.target.name]: undefined });
    }
  };

  const handleUpdate = async () => {
    const errors = validateProject(editData, true);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${editData.project_id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(preparePayload(editData, userId, true)),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: "Project updated successfully. ✅", type: "success" });
        setEditData(null);
        setEditErrors({});
        fetchData();
      } else {
        setMessage({
          text: data.message || "Update failed. Please try again.",
          type: "error",
        });
      }
    } catch (err) {
      setMessage({ text: "A network error occurred. Please try again.", type: "error" });
    }
    setLoading(false);
  };

  // ── Input helpers ──────────────────────────────────────────────────────────
  const getInputType = (field) => {
    if (FLOAT_FIELDS.includes(field) || INT_FIELDS.includes(field)) return "number";
    return "text";
  };

  const getInputProps = (field) => {
    const base = { min: "0" };
    if (INT_FIELDS.includes(field))   return { ...base, step: "1" };
    if (FLOAT_FIELDS.includes(field)) return { ...base, step: "0.01" };
    return {};
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <h1 className="title">📊 Weekly Project Update</h1>

      {/* Toast */}
      {message.text && (
        <div className={`toast ${message.type === "error" ? "toast-error" : ""}`}>
          {message.text}
        </div>
      )}

      {/* ── ADD SECTION ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Add Projects Data</h3>
        </div>

        {projects.map((proj, index) => (
          <div key={index} className="form-section">

            {/* Row header: label left, remove button right */}
            <div className="form-section-header">
              <span className="row-label">Entry {index + 1}</span>
              {projects.length > 1 && (
                <button
                  className="remove-entry-btn"
                  onClick={() => removeRow(index)}
                  title="Remove this entry"
                >
                  ✕ Remove Entry
                </button>
              )}
            </div>

            <div className="form-grid">
              {Object.keys(emptyProject).map((field) => (
                <div key={field} className="field-wrap">
                  <label className="field-label">
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) && (
                      <span className="required-star"> *</span>
                    )}
                  </label>
                  <input
                    name={field}
                    type={getInputType(field)}
                    placeholder={FIELD_PLACEHOLDERS[field]}
                    value={proj[field]}
                    onChange={(e) => handleAddChange(index, e)}
                    className={addErrors[index]?.[field] ? "input-error" : ""}
                    required={REQUIRED_FIELDS.includes(field)}
                    {...getInputProps(field)}
                  />
                  {addErrors[index]?.[field] && (
                    <span className="error-msg">⚠ {addErrors[index][field]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="action-row">
          <button className="add-btn" onClick={addRow}>+ Add Another Entry</button>
          <button
            className="primary-btn"
            onClick={handleAddSubmit}
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit All"}
          </button>
        </div>
      </div>

      {/* ── UPDATE SECTION ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3> Update Projects Data</h3>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Area Mapped (New)</th>
                <th>Farmer Count (New)</th>
                <th>Tree Count (New)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {dataList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>
                    No records found.
                  </td>
                </tr>
              ) : (
                dataList.map((item) => (
                  <tr key={item.project_id}>
                    <td>{item.project_id}</td>
                    <td>{item.project_name}</td>
                    <td>{item.area_mapped_new ?? "—"}</td>
                    <td>{item.farmer_no_new ?? "—"}</td>
                    <td>{item.tree_no_new ?? "—"}</td>
                    <td>
                      <button
                        className="edit-btn"
                        onClick={() => { setEditData(item); setEditErrors({}); }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Edit Form ─────────────────────────────────────────────────── */}
        {editData && (
          <div className="edit-card">
            <h4>Editing: {editData.project_id}</h4>
            <div className="form-grid">
              {Object.keys(emptyProject).map((field) => (
                <div key={field} className="field-wrap">
                  <label className="field-label">
                    {FIELD_LABELS[field]}
                    {field === "project_name" && (
                      <span className="required-star"> *</span>
                    )}
                    {field === "project_id" && (
                      <span className="disabled-tag"> — Not editable</span>
                    )}
                  </label>
                  <input
                    name={field}
                    type={getInputType(field)}
                    value={editData[field] ?? ""}
                    onChange={handleEditChange}
                    placeholder={
                      field === "project_id"
                        ? "Cannot be changed"
                        : FIELD_PLACEHOLDERS[field]
                    }
                    disabled={field === "project_id"}
                    className={
                      field === "project_id"
                        ? "input-disabled"
                        : editErrors[field]
                        ? "input-error"
                        : ""
                    }
                    required={field === "project_name"}
                    {...(field !== "project_id" ? getInputProps(field) : {})}
                  />
                  {editErrors[field] && (
                    <span className="error-msg">⚠ {editErrors[field]}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="action-row">
              <button
                className="delete-btn"
                onClick={() => { setEditData(null); setEditErrors({}); }}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={handleUpdate}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyUpdate;