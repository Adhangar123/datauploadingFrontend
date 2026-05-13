// Visualization.jsx — Farmer Dashboard (with CSV Preview Modal + Land Parcel Tab)

import React, { useEffect, useState, useCallback } from "react";
import CountUp from "react-countup";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { fetchFarmers, updateFarmer } from "../api/farmerApi";
import LpdataVisualization from "./LpdataVisualization"; // ✅ IMPORT
import "../style/Visualization.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const EMPTY_FILTERS = { project: "", state: "", district: "", gp: "" };

const KPI_META = [
  { label: "Total Farmers", key: "farmers",   icon: "👨‍🌾", color: "#2563eb" },
  { label: "States Covered", key: "states",   icon: "🗺️",  color: "#2563eb" },
  { label: "Districts",      key: "districts",icon: "📍",  color: "#2563eb" },
  { label: "Projects",       key: "projects", icon: "📂",  color: "#2563eb" },
];

const CSV_HEADERS = [
  "Farmer ID", "Name", "State", "District", "Block",
  "Gram Panchayat", "Village", "Project Code",
  "Onboarding Date", "Updated At", "Updated By",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toChartData = (farmers, key) => {
  const map = {};
  farmers.forEach((f) => { if (f[key]) map[f[key]] = (map[f[key]] || 0) + 1; });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
};

const formatTimestamp = (ts) => {
  if (!ts) return "—";
  const date = new Date(Number(ts) * 1000);
  return isNaN(date) ? ts : date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
};

const buildRows = (farmers) =>
  farmers.map((f) => [
    f.farmer_id ?? "", f.farmer_name ?? "", f.state ?? "",
    f.district ?? "", f.blocks ?? "", f.grampanchayat ?? "",
    f.village ?? "", f.project_code ?? "",
    f.onboarding_date ? formatTimestamp(f.onboarding_date) : "",
    f.updated_at ? formatTimestamp(f.updated_at) : "",
    f.username ?? "",
  ]);

// ─── CSV Download ─────────────────────────────────────────────────────────────

const triggerDownload = (farmers, label = "farmers") => {
  const rows = buildRows(farmers);
  const csvContent = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ─── CSV Preview Modal ────────────────────────────────────────────────────────

const CsvPreviewModal = ({ farmers, label, onClose, onDownload }) => {
  const rows = buildRows(farmers);
  const previewRows = rows.slice(0, 20);

  const handleBackdrop = (e) => {
    if (e.target.classList.contains("modal-backdrop")) onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-icon">📄</span>
            <div>
              <h2 className="modal-title">CSV Preview</h2>
              <p className="modal-subtitle">
                {label}_{new Date().toISOString().slice(0, 10)}.csv
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-info-bar">
          <span className="modal-info-item">📊 Total Rows: <strong>{farmers.length}</strong></span>
          <span className="modal-info-item">📋 Columns: <strong>{CSV_HEADERS.length}</strong></span>
          {farmers.length > 20 && (
            <span className="modal-info-item preview-note">
              👁️ Previewing first 20 of {farmers.length} rows
            </span>
          )}
        </div>
        <div className="modal-table-wrap">
          <table className="modal-table">
            <thead>
              <tr>
                <th className="row-num">#</th>
                {CSV_HEADERS.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                  <td className="row-num">{i + 1}</td>
                  {row.map((cell, j) => (
                    <td key={j} title={String(cell)}>
                      {cell || <span className="null-val">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <span className="modal-footer-note">
            {farmers.length > 20
              ? `⚠️ Preview shows 20 rows. All ${farmers.length} records will be in the downloaded file.`
              : `✅ All ${farmers.length} records shown above will be downloaded.`}
          </span>
          <div className="modal-footer-btns">
            <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-modal-download" onClick={onDownload}>
              ⬇ Download CSV ({farmers.length} records)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{label}</p>
        <p className="tooltip-value">{payload[0].value} farmers</p>
      </div>
    );
  }
  return null;
};

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader = ({ icon, title, subtitle, badge }) => (
  <div className="section-header">
    <div className="section-header-left">
      <span className="section-icon">{icon}</span>
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
    </div>
    {badge && <span className="section-badge">{badge}</span>}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Visualization = () => {

  // ── Tab State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("farmer"); // "farmer" | "landparcel"

  const [allData, setAllData]   = useState([]);
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const [stateChart, setStateChart]       = useState([]);
  const [districtChart, setDistrictChart] = useState([]);
  const [villageChart, setVillageChart]   = useState([]);

  const [filters, setFilters]     = useState(EMPTY_FILTERS);
  const [projects, setProjects]   = useState([]);
  const [states, setStates]       = useState([]);
  const [districts, setDistricts] = useState([]);
  const [gps, setGps]             = useState([]);

  const [stats, setStats] = useState({ farmers: 0, states: 0, districts: 0, projects: 0 });

  const [editRow, setEditRow]   = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving]     = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const rowsPerPage = 10;

  const [previewModal, setPreviewModal] = useState({ open: false, farmers: [], label: "" });

  const openPreview  = (farmers, label) => setPreviewModal({ open: true, farmers, label });
  const closePreview = () => setPreviewModal({ open: false, farmers: [], label: "" });
  const handleDownloadFromModal = () => {
    triggerDownload(previewModal.farmers, previewModal.label);
    closePreview();
  };

  // ── Generators ───────────────────────────────────────────────────────────────

  const generateStats = useCallback((farmers) => {
    setStats({
      farmers:   farmers.length,
      states:    new Set(farmers.map((f) => f.state)).size,
      districts: new Set(farmers.map((f) => f.district)).size,
      projects:  new Set(farmers.map((f) => f.project_code)).size,
    });
  }, []);

  const generateCharts = useCallback((farmers) => {
    setStateChart(toChartData(farmers, "state"));
    setDistrictChart(toChartData(farmers, "district"));
    setVillageChart(toChartData(farmers, "village").sort((a, b) => b.value - a.value).slice(0, 10));
  }, []);

  const generateDropdowns = useCallback((farmers) => {
    setProjects([...new Set(farmers.map((f) => f.project_code).filter(Boolean))]);
    setStates([...new Set(farmers.map((f) => f.state).filter(Boolean))]);
    setDistricts([...new Set(farmers.map((f) => f.district).filter(Boolean))]);
    setGps([...new Set(farmers.map((f) => f.blocks).filter(Boolean))]);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const farmers = await fetchFarmers();
      setAllData(farmers);
      setData(farmers);
      generateStats(farmers);
      generateDropdowns(farmers);
      generateCharts(farmers);
    } catch (err) {
      console.error(err);
      setError("Failed to load farmer data. Please check your connection or login again.");
    } finally {
      setLoading(false);
    }
  }, [generateStats, generateDropdowns, generateCharts]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filters ───────────────────────────────────────────────────────────────────

  const applyFilters = useCallback((f, source) => {
    let filtered = [...source];
    if (f.project)  filtered = filtered.filter((x) => x.project_code === f.project);
    if (f.state)    filtered = filtered.filter((x) => x.state === f.state);
    if (f.district) filtered = filtered.filter((x) => x.district === f.district);
    if (f.gp)       filtered = filtered.filter((x) => x.blocks === f.gp);
    setData(filtered);
    generateCharts(filtered);
    generateStats(filtered);
    setCurrentPage(1);
  }, [generateCharts, generateStats]);

  const handleFilter = (e) => {
    const { name, value } = e.target;
    const newFilters = { ...filters, [name]: value };
    setFilters(newFilters);
    applyFilters(newFilters, allData);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchQuery("");
    setData(allData);
    generateCharts(allData);
    generateStats(allData);
    setCurrentPage(1);
  };

  // ── Search ────────────────────────────────────────────────────────────────────

  const handleSearch = (e) => {
    const q = e.target.value.toLowerCase();
    setSearchQuery(q);
    const filtered = allData.filter(
      (f) =>
        (f.farmer_name || "").toLowerCase().includes(q) ||
        (f.farmer_id || "").toLowerCase().includes(q) ||
        (f.village || "").toLowerCase().includes(q)
    );
    setData(filtered);
    generateCharts(filtered);
    generateStats(filtered);
    setCurrentPage(1);
  };

  // ── Edit ──────────────────────────────────────────────────────────────────────

  const handleEdit = (farmer) => {
    setEditRow(farmer.farmer_id);
    setEditData({
      farmer_name:   farmer.farmer_name,
      state:         farmer.state,
      district:      farmer.district,
      blocks:        farmer.blocks,
      grampanchayat: farmer.grampanchayat,
      village:       farmer.village,
      project_code:  farmer.project_code,
    });
  };

  const handleEditChange = (e) => setEditData({ ...editData, [e.target.name]: e.target.value });

  const handleUpdate = async (id) => {
    setSaving(true);
    try {
      await updateFarmer(id, editData);
      alert("Farmer Updated Successfully ✅");
      setEditRow(null);
      loadData();
    } catch (err) {
      alert("Update Failed ❌ — " + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => setEditRow(null);

  // ── Pagination ────────────────────────────────────────────────────────────────

  const totalPages    = Math.ceil(data.length / rowsPerPage);
  const paginatedData = data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // ── CSV Label ─────────────────────────────────────────────────────────────────

  const getCsvLabel = () => {
    const parts = ["farmers"];
    if (filters.project)  parts.push(filters.project);
    if (filters.state)    parts.push(filters.state);
    if (filters.district) parts.push(filters.district);
    if (filters.gp)       parts.push(filters.gp);
    if (searchQuery)      parts.push("search");
    return parts.join("_").replace(/\s+/g, "-").toLowerCase();
  };

  // ── Render States ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="vis-container loading-screen">
      <div className="loader-ring"><div /><div /><div /><div /></div>
      <p className="loading-text">Loading farmer data...</p>
      <p className="loading-sub">Fetching records from database</p>
    </div>
  );

  if (error) return (
    <div className="vis-container error-screen">
      <div className="error-icon">⚠️</div>
      <h3 className="error-title">Something went wrong</h3>
      <p className="error-msg">{error}</p>
      <button className="btn-primary" onClick={loadData}>↺ Retry</button>
    </div>
  );

  // ── Main Render ───────────────────────────────────────────────────────────────

  return (
    <div className="vis-container">

      {/* ── CSV PREVIEW MODAL ──────────────────────────────────── */}
      {previewModal.open && (
        <CsvPreviewModal
          farmers={previewModal.farmers}
          label={previewModal.label}
          onClose={closePreview}
          onDownload={handleDownloadFromModal}
        />
      )}

      {/* ── TOP NAVBAR ─────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="dash-logo">🌾</div>
          <div>
            <h1 className="dash-title">Visualization Dashboard</h1>
          </div>
        </div>

        {/* ── TAB BUTTONS ──────────────────────────────────────── */}
        <nav className="dash-tabs">
          <button
            className={`dash-tab-btn ${activeTab === "farmer" ? "active" : ""}`}
            onClick={() => setActiveTab("farmer")}
          >
            👨‍🌾 Farmer Dashboard
          </button>
          <button
            className={`dash-tab-btn ${activeTab === "landparcel" ? "active" : ""}`}
            onClick={() => setActiveTab("landparcel")}
          >
            🗺️ Land Parcel Dashboard
          </button>
        </nav>

        <div className="dash-header-right">
          <button className="btn-refresh" onClick={loadData} title="Refresh Data">↺ Refresh</button>
        </div>
      </header>

      {/* ── TAB CONTENT ────────────────────────────────────────── */}

      {activeTab === "farmer" ? (

        /* ══════════ FARMER DASHBOARD ══════════ */
        <main className="dash-main">

          {/* ── SECTION 1: KPI CARDS ───────────────────────────── */}
          <section className="dash-section">
            <SectionHeader icon="📊" title="Overview" subtitle="Key performance indicators" />
            <div className="kpi-grid">
              {KPI_META.map(({ label, key, icon, color }) => (
                <div className="kpi-card" key={key} style={{ "--kpi-color": color }}>
                  <div className="kpi-icon-wrap">{icon}</div>
                  <div className="kpi-body">
                    <p className="kpi-label">{label}</p>
                    <h2 className="kpi-value">
                      <CountUp end={stats[key]} duration={2} separator="," />
                    </h2>
                  </div>
                  <div className="kpi-bar" style={{ background: color }} />
                </div>
              ))}
            </div>
          </section>

          {/* ── SECTION 2: CHARTS ──────────────────────────────── */}
          <section className="dash-section">
            <SectionHeader icon="📈" title="Analytics" subtitle="Visual breakdown of farmer distribution" />
            <div className="charts-grid-2col">
              <div className="chart-card">
                <div className="chart-card-header">
                  <h3>Farmers by State</h3>
                  <span className="chart-count">{stateChart.length} states</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stateChart} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]}>
                      {stateChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <div className="chart-card-header">
                  <h3>Top 10 Villages</h3>
                  <span className="chart-count">by farmer count</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={villageChart} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" fill="#2563eb" radius={[0, 6, 6, 0]}>
                      {villageChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card district-card">
              <div className="chart-card-header">
                <h3>Farmers by District</h3>
                <span className="chart-count">{districtChart.length} districts</span>
              </div>
              <div className="district-layout">
                <div className="district-pie">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={districtChart} dataKey="value" nameKey="name"
                        outerRadius={120} innerRadius={50} paddingAngle={2}
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      >
                        {districtChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(val) => [`${val} farmers`, "Count"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="district-list">
                  {districtChart.map((entry, i) => (
                    <div key={i} className="legend-row">
                      <span className="legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="legend-name">{entry.name}</span>
                      <div className="legend-bar-wrap">
                        <div
                          className="legend-bar-fill"
                          style={{
                            width: `${(entry.value / Math.max(...districtChart.map(d => d.value))) * 100}%`,
                            background: COLORS[i % COLORS.length]
                          }}
                        />
                      </div>
                      <span className="legend-val">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── SECTION 3: FILTERS ─────────────────────────────── */}
          <section className="dash-section">
            <SectionHeader icon="🔽" title="Filters" subtitle="Narrow down records by category" />
            <div className="filter-panel">
              <div className="filter-group">
                <label className="filter-label">PROJECT</label>
                <select name="project" value={filters.project} onChange={handleFilter} className="filter-select">
                  <option value="">All Projects</option>
                  {projects.map((p, i) => <option key={i} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">FROM DATE</label>
                <input type="date" className="filter-input" />
              </div>
              <div className="filter-group">
                <label className="filter-label">TO DATE</label>
                <input type="date" className="filter-input" />
              </div>
              <div className="filter-group">
                <label className="filter-label">STATE</label>
                <select name="state" value={filters.state} onChange={handleFilter} className="filter-select">
                  <option value="">All States</option>
                  {states.map((s, i) => <option key={i} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">DISTRICT</label>
                <select name="district" value={filters.district} onChange={handleFilter} className="filter-select">
                  <option value="">All Districts</option>
                  {districts.map((d, i) => <option key={i} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">GP / IP</label>
                <select name="gp" value={filters.gp} onChange={handleFilter} className="filter-select">
                  <option value="">All GP/IPs</option>
                  {gps.map((g, i) => <option key={i} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="header-search">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search farmer, ID, village..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="header-search-input"
                />
              </div>
              <button className="btn-reset" onClick={resetFilters}>↺ Reset All</button>
            </div>
          </section>

          {/* ── SECTION 4: TABLE ───────────────────────────────── */}
          <section className="dash-section">
            <SectionHeader
              icon="📋"
              title="Farmer Records"
              subtitle="View, search and edit farmer data"
              badge={`${data.length} records`}
            />
            <div className="table-actions-bar">
              <span className="table-result-info">
                Showing <strong>{paginatedData.length}</strong> of <strong>{data.length}</strong> filtered records
                {data.length !== allData.length && (
                  <span className="filter-active-badge"> (filtered from {allData.length} total)</span>
                )}
              </span>
              <button
                className="btn-download"
                onClick={() => openPreview(data, getCsvLabel())}
                title="Preview & Download CSV"
              >
                ⬇ Download CSV ({data.length})
              </button>
            </div>

            <div className="table-card">
              <div className="table-scroll">
                <table className="farmer-table">
                  <thead>
                    <tr>
                      {["Farmer ID", "Name", "State", "District", "Block", "Gram Panchayat",
                        "Village", "Project Code", "Onboarding Date", "Updated At", "Updated By", "Action"]
                        .map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="empty-row">
                          <div className="empty-state">
                            <span className="empty-icon">🔍</span>
                            <p>No records found for selected filters.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((f, i) => (
                        <tr key={i} className={editRow === f.farmer_id ? "editing-row" : ""}>
                          <td><span className="farmer-id">{f.farmer_id}</span></td>
                          {["farmer_name", "state", "district", "blocks", "grampanchayat", "village", "project_code"].map((field) => (
                            <td key={field}>
                              {editRow === f.farmer_id ? (
                                <input
                                  name={field}
                                  value={editData[field] || ""}
                                  onChange={handleEditChange}
                                  className="edit-input"
                                />
                              ) : (
                                f[field] ?? <span className="null-val">—</span>
                              )}
                            </td>
                          ))}
                          <td>{f.onboarding_date ? formatTimestamp(f.onboarding_date) : <span className="null-val">—</span>}</td>
                          <td>{f.updated_at ? formatTimestamp(f.updated_at) : <span className="null-val">—</span>}</td>
                          <td>{f.username ?? <span className="null-val">—</span>}</td>
                          <td>
                            {editRow === f.farmer_id ? (
                              <div className="action-btns">
                                <button className="btn-save" onClick={() => handleUpdate(f.farmer_id)} disabled={saving}>
                                  {saving ? "..." : "✓ Save"}
                                </button>
                                <button className="btn-cancel" onClick={handleCancelEdit}>Cancel</button>
                              </div>
                            ) : (
                              <button className="btn-edit" onClick={() => handleEdit(f)}>Edit</button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="pg-btn">«</button>
                  <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="pg-btn">‹ Prev</button>
                  <div className="pg-numbers">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(1, currentPage - 2);
                      const page  = start + i;
                      if (page > totalPages) return null;
                      return (
                        <button
                          key={page}
                          className={`pg-num ${page === currentPage ? "active" : ""}`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="pg-btn">Next ›</button>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="pg-btn">»</button>
                  <span className="pg-info">Page {currentPage} of {totalPages}</span>
                </div>
              )}
            </div>
          </section>

        </main>

      ) : (

        /* ══════════ LAND PARCEL DASHBOARD ══════════ */
        <main className="dash-main">
          <LpdataVisualization />
        </main>

      )}

    </div>
  );
};

export default Visualization;