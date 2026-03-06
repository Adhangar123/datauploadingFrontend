import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend
} from "recharts";

import "../style/Visualization.css";

const API_URL =
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/farmerdata";

const COLORS = ["#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0"];

const Visualization = () => {

  const [data, setData] = useState([]);
  const [allData, setAllData] = useState([]);

  const [stateData, setStateData] = useState([]);
  const [districtData, setDistrictData] = useState([]);

  const [projects, setProjects] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [gps, setGps] = useState([]);

  const [filters, setFilters] = useState({
    project: "",
    state: "",
    district: "",
    gp: "",
    from_date: "",
    to_date: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {

      const res = await axios.get(API_URL);

      const farmers = res.data.data;

      setAllData(farmers);
      setData(farmers);

      processCharts(farmers);

      setProjects([...new Set(farmers.map(f => f.project_code))]);
      setStates([...new Set(farmers.map(f => f.state))]);
      setDistricts([...new Set(farmers.map(f => f.district))]);
      setGps([...new Set(farmers.map(f => f.blocks))]);

    } catch (error) {
      console.error(error);
    }
  };

  const processCharts = (farmers) => {

    const stateMap = {};
    const districtMap = {};

    farmers.forEach((f) => {

      if (f.state) {
        stateMap[f.state] = (stateMap[f.state] || 0) + 1;
      }

      if (f.district) {
        districtMap[f.district] = (districtMap[f.district] || 0) + 1;
      }

    });

    setStateData(
      Object.keys(stateMap).map((key) => ({
        name: key,
        value: stateMap[key]
      }))
    );

    setDistrictData(
      Object.keys(districtMap).map((key) => ({
        name: key,
        value: districtMap[key]
      }))
    );
  };

  const handleFilter = (e) => {

    const { name, value } = e.target;

    const newFilters = { ...filters, [name]: value };

    setFilters(newFilters);

    applyFilters(newFilters);
  };

  const applyFilters = (f) => {

    let filtered = allData;

    if (f.project) {
      filtered = filtered.filter(x => x.project_code === f.project);
    }

    if (f.state) {
      filtered = filtered.filter(x => x.state === f.state);
    }

    if (f.district) {
      filtered = filtered.filter(x => x.district === f.district);
    }

    if (f.gp) {
      filtered = filtered.filter(x => x.blocks === f.gp);
    }

    setData(filtered);
    processCharts(filtered);
  };

  const resetFilters = () => {
    setFilters({
      project: "",
      state: "",
      district: "",
      gp: "",
      from_date: "",
      to_date: ""
    });

    setData(allData);
    processCharts(allData);
  };

 return (
  <div className="visualization-container">

    <h2 className="dashboard-title">Farmer Data Visualization</h2>

    {/* CHARTS */}

    <div className="charts-grid">

      <div className="chart-card">
        <h3>Farmers by State</h3>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stateData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="value" fill="#4CAF50"/>
          </BarChart>
        </ResponsiveContainer>

      </div>

      <div className="chart-card">

        <h3>Farmers by District</h3>

        <ResponsiveContainer width="100%" height={300}>
          <PieChart>

            <Pie
              data={districtData}
              dataKey="value"
              nameKey="name"
              outerRadius={100}
              label
            >
              {districtData.map((entry, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>

            <Legend/>
            <Tooltip/>

          </PieChart>
        </ResponsiveContainer>

      </div>

    </div>
{/* FILTERS */}

    <div className="filters-container">

      <div className="filter-item">
        <label>PROJECT</label>
        <select name="project" value={filters.project} onChange={handleFilter}>
          <option value="">All Projects</option>
          {projects.map((p, i) => (
            <option key={i} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="filter-item">
        <label>FROM DATE</label>
        <input
          type="date"
          name="from_date"
          value={filters.from_date}
          onChange={handleFilter}
        />
      </div>

      <div className="filter-item">
        <label>TO DATE</label>
        <input
          type="date"
          name="to_date"
          value={filters.to_date}
          onChange={handleFilter}
        />
      </div>

      <div className="filter-item">
        <label>STATE</label>
        <select name="state" value={filters.state} onChange={handleFilter}>
          <option value="">All States</option>
          {states.map((s, i) => (
            <option key={i} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="filter-item">
        <label>DISTRICT</label>
        <select name="district" value={filters.district} onChange={handleFilter}>
          <option value="">All Districts</option>
          {districts.map((d, i) => (
            <option key={i} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="filter-item">
        <label>GP/IP</label>
        <select name="gp" value={filters.gp} onChange={handleFilter}>
          <option value="">All GP/IPs</option>
          {gps.map((g, i) => (
            <option key={i} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <button className="reset-btn" onClick={resetFilters}>⟳</button>

    </div>
    {/* TABLE */}

    <div className="table-card">

      <h3>Farmer Data</h3>

      <div className="table-scroll">

        <table className="farmer-table">

          <thead>
            <tr>
              <th>Farmer ID</th>
              <th>Name</th>
              <th>State</th>
              <th>District</th>
              <th>Village</th>
              <th>Project Code</th>
            </tr>
          </thead>

          <tbody>
            {data.length > 0 ? (
              data.map((farmer, index) => (
                <tr key={index}>
                  <td>{farmer.farmer_id}</td>
                  <td>{farmer.farmer_name}</td>
                  <td>{farmer.state}</td>
                  <td>{farmer.district}</td>
                  <td>{farmer.village}</td>
                  <td>{farmer.project_code}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: "center" }}>
                  No Data Found
                </td>
              </tr>
            )}
          </tbody>

        </table>

      </div>

    </div>

  </div>
);
};

export default Visualization;