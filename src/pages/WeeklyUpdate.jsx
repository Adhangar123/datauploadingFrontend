import React, { useEffect, useState, useRef } from "react";
import "../style/WeeklyUpdate.css";
import { fetchProjects, createProject, updateProject, fetchProjectHistory } from "../api/projectUpdateAPI";

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
  "area_mapped_new", "area_mapped_existing",
  "kml_verified_new", "kml_verified_existing",
  "cra_data_new", "cra_data_existing",
];

const INT_FIELDS = [
  "farmer_no_new", "farmer_no_existing",
  "tree_no_new", "tree_no_existing",
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
      errors.project_id = "Only letters, numbers, hyphens (-) and underscores (_) are allowed (max 100 chars).";
    }
  }
  if (!proj.project_name || proj.project_name.trim() === "") {
    errors.project_name = "Project Name is required.";
  } else if (proj.project_name.trim().length > 255) {
    errors.project_name = "Project Name must not exceed 255 characters.";
  }
  FLOAT_FIELDS.forEach((field) => {
    if (proj[field] !== "" && !isValidPositiveFloat(proj[field]))
      errors[field] = "Must be a positive number (e.g. 12.50).";
  });
  INT_FIELDS.forEach((field) => {
    if (proj[field] !== "" && !isValidNonNegativeInt(proj[field]))
      errors[field] = "Must be a whole non-negative number (e.g. 25).";
  });
  return errors;
};

const preparePayload = (proj, userId, isEdit = false) => {
  const payload = { ...proj };
  FLOAT_FIELDS.forEach((f) => { payload[f] = proj[f] !== "" ? parseFloat(proj[f]) : null; });
  INT_FIELDS.forEach((f) => { payload[f] = proj[f] !== "" ? parseInt(proj[f], 10) : 0; });
  if (!isEdit) {
    payload.created_by = userId;
    payload.updated_by = userId;
  } else {
    payload.updated_by = userId;
  }
  return payload;
};

// ─── Check if edit form has any changes ──────────────────────────────────────
const hasChanges = (original, current) => {
  if (!original || !current) return false;
  return Object.keys(emptyProject).some((key) => {
    const orig = original[key] ?? "";
    const curr = current[key] ?? "";
    return String(orig) !== String(curr);
  });
};

// ─── Format epoch time to readable date time ───────────────────────────────
const formatEpochToDateTime = (epochTime) => {
  if (!epochTime) return "—";
  let timestamp = typeof epochTime === "string" ? parseInt(epochTime) : epochTime;
  const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
  if (isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).replace(/\//g, "/");
};

// ─────────────────────────────────────────────────────────────────────────────

const WeeklyUpdate = () => {
  const [projects, setProjects]         = useState([{ ...emptyProject }]);
  const [addErrors, setAddErrors]       = useState([{}]);
  const [editData, setEditData]         = useState(null);
  const [editOriginal, setEditOriginal] = useState(null);
  const [editErrors, setEditErrors]     = useState({});
  const [dataList, setDataList]         = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [filterText, setFilterText]     = useState("");
  const [filterType, setFilterType]     = useState("project_name");
  const [loading, setLoading]           = useState(false);
  const [dialog, setDialog]             = useState({ show: false, message: "", type: "" });

  // ── Inline history states ─────────────────────────────────────────────────
  const [historyProject, setHistoryProject] = useState(null);
  const [projectHistory, setProjectHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage]       = useState(1);
  const [historyTotal, setHistoryTotal]     = useState(0);

  const userId = getLoggedInUserId();

  // ── Dialog auto-close after 3s ────────────────────────────────────────────
  useEffect(() => {
    if (dialog.show) {
      const t = setTimeout(() => setDialog({ show: false, message: "", type: "" }), 3000);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  // ── Filter logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!filterText.trim()) {
      setFilteredList(dataList);
    } else {
      const lower = filterText.trim().toLowerCase();
      setFilteredList(
        dataList.filter((item) =>
          String(item[filterType] ?? "").toLowerCase().includes(lower)
        )
      );
    }
  }, [filterText, filterType, dataList]);

  // ── Add form handlers ─────────────────────────────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleAddSubmit = async () => {
    if (!userId) {
      setDialog({ show: true, message: "User not logged in. Please login again.", type: "error" });
      return;
    }
    const allErrors = projects.map((p) => validateProject(p, false));
    const hasErrors = allErrors.some((e) => Object.keys(e).length > 0);
    if (hasErrors) {
      setAddErrors(allErrors);
      setDialog({ show: true, message: "Please fix the errors before submitting.", type: "error" });
      return;
    }

    setLoading(true);
    let failedCount = 0;

    for (let project of projects) {
      try {
        const payload = preparePayload(project, userId, false);
        const { ok, data } = await createProject(payload, userId);
        if (!ok) {
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
      setProjects([{ ...emptyProject }]);
      setAddErrors([{}]);
      setDialog({
        show: true,
        message: `${projects.length} project(s) submitted successfully!`,
        type: "success",
      });
    } else {
      setDialog({
        show: true,
        message: `${failedCount} project(s) failed to submit. Check console for details.`,
        type: "error",
      });
    }
    fetchData();
  };

  // ── Fetch list ────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const data = await fetchProjects(100);
      if (data.success) {
        setDataList(data.data);
        setFilteredList(data.data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
    if (editErrors[e.target.name]) {
      setEditErrors({ ...editErrors, [e.target.name]: undefined });
    }
  };

  const handleUpdate = async () => {
    if (!userId) {
      setDialog({ show: true, message: "User not logged in. Please login again.", type: "error" });
      return;
    }
    const errors = validateProject(editData, true);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setLoading(true);
    try {
      const payload = preparePayload(editData, userId, true);
      const { ok, data } = await updateProject(editData.project_id, payload, userId);
      if (ok) {
        setDialog({ show: true, message: "Project updated successfully!", type: "success" });
        setEditData(null);
        setEditOriginal(null);
        setEditErrors({});
        fetchData();
      } else {
        setDialog({ show: true, message: data.message || "Update failed. Please try again.", type: "error" });
      }
    } catch (err) {
      setDialog({ show: true, message: "A network error occurred. Please try again.", type: "error" });
    }
    setLoading(false);
  };

  // ── History handlers (inline) ─────────────────────────────────────────────
  const fetchHistoryData = async (projectId, page = 1) => {
    setHistoryLoading(true);
    try {
      const result = await fetchProjectHistory(projectId, page, 200);
      if (result.ok && result.data.success) {
        const historyData = result.data.data || [];
        const formattedHistory = historyData.map((record) => ({
          project_name:          record.project_name,
          area_mapped_new:       record.area_mapped_new,
          area_mapped_existing:  record.area_mapped_existing,
          kml_verified_new:      record.kml_verified_new,
          kml_verified_existing: record.kml_verified_existing,
          cra_data_new:          record.cra_data_new,
          cra_data_existing:     record.cra_data_existing,
          farmer_no_new:         record.farmer_no_new,
          farmer_no_existing:    record.farmer_no_existing,
          tree_no_new:           record.tree_no_new,
          tree_no_existing:      record.tree_no_existing,
          username:              record.username,
          updated_by:            record.updated_by || record.created_by,
          updated_at:            record.updated_at || record.created_at,
        }));
        setProjectHistory(formattedHistory);
        setHistoryTotal(result.data.total || 0);
      } else {
        setProjectHistory([]);
        setHistoryTotal(0);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      setProjectHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistory = (item) => {
    // Same project dobara click = toggle band
    if (historyProject?.project_id === item.project_id) {
      setHistoryProject(null);
      setProjectHistory([]);
      setHistoryTotal(0);
      return;
    }
    setHistoryProject(item);
    setHistoryPage(1);
    fetchHistoryData(item.project_id, 1);
  };

  const handleHistoryPageChange = (newPage) => {
    if (newPage >= 1 && historyProject) {
      setHistoryPage(newPage);
      fetchHistoryData(historyProject.project_id, newPage);
    }
  };

  const closeHistory = () => {
    setHistoryProject(null);
    setProjectHistory([]);
    setHistoryTotal(0);
  };

  // ── Input helpers ─────────────────────────────────────────────────────────
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

  const isDirty = hasChanges(editOriginal, editData);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <h1 className="title">📊 Weekly Project Update</h1>

      {/* ── Success/Error Dialog ────────────────────────────────────────── */}
      {dialog.show && (
        <div className="dialog-overlay" onClick={() => setDialog({ show: false, message: "", type: "" })}>
          <div
            className={`dialog-box ${dialog.type === "error" ? "dialog-error" : "dialog-success"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon">
              {dialog.type === "success" ? "✅" : "❌"}
            </div>
            <p className="dialog-message">{dialog.message}</p>
            <button
              className="dialog-close-btn"
              onClick={() => setDialog({ show: false, message: "", type: "" })}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ── ADD SECTION ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Add Projects Data</h3>
        </div>

        {projects.map((proj, index) => (
          <div key={index} className="form-section">
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
          <button className="primary-btn" onClick={handleAddSubmit} disabled={loading}>
            {loading ? "Submitting..." : "Submit All"}
          </button>
        </div>
      </div>

      {/* ── UPDATE SECTION ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Update Projects Data</h3>
        </div>

        {/* ── Filter Bar ──────────────────────────────────────────────── */}
        <div className="filter-bar">
          <select
            className="filter-select"
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setFilterText(""); }}
          >
            <option value="project_name">Filter by Name</option>
            <option value="project_id">Filter by Project ID</option>
          </select>
          <input
            className="filter-input"
            type="text"
            placeholder={
              filterType === "project_name"
                ? "Search by project name..."
                : "Search by project ID..."
            }
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button className="filter-clear-btn" onClick={() => setFilterText("")}>
              ✕ Clear
            </button>
          )}
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Area Mapped (New)</th>
                <th>Farmer Count (New)</th>
                <th>Tree Count (New)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>
                    {filterText ? "No matching records found." : "No records found."}
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => (
                  <tr key={item.project_id}>
                    <td>{item.project_id}</td>
                    <td>{item.project_name}</td>
                    <td>{item.area_mapped_new ?? "—"}</td>
                    <td>{item.farmer_no_new ?? "—"}</td>
                    <td>{item.tree_no_new ?? "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="edit-btn"
                          onClick={() => {
                            setEditData({ ...item });
                            setEditOriginal({ ...item });
                            setEditErrors({});
                            closeHistory(); // history band karo jab edit khulo
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className={`history-btn${historyProject?.project_id === item.project_id ? " history-btn-active" : ""}`}
                          onClick={() => {
                            setEditData(null); // edit band karo jab history khulo
                            setEditOriginal(null);
                            setEditErrors({});
                            handleViewHistory(item);
                          }}
                        >
                          📜 History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Edit Form (inline) ────────────────────────────────────────── */}
        {editData && (
          <div className="edit-card">
            <h4>Editing: {editData.project_id}</h4>
            <div className="form-grid">
              {Object.keys(emptyProject).map((field) => (
                <div key={field} className="field-wrap">
                  <label className="field-label">
                    {FIELD_LABELS[field]}
                    {field === "project_name" && <span className="required-star"> *</span>}
                    {field === "project_id" && <span className="disabled-tag"> — Not editable</span>}
                  </label>
                  <input
                    name={field}
                    type={getInputType(field)}
                    value={editData[field] ?? ""}
                    onChange={handleEditChange}
                    placeholder={field === "project_id" ? "Cannot be changed" : FIELD_PLACEHOLDERS[field]}
                    disabled={field === "project_id"}
                    className={
                      field === "project_id" ? "input-disabled"
                      : editErrors[field] ? "input-error"
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
                onClick={() => { setEditData(null); setEditOriginal(null); setEditErrors({}); }}
              >
                Cancel
              </button>

              <button
                className={`primary-btn ${!isDirty ? "btn-disabled" : ""}`}
                onClick={handleUpdate}
                disabled={loading || !isDirty}
                title={!isDirty ? "No changes made yet" : "Save your changes"}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {!isDirty && (
              <p className="no-change-hint">
                ℹ️ Edit any field above to enable Save Changes.
              </p>
            )}
          </div>
        )}

        {/* ── History Section (inline, same style as edit-card) ────────── */}
        {historyProject && (
          <div className="edit-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4>📜 History: {historyProject.project_id} — {historyProject.project_name}</h4>
              <button className="delete-btn" onClick={closeHistory}>
                ✕ Close
              </button>
            </div>

            {historyLoading ? (
              <div className="history-loading">Loading history...</div>
            ) : projectHistory.length === 0 ? (
              <div className="history-empty">No history records found for this project.</div>
            ) : (
              <>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Project Name</th>
                        <th>Area New</th>
                        <th>Area Existing</th>
                        <th>KML New</th>
                        <th>KML Existing</th>
                        <th>CRA New</th>
                        <th>CRA Existing</th>
                        <th>Farmer New</th>
                        <th>Farmer Existing</th>
                        <th>Tree New</th>
                        <th>Tree Existing</th>
                        <th>Updated By</th>
                        <th>Updated At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectHistory.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.project_name}</td>
                          <td>{row.area_mapped_new ?? "—"}</td>
                          <td>{row.area_mapped_existing ?? "—"}</td>
                          <td>{row.kml_verified_new ?? "—"}</td>
                          <td>{row.kml_verified_existing ?? "—"}</td>
                          <td>{row.cra_data_new ?? "—"}</td>
                          <td>{row.cra_data_existing ?? "—"}</td>
                          <td>{row.farmer_no_new ?? "—"}</td>
                          <td>{row.farmer_no_existing ?? "—"}</td>
                          <td>{row.tree_no_new ?? "—"}</td>
                          <td>{row.tree_no_existing ?? "—"}</td>
                          <td>{row.username || `User ${row.updated_by}`}</td>
                          <td>{formatEpochToDateTime(row.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {historyTotal > 200 && (
                  <div className="history-pagination">
                    <button
                      onClick={() => handleHistoryPageChange(historyPage - 1)}
                      disabled={historyPage === 1}
                      className="pagination-btn"
                    >
                      ← Previous
                    </button>
                    <span className="pagination-info">
                      Page {historyPage} of {Math.ceil(historyTotal / 200)}
                    </span>
                    <button
                      onClick={() => handleHistoryPageChange(historyPage + 1)}
                      disabled={historyPage >= Math.ceil(historyTotal / 200)}
                      className="pagination-btn"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyUpdate;