// Visualization.jsx — UI + Logic for Farmer Dashboard

import React, { useEffect, useState, useCallback } from "react";
import CountUp from "react-countup";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";
import { fetchFarmers, updateFarmer } from "../api/farmerApi"; // ← API layer
import "../style/Visualization.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = ["#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0", "#00BCD4"];

const EMPTY_FILTERS = { project: "", state: "", district: "", gp: "" };

// ─── Helper: build chart data from a key ──────────────────────────────────────

const toChartData = (farmers, key) => {
  const map = {};
  farmers.forEach((f) => {
    if (f[key]) map[f[key]] = (map[f[key]] || 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
};

// ─── Component ────────────────────────────────────────────────────────────────

const Visualization = () => {

  // ── Data State ──────────────────────────────────────────────────────────────

  const [allData, setAllData]       = useState([]);
  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // ── Chart State ─────────────────────────────────────────────────────────────

  const [stateChart, setStateChart]       = useState([]);
  const [districtChart, setDistrictChart] = useState([]);
  const [villageChart, setVillageChart]   = useState([]);

  // ── Filter State ─────────────────────────────────────────────────────────────

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [projects, setProjects] = useState([]);
  const [states, setStates]    = useState([]);
  const [districts, setDistricts] = useState([]);
  const [gps, setGps]          = useState([]);

  // ── Stats State ──────────────────────────────────────────────────────────────

  const [stats, setStats] = useState({ farmers: 0, states: 0, districts: 0, projects: 0 });

  // ── Edit State ───────────────────────────────────────────────────────────────

  const [editRow, setEditRow]   = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving]     = useState(false);

  // ── Pagination State ─────────────────────────────────────────────────────────

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // ─── Derived chart + stats generators ───────────────────────────────────────

  const generateStats = useCallback((farmers) => {
    setStats({
      farmers:  farmers.length,
      states:   new Set(farmers.map((f) => f.state)).size,
      districts: new Set(farmers.map((f) => f.district)).size,
      projects: new Set(farmers.map((f) => f.project_code)).size,
    });
  }, []);

  const generateCharts = useCallback((farmers) => {
    setStateChart(toChartData(farmers, "state"));
    setDistrictChart(toChartData(farmers, "district"));

    const villages = toChartData(farmers, "village")
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    setVillageChart(villages);
  }, []);

  const generateDropdowns = useCallback((farmers) => {
    setProjects([...new Set(farmers.map((f) => f.project_code).filter(Boolean))]);
    setStates([...new Set(farmers.map((f) => f.state).filter(Boolean))]);
    setDistricts([...new Set(farmers.map((f) => f.district).filter(Boolean))]);
    setGps([...new Set(farmers.map((f) => f.blocks).filter(Boolean))]);
  }, []);

  // ─── Initial data load ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const farmers = await fetchFarmers(5000);
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Filter Logic ─────────────────────────────────────────────────────────────

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
    setData(allData);
    generateCharts(allData);
    generateStats(allData);
    setCurrentPage(1);
  };

  // ─── Edit Logic ───────────────────────────────────────────────────────────────

  const handleEdit = (farmer) => {
    setEditRow(farmer.farmer_id);
    setEditData({
      farmer_name:  farmer.farmer_name,
      state:        farmer.state,
      district:     farmer.district,
      village:      farmer.village,
      project_code: farmer.project_code,
    });
  };

  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (id) => {
    setSaving(true);
    try {
      await updateFarmer(id, editData);
      alert("Farmer Updated Successfully ✅");
      setEditRow(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert("Update Failed ❌ — " + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => setEditRow(null);

  // ─── Pagination ───────────────────────────────────────────────────────────────

  const totalPages   = Math.ceil(data.length / rowsPerPage);
  const paginatedData = data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="visualization-container loading-screen">
        <div className="loader-spinner" />
        <p>Loading farmer data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="visualization-container error-screen">
        <p className="error-msg">⚠️ {error}</p>
        <button className="reset-btn" onClick={loadData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="visualization-container">

      <h2 className="dashboard-title">🌾 Farmer Dashboard</h2>

      {/* ── KPI CARDS ─────────────────────────────────────────── */}

      <div className="kpi-grid">
        {[
          { label: "Total Farmers", value: stats.farmers },
          { label: "States",        value: stats.states },
          { label: "Districts",     value: stats.districts },
          { label: "Projects",      value: stats.projects },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <h4>{label}</h4>
            <h2><CountUp end={value} duration={2} /></h2>
          </div>
        ))}
      </div>

      {/* ── CHARTS ────────────────────────────────────────────── */}

      <div className="charts-grid">

        <div className="chart-card">
          <h3>Farmers by State</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stateChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#4CAF50" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Farmers by District</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={districtChart} dataKey="value" nameKey="name" outerRadius={110} label>
                {districtChart.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Top 10 Villages</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={villageChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#2196F3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── FILTERS ───────────────────────────────────────────── */}

      <div className="filters-container">

        <div className="filter-item">
          <label>PROJECT</label>
          <select name="project" value={filters.project} onChange={handleFilter}>
            <option value="">All Projects</option>
            {projects.map((p, i) => <option key={i} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="filter-item">
          <label>FROM DATE</label>
          <input type="date" />
        </div>

        <div className="filter-item">
          <label>TO DATE</label>
          <input type="date" />
        </div>

        <div className="filter-item">
          <label>STATE</label>
          <select name="state" value={filters.state} onChange={handleFilter}>
            <option value="">All States</option>
            {states.map((s, i) => <option key={i} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="filter-item">
          <label>DISTRICT</label>
          <select name="district" value={filters.district} onChange={handleFilter}>
            <option value="">All Districts</option>
            {districts.map((d, i) => <option key={i} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="filter-item">
          <label>GP/IP</label>
          <select name="gp" value={filters.gp} onChange={handleFilter}>
            <option value="">All GP/IPs</option>
            {gps.map((g, i) => <option key={i} value={g}>{g}</option>)}
          </select>
        </div>

        <button className="reset-btn" onClick={resetFilters} title="Reset Filters">⟳</button>

      </div>

      {/* ── TABLE ─────────────────────────────────────────────── */}

      <div className="table-card">

        <div className="table-header-row">
          <h3>Farmer Data</h3>
          <span className="record-count">Showing {data.length} records</span>
        </div>

        <div className="table-scroll">
          <table className="farmer-table">
            <thead>
              <tr>
                <th>Farmer ID</th>
                <th>Name</th>
                <th>State</th>
                <th>District</th>
                <th>Village</th>
                <th>Project</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((f, i) => (
                <tr key={i}>

                  <td>{f.farmer_id}</td>

                  {/* Editable fields */}
                  {["farmer_name", "state", "district", "village", "project_code"].map((field) => (
                    <td key={field}>
                      {editRow === f.farmer_id ? (
                        <input
                          name={field}
                          value={editData[field] || ""}
                          onChange={handleEditChange}
                          className="edit-input"
                        />
                      ) : (
                        f[field]
                      )}
                    </td>
                  ))}

                  {/* Action buttons */}
                  <td>
                    {editRow === f.farmer_id ? (
                      <div className="action-btns">
                        <button
                          className="save-btn"
                          onClick={() => handleUpdate(f.farmer_id)}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button className="cancel-btn" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="edit-btn" onClick={() => handleEdit(f)}>
                        Edit
                      </button>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
            >
              ← Prev
            </button>

            <span>Page {currentPage} of {totalPages}</span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}

      </div>

    </div>
  );
};

export default Visualization;