import React, { useEffect, useState } from "react";
import "../style/WeeklyUpdate.css";
import {
  fetchProjects,
  createProject,
  updateProject,
  fetchProjectHistory,
} from "../api/projectUpdateAPI";

// ─────────────────────────────────────────────────────────────────────────────
//  Field configuration (backend schema ke according)
//  Naya column add karna ho to sirf DATA_FIELDS mein ek entry add karo.
// ─────────────────────────────────────────────────────────────────────────────
const DATA_FIELDS = [
  {
    key: "eligible_area_for_plantation_current_year",
    label: "Eligible Area for Plantation — Current Year (ha)",
    short: "Eligible Area (CY)",
    placeholder: "e.g. 120.50",
    type: "float",
  },
  {
    key: "existing_plantation_onboarded_current_year",
    label: "Existing Plantation Onboarded — Current Year (ha)",
    short: "Existing Plantation Onboarded (CY)",
    placeholder: "e.g. 45.00",
    type: "float",
  },
  {
    key: "farmer_with_cra_new",
    label: "Farmer with CRA — New",
    short: "Farmer with CRA (New)",
    placeholder: "e.g. 25",
    type: "float",
  },
  {
    key: "farmer_with_land_records_existing",
    label: "Farmer with Land Records — Existing",
    short: "Farmer with Land Records (Existing)",
    placeholder: "e.g. 120",
    type: "float",
  },
  {
    key: "farmer_onboarded_new",
    label: "Farmer Onboarded — New",
    short: "Farmer Onboarded (New)",
    placeholder: "e.g. 25",
    type: "int",
  },
  {
    key: "farmer_onboarded_existing",
    label: "Farmer Onboarded — Existing",
    short: "Farmer Onboarded (Existing)",
    placeholder: "e.g. 120",
    type: "int",
  },
  {
    key: "consolidated_area_under_plantation",
    label: "Consolidated Area Under Plantation (ha)",
    short: "Consolidated Area",
    placeholder: "e.g. 300.75",
    type: "float",
  },
  {
    key: "area_under_plantation_current_year",
    label: "Area Under Plantation — Current Year (ha)",
    short: "Area Under Plantation (CY)",
    placeholder: "e.g. 80.25",
    type: "float",
  },
  {
    key: "total_trees_under_project",
    label: "Total Trees Under Project",
    short: "Total Trees",
    placeholder: "e.g. 3000",
    type: "int",
  },
];

const FLOAT_FIELDS = DATA_FIELDS.filter((f) => f.type === "float").map((f) => f.key);
const INT_FIELDS = DATA_FIELDS.filter((f) => f.type === "int").map((f) => f.key);
const NUMERIC_FIELDS = [...FLOAT_FIELDS, ...INT_FIELDS];

const FORM_FIELDS = [
  {
    key: "project_id",
    label: "Project ID",
    placeholder: "e.g. PROJ-001",
    type: "text",
  },
  {
    key: "project_name",
    label: "Project Name",
    placeholder: "e.g. Green Valley Reforestation",
    type: "text",
  },
  ...DATA_FIELDS,
];

const emptyProject = FORM_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});

const REQUIRED_FIELDS = ["project_id", "project_name"];

const PG_INT_MAX = 2147483647; // DB INTEGER limit
const HISTORY_PAGE_SIZE = 50;

// Main table mein jo columns dikhane hain
const TABLE_COLUMNS = [
  "consolidated_area_under_plantation",
  "area_under_plantation_current_year",
  "total_trees_under_project",
];
const shortLabel = (key) => DATA_FIELDS.find((f) => f.key === key)?.short ?? key;

// ─────────────────────────────────────────────────────────────────────────────
//  Validation helpers
// ─────────────────────────────────────────────────────────────────────────────
const isEmptyValue = (v) => v === "" || v === null || v === undefined;

const FLOAT_RE = /^\d+(\.\d+)?$/;
const INT_RE = /^\d+$/;

const isValidNumber = (value, type) => {
  if (isEmptyValue(value)) return true;
  const str = String(value).trim();
  if (type === "float") {
    return FLOAT_RE.test(str) && Number.isFinite(parseFloat(str));
  }
  if (type === "int") {
    return INT_RE.test(str) && Number(str) <= PG_INT_MAX;
  }
  return true;
};

const isValidProjectId = (id) =>
  typeof id === "string" &&
  id.trim().length > 0 &&
  id.trim().length <= 50 && // DB: VARCHAR(50)
  /^[a-zA-Z0-9_-]+$/.test(id.trim());

const validateProject = (proj, isEdit = false) => {
  const errors = {};

  if (!isEdit) {
    const id = String(proj.project_id ?? "");
    if (id.trim() === "") {
      errors.project_id = "Project ID is required.";
    } else if (!isValidProjectId(id)) {
      errors.project_id =
        "Only letters, numbers, hyphens (-) and underscores (_) are allowed (max 50 chars).";
    }
  }

  const name = String(proj.project_name ?? "");
  if (name.trim() === "") {
    errors.project_name = "Project Name is required.";
  } else if (name.trim().length > 255) {
    errors.project_name = "Project Name must not exceed 255 characters.";
  }

  FLOAT_FIELDS.forEach((field) => {
    if (!isValidNumber(proj[field], "float")) {
      errors[field] = "Must be a valid positive number (e.g. 12.5, 45.00).";
    }
  });

  INT_FIELDS.forEach((field) => {
    if (!isValidNumber(proj[field], "int")) {
      errors[field] = `Must be a whole number between 0 and ${PG_INT_MAX.toLocaleString("en-IN")}.`;
    }
  });

  return errors;
};

// Typing ke time sirf allowed characters rakho
const isAllowedTyping = (value, type) => {
  if (value === "") return true;
  if (type === "float") return /^\d*\.?\d*$/.test(value);
  if (type === "int") return /^\d*$/.test(value);
  return true;
};

// Backend ko sirf wahi fields bhejo jo allowed hain.
// created_by / updated_by backend token se khud set karta hai.
const preparePayload = (proj, isEdit = false) => {
  const payload = { project_name: String(proj.project_name).trim() };

  if (!isEdit) payload.project_id = String(proj.project_id).trim();

  FLOAT_FIELDS.forEach((f) => {
    payload[f] = isEmptyValue(proj[f]) ? 0 : parseFloat(proj[f]);
  });
  INT_FIELDS.forEach((f) => {
    payload[f] = isEmptyValue(proj[f]) ? 0 : parseInt(proj[f], 10);
  });

  return payload;
};

// Value ko compare ke liye normalize karo (12.5 aur "12.50" same maane jaayenge)
const normalizeValue = (field, v) => {
  if (isEmptyValue(v)) return "";
  if (NUMERIC_FIELDS.includes(field)) {
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : String(n);
  }
  return String(v).trim();
};

const hasChanges = (original, current) => {
  if (!original || !current) return false;
  return FORM_FIELDS.some(
    ({ key }) => normalizeValue(key, original[key]) !== normalizeValue(key, current[key])
  );
};

const formatEpochToDateTime = (epochTime) => {
  if (!epochTime) return "—";
  const timestamp = typeof epochTime === "string" ? parseInt(epochTime, 10) : Number(epochTime);
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
  });
};

const getInputProps = (field) => {
  if (FLOAT_FIELDS.includes(field)) {
    return { inputMode: "decimal", pattern: "[0-9]*\\.?[0-9]*" };
  }
  if (INT_FIELDS.includes(field)) {
    return { inputMode: "numeric", pattern: "[0-9]*" };
  }
  return {};
};

const showValue = (v) => (v === null || v === undefined || v === "" ? "—" : v);

// ─────────────────────────────────────────────────────────────────────────────

const WeeklyUpdate = () => {
  const [projects, setProjects] = useState([{ ...emptyProject }]);
  const [addErrors, setAddErrors] = useState([{}]);
  const [editData, setEditData] = useState(null);
  const [editOriginal, setEditOriginal] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [dataList, setDataList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState({ show: false, message: "", type: "" });

  // ── Dropdown (accordion) states ───────────────────────────────────────────
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownType, setDropdownType] = useState(null); // 'edit' | 'history'

  const [historyProject, setHistoryProject] = useState(null);
  const [projectHistory, setProjectHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

  const isLoggedIn = () => !!localStorage.getItem("token");

  const closeDialog = () => setDialog({ show: false, message: "", type: "" });

  const showDialog = (message, type = "error") => setDialog({ show: true, message, type });

  const closeDropdown = () => {
    setOpenDropdownId(null);
    setDropdownType(null);
    setEditData(null);
    setEditOriginal(null);
    setEditErrors({});
    setHistoryProject(null);
    setProjectHistory([]);
    setHistoryTotal(0);
  };

  // ── Dialog auto-close after 3s ────────────────────────────────────────────
  useEffect(() => {
    if (dialog.show) {
      const t = setTimeout(closeDialog, 3000);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  // ── Search logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredList(dataList);
    } else {
      const q = searchText.trim().toLowerCase();
      setFilteredList(
        dataList.filter(
          (item) =>
            String(item.project_id || "").toLowerCase().includes(q) ||
            String(item.project_name || "").toLowerCase().includes(q)
        )
      );
    }
  }, [searchText, dataList]);

  // ── Fetch list ────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const data = await fetchProjects(200);
      if (data.success) {
        setDataList(data.data);
      } else {
        showDialog(data.message || "Failed to fetch projects.");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      showDialog("Failed to fetch projects. Please check your connection.");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Add form handlers ─────────────────────────────────────────────────────
  const handleAddChange = (index, e) => {
    const { name, value } = e.target;

    if (FLOAT_FIELDS.includes(name) && !isAllowedTyping(value, "float")) return;
    if (INT_FIELDS.includes(name) && !isAllowedTyping(value, "int")) return;

    setProjects((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [name]: value } : p))
    );

    setAddErrors((prev) =>
      prev.map((errs, i) => {
        if (i !== index || !errs[name]) return errs;
        const { [name]: _removed, ...rest } = errs;
        return rest;
      })
    );
  };

  const addRow = () => {
    setProjects((prev) => [...prev, { ...emptyProject }]);
    setAddErrors((prev) => [...prev, {}]);
  };

  const removeRow = (index) => {
    if (projects.length === 1) return;
    setProjects((prev) => prev.filter((_, i) => i !== index));
    setAddErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSubmit = async () => {
    if (!isLoggedIn()) {
      showDialog("User not logged in. Please login again.");
      return;
    }

    const allErrors = projects.map((p) => validateProject(p, false));

    // Same form ke andar duplicate project_id check
    const seen = {};
    projects.forEach((p, i) => {
      const id = String(p.project_id ?? "").trim().toLowerCase();
      if (!id) return;
      if (seen[id] !== undefined) {
        allErrors[i].project_id = "Duplicate Project ID in this form.";
      } else {
        seen[id] = i;
      }
    });

    if (allErrors.some((e) => Object.keys(e).length > 0)) {
      setAddErrors(allErrors);
      showDialog("Please fix the highlighted errors before submitting.");
      return;
    }

    setLoading(true);
    let successCount = 0;
    const failed = [];

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const label = project.project_name || project.project_id;
      try {
        const { ok, status, data } = await createProject(preparePayload(project, false));
        if (ok) {
          successCount++;
        } else {
          failed.push({
            index: i,
            name: label,
            error:
              status === 401
                ? "Session expired. Please login again."
                : data?.message || "Unknown error",
          });
        }
      } catch (err) {
        failed.push({ index: i, name: label, error: err.message || "Network error" });
      }
    }

    setLoading(false);

    if (failed.length === 0) {
      setProjects([{ ...emptyProject }]);
      setAddErrors([{}]);
      showDialog(`✅ ${successCount} project(s) submitted successfully!`, "success");
    } else {
      // Sirf failed entries form mein rakho taaki user fix karke dobara bhej sake
      setProjects(failed.map((f) => projects[f.index]));
      setAddErrors(failed.map(() => ({})));
      showDialog(
        `❌ ${failed.length} project(s) failed${
          successCount ? ` (${successCount} saved)` : ""
        }.\n\n${failed.map((p) => `• ${p.name}: ${p.error}`).join("\n")}`,
        "error"
      );
    }

    fetchData();
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const handleEditChange = (e) => {
    const { name, value } = e.target;

    if (FLOAT_FIELDS.includes(name) && !isAllowedTyping(value, "float")) return;
    if (INT_FIELDS.includes(name) && !isAllowedTyping(value, "int")) return;

    setEditData((prev) => ({ ...prev, [name]: value }));
    if (editErrors[name]) {
      setEditErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleUpdate = async () => {
    if (!isLoggedIn()) {
      showDialog("User not logged in. Please login again.");
      return;
    }

    const errors = validateProject(editData, true);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      showDialog("Please fix the highlighted errors before updating.");
      return;
    }

    setLoading(true);
    try {
      const { ok, status, data } = await updateProject(
        editData.project_id,
        preparePayload(editData, true)
      );

      if (ok) {
        showDialog("✅ Project updated successfully!", "success");
        closeDropdown();
        fetchData();
      } else {
        showDialog(
          status === 401
            ? "Session expired. Please login again."
            : data?.message || "Update failed. Please try again."
        );
      }
    } catch (err) {
      showDialog(`Network error: ${err.message || "Please try again."}`);
    }
    setLoading(false);
  };

  // ── History handlers ──────────────────────────────────────────────────────
  const fetchHistoryData = async (projectId, page = 1) => {
    setHistoryLoading(true);
    try {
      const result = await fetchProjectHistory(projectId, page, HISTORY_PAGE_SIZE);
      if (result.ok && result.data.success) {
        setProjectHistory(result.data.data || []);
        setHistoryTotal(result.data.total || 0);
      } else {
        setProjectHistory([]);
        setHistoryTotal(0);
        showDialog(result.data?.message || "Failed to fetch project history.");
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      setProjectHistory([]);
      setHistoryTotal(0);
      showDialog("Failed to fetch project history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryPageChange = (newPage) => {
    if (newPage >= 1 && historyProject) {
      setHistoryPage(newPage);
      fetchHistoryData(historyProject.project_id, newPage);
    }
  };

  // ── Dropdown toggle (accordion) ───────────────────────────────────────────
  const toggleDropdown = (item, type) => {
    const sameOpen = openDropdownId === item.project_id && dropdownType === type;
    closeDropdown();
    if (sameOpen) return;

    setOpenDropdownId(item.project_id);
    setDropdownType(type);

    if (type === "edit") {
      setEditData({ ...item });
      setEditOriginal({ ...item });
    } else if (type === "history") {
      setHistoryProject(item);
      setHistoryPage(1);
      fetchHistoryData(item.project_id, 1);
    }
  };

  const isDirty = hasChanges(editOriginal, editData);
  const historyTotalPages = Math.ceil(historyTotal / HISTORY_PAGE_SIZE);
  const tableColSpan = 3 + TABLE_COLUMNS.length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <h1 className="title">📊 Weekly Project Update</h1>

      {/* ── Success/Error Dialog ──────────────────────────────────────────── */}
      {dialog.show && (
        <div className="dialog-overlay" onClick={closeDialog}>
          <div
            className={`dialog-box ${dialog.type === "error" ? "dialog-error" : "dialog-success"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon">{dialog.type === "success" ? "✅" : "❌"}</div>
            <p className="dialog-message" style={{ whiteSpace: "pre-line" }}>
              {dialog.message}
            </p>
            <button className="dialog-close-btn" onClick={closeDialog}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* ── ADD SECTION ───────────────────────────────────────────────────── */}
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
              {FORM_FIELDS.map((f) => (
                <div key={f.key} className="field-wrap">
                  <label className="field-label">
                    {f.label}
                    {REQUIRED_FIELDS.includes(f.key) && <span className="required-star"> *</span>}
                  </label>
                  <input
                    name={f.key}
                    type="text"
                    placeholder={f.placeholder}
                    value={proj[f.key]}
                    onChange={(e) => handleAddChange(index, e)}
                    className={addErrors[index]?.[f.key] ? "input-error" : ""}
                    required={REQUIRED_FIELDS.includes(f.key)}
                    maxLength={f.key === "project_id" ? 50 : f.key === "project_name" ? 255 : undefined}
                    {...getInputProps(f.key)}
                  />
                  {addErrors[index]?.[f.key] && (
                    <span className="error-msg">⚠ {addErrors[index][f.key]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="action-row">
          <button className="add-btn" onClick={addRow}>
            + Add Another Entry
          </button>
          <button className="primary-btn" onClick={handleAddSubmit} disabled={loading}>
            {loading ? "Submitting..." : "Submit All"}
          </button>
        </div>
      </div>

      {/* ── UPDATE SECTION ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Update Projects Data</h3>
        </div>

        {/* ── Search Bar ──────────────────────────────────────────────────── */}
        <div className="filter-bar">
          <input
            className="filter-input"
            type="text"
            placeholder="Search by Project ID or Project Name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {searchText && (
            <button className="filter-clear-btn" onClick={() => setSearchText("")}>
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
                {TABLE_COLUMNS.map((key) => (
                  <th key={key}>{shortLabel(key)}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} style={{ textAlign: "center", padding: "16px" }}>
                    {searchText ? "No matching records found." : "No records found."}
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const isEditOpen =
                    openDropdownId === item.project_id && dropdownType === "edit";
                  const isHistoryOpen =
                    openDropdownId === item.project_id && dropdownType === "history";

                  return (
                    <React.Fragment key={item.project_id}>
                      <tr>
                        <td>{item.project_id}</td>
                        <td>{item.project_name}</td>
                        {TABLE_COLUMNS.map((key) => (
                          <td key={key}>{showValue(item[key])}</td>
                        ))}
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className={`dropdown-btn ${isEditOpen ? "active" : ""}`}
                              onClick={() => toggleDropdown(item, "edit")}
                            >
                              {isEditOpen ? "▲ Close Edit" : "▼ Edit"}
                            </button>
                            <button
                              className={`dropdown-btn ${isHistoryOpen ? "active" : ""}`}
                              onClick={() => toggleDropdown(item, "history")}
                            >
                              {isHistoryOpen ? "▲ Close History" : "▼ History"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Edit Form ───────────────────────────────────────── */}
                      {isEditOpen && editData && (
                        <tr className="dropdown-row">
                          <td colSpan={tableColSpan}>
                            <div className="dropdown-content">
                              <h4>✏️ Edit Project: {editData.project_id}</h4>
                              <div className="form-grid">
                                {FORM_FIELDS.map((f) => (
                                  <div key={f.key} className="field-wrap">
                                    <label className="field-label">
                                      {f.label}
                                      {f.key === "project_name" && (
                                        <span className="required-star"> *</span>
                                      )}
                                      {f.key === "project_id" && (
                                        <span className="disabled-tag"> — Not editable</span>
                                      )}
                                    </label>
                                    <input
                                      name={f.key}
                                      type="text"
                                      value={editData[f.key] ?? ""}
                                      onChange={handleEditChange}
                                      placeholder={
                                        f.key === "project_id" ? "Cannot be changed" : f.placeholder
                                      }
                                      disabled={f.key === "project_id"}
                                      className={
                                        f.key === "project_id"
                                          ? "input-disabled"
                                          : editErrors[f.key]
                                          ? "input-error"
                                          : ""
                                      }
                                      required={f.key === "project_name"}
                                      maxLength={f.key === "project_name" ? 255 : undefined}
                                      {...(f.key !== "project_id" ? getInputProps(f.key) : {})}
                                    />
                                    {editErrors[f.key] && (
                                      <span className="error-msg">⚠ {editErrors[f.key]}</span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="action-row">
                                <button className="delete-btn" onClick={closeDropdown}>
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
                          </td>
                        </tr>
                      )}

                      {/* ── History Section ─────────────────────────────────── */}
                      {isHistoryOpen && historyProject && (
                        <tr className="dropdown-row">
                          <td colSpan={tableColSpan}>
                            <div className="dropdown-content">
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "12px",
                                }}
                              >
                                <h4>
                                  📜 History: {historyProject.project_id} —{" "}
                                  {historyProject.project_name}
                                </h4>
                                <button className="delete-btn" onClick={closeDropdown}>
                                  ✕ Close
                                </button>
                              </div>

                              {historyLoading ? (
                                <div className="history-loading">Loading history...</div>
                              ) : projectHistory.length === 0 ? (
                                <div className="history-empty">
                                  No history records found for this project.
                                </div>
                              ) : (
                                <>
                                  <div className="history-table-wrapper">
                                    <table className="history-table">
                                      <thead>
                                        <tr>
                                          <th>Project Name</th>
                                          {DATA_FIELDS.map((f) => (
                                            <th key={f.key}>{f.short}</th>
                                          ))}
                                          <th>Action</th>
                                          <th>Updated By</th>
                                          <th>Updated At</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {projectHistory.map((row) => (
                                          <tr key={row.id}>
                                            <td>{row.project_name}</td>
                                            {DATA_FIELDS.map((f) => (
                                              <td key={f.key}>{showValue(row[f.key])}</td>
                                            ))}
                                            <td>{row.action}</td>
                                            <td>
                                              {row.username ||
                                                `User ${row.updated_by ?? row.created_by ?? "—"}`}
                                            </td>
                                            <td>
                                              {formatEpochToDateTime(
                                                row.updated_at || row.created_at
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {historyTotal > HISTORY_PAGE_SIZE && (
                                    <div className="history-pagination">
                                      <button
                                        onClick={() => handleHistoryPageChange(historyPage - 1)}
                                        disabled={historyPage === 1}
                                        className="pagination-btn"
                                      >
                                        ← Previous
                                      </button>
                                      <span className="pagination-info">
                                        Page {historyPage} of {historyTotalPages}
                                      </span>
                                      <button
                                        onClick={() => handleHistoryPageChange(historyPage + 1)}
                                        disabled={historyPage >= historyTotalPages}
                                        className="pagination-btn"
                                      >
                                        Next →
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WeeklyUpdate;