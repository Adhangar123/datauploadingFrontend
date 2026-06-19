import {
  useState, useEffect, useRef, useCallback, useMemo, useReducer,
} from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import CountUp from "react-countup";
import "leaflet/dist/leaflet.css";
import "../style/Visualization.css";
import "../style/LpdataVisualization.css";

import {
  fetchLandParcels,
  fetchFilterOptions,
  normalizeOverview,
  parcelsToGeoJSON,
  aggregateByFarmer,
  aggregateByVillage,
} from "../api/LandparcelDataApi";

/* ─────────────────────────────────────────────
   CONSTANTS
   ⚠️ Backend ab FIXED 50 rows/page deta hai — page-size selector
      (25/50/100/200/500/All) hata diya gaya hai, kyunki backend
      use ignore kar dega.
───────────────────────────────────────────── */
const PAGE_SIZE = 50;

const MAP_TILES = {
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri",
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO",
  },
  light: {
    name: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO",
  },
};

const POLYGON_STYLE = {
  color: "#00e5a0",
  weight: 1.5,
  opacity: 0.85,
  fillColor: "#00e5a0",
  fillOpacity: 0.12,
};

const POLYGON_SELECTED = {
  color: "#fbbf24",
  weight: 3,
  opacity: 1,
  fillColor: "#fbbf24",
  fillOpacity: 0.28,
};

/* ─────────────────────────────────────────────
   SECTION HEADER - SAME AS FARMER DASHBOARD
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   FILTER STATE REDUCER
   ⚠️ "limit" hata diya — backend fixed 50/page deta hai, isko
      override karne ka koi tareeka nahi hai ab.
───────────────────────────────────────────── */
const FILTER_INIT = {
  farmer_name: "",
  state: "",
  district: "",
  village: "",
  project_code: "",
  is_active: "",
  area_ha_min: "",
  area_ha_max: "",
  created_from: "",
  created_to: "",
  sort_by: "created_at",
  sort_dir: "DESC",
  page: 1,
  search: "",
};

function filterReducer(state, action) {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value, page: 1 };
    case "SET_PAGE":
      return { ...state, page: action.value };
    case "SORT":
      return {
        ...state,
        sort_by: action.sort_by,
        sort_dir: action.sort_dir,
        page: 1,
      };
    case "CLEAR":
      return { ...FILTER_INIT };
    default:
      return state;
  }
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function shortId(id) {
  if (!id) return "—";
  const s = String(id);
  return s.length > 12 ? `${s.slice(0, 10)}…` : s;
}

/* ─────────────────────────────────────────────
   MAP SUB-COMPONENTS
───────────────────────────────────────────── */
function FitBounds({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) return;

    try {
      const bounds = window.L.geoJSON(geojson).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    } catch (e) {
      console.error(e);
    }
  }, [geojson, map]);

  return null;
}

function HighlightFeature({ featureId, geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!featureId || !geojson) return;

    try {
      const target = geojson.features.find(
        (f) => f.properties.id === featureId || f.properties.parcel_id === featureId
      );

      if (!target) return;

      const bounds = window.L.geoJSON(target).getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    } catch (e) {
      console.error(e);
    }
  }, [featureId, geojson, map]);

  return null;
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function LpdataVisualization() {
  const navigate = useNavigate();

  const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("lp_jwt");

  const [parcels, setParcels] = useState([]);
  const [pagination, setPagination] = useState(null);
  // ✅ NEW — backend ke `overview` block se aane wale filtered KPI totals
  // (sirf currently-loaded 50 rows se nahi, balki SAARE filtered rows se)
  const [overview, setOverview] = useState(null);
  // ✅ NEW — poore dataset se distinct dropdown values (Project/State/District/Village)
  // current page ke 50 rows se nahi.
  const [filterOptions, setFilterOptions] = useState({
    project_codes: [], states: [], districts: [], villages: [],
  });
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showDetails, setShowDetails] = useState(null);
  const [mapStyle, setMapStyle] = useState("satellite");
  const [activeTab, setActiveTab] = useState("parcels");
  const [filters, dispatch] = useReducer(filterReducer, FILTER_INIT);

  // Search box ka raw text — debounce hone tak isi se input control hota hai
  const [searchInput, setSearchInput] = useState("");

  const geoJsonLayerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  // ✅ NEW — dropdown options ek baar load hote hain (poora dataset se), page
  // ya pagination se independent. Yeh sirf tab refresh hote hain jab token badle.
  useEffect(() => {
    if (!token) return;
    fetchFilterOptions().then(({ options, error: err }) => {
      if (!err) setFilterOptions(options);
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const isInitial = parcels.length === 0;
    if (isInitial) setLoading(true);
    else setFetching(true);

    setError("");

    const serverParams = {
      farmer_name: filters.farmer_name || undefined,
      state: filters.state || undefined,
      district: filters.district || undefined,
      village: filters.village || undefined,
      project_code: filters.project_code || undefined,
      is_active: filters.is_active !== "" ? filters.is_active : undefined,
      area_ha_min: filters.area_ha_min || undefined,
      area_ha_max: filters.area_ha_max || undefined,
      created_from: filters.created_from || undefined,
      created_to: filters.created_to || undefined,
      sort_by: filters.sort_by,
      sort_dir: filters.sort_dir,
      page: filters.page,
      // ✅ search ab server-side jaata hai (farmer_name + parcel_id + plot_num)
      search: filters.search || undefined,
    };

    fetchLandParcels(serverParams).then(({ data, pagination: pg, overview: ov, error: err }) => {
      if (err) {
        setError(err);

        if (err.includes("Session expired") || err.includes("401") || err.includes("403")) {
          localStorage.removeItem("token");
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("lp_jwt");
          navigate("/login");
        }
      } else {
        setParcels(data || []);
        setPagination(pg);
        // ✅ overview backend se seedha aata hai — current filters ke according
        setOverview(normalizeOverview(ov));
      }

      setLoading(false);
      setFetching(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.farmer_name,
    filters.state,
    filters.district,
    filters.village,
    filters.project_code,
    filters.is_active,
    filters.area_ha_min,
    filters.area_ha_max,
    filters.created_from,
    filters.created_to,
    filters.sort_by,
    filters.sort_dir,
    filters.page,
    filters.search,
  ]);

  // ✅ Ab `parcels` already server-filtered (50 rows ka current page) hote
  // hain — koi client-side filterParcels() nahi chalana, woh sirf search
  // box ko backend `search` param ke via already filter kar chuka hai.
  const geojson = useMemo(
    () => parcelsToGeoJSON(parcels),
    [parcels]
  );

  const farmerAggregation = useMemo(
    () => aggregateByFarmer(parcels),
    [parcels]
  );

  const villageAggregation = useMemo(
    () => aggregateByVillage(parcels),
    [parcels]
  );

  const setInstantFilter = useCallback((key, value) => {
    dispatch({ type: "SET", key, value });
  }, []);

  // Search box debounce — typing rukne ke 400ms baad hi server call jaayega
  const handleSearchChange = useCallback((value) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      dispatch({ type: "SET", key: "search", value });
    }, 400);
  }, []);

  const handleSort = useCallback((col) => {
    dispatch({
      type: "SORT",
      sort_by: col,
      sort_dir: filters.sort_by === col && filters.sort_dir === "ASC" ? "DESC" : "ASC",
    });
  }, [filters.sort_by, filters.sort_dir]);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    dispatch({ type: "CLEAR" });
  }, []);

  const handleRowClick = useCallback((parcel) => {
    const id = parcel.id || parcel.parcel_id;
    setSelectedId((prev) => (prev === id ? null : id));
    setShowDetails(null);
  }, []);

  const handleViewDetails = useCallback((parcel, e) => {
    if (e) e.stopPropagation();

    const id = parcel.id || parcel.parcel_id;
    setShowDetails((prev) => (prev?.id === id ? null : parcel));
  }, []);

  const onEachFeature = useCallback((feature, layer) => {
    const p = feature.properties;

    layer.bindPopup(`
      <div class="lp-popup-title">${p.name || "Land Parcel"}</div>
      <div class="lp-popup-row">Plot: <strong>${p.plot_num || "—"}</strong></div>
      <div class="lp-popup-row">Parcel ID: <strong>${shortId(p.id || p.parcel_id)}</strong></div>
      <div class="lp-popup-row">Area: <strong>${fmt(p.area_ha)} ha</strong></div>
      <div class="lp-popup-row">Farmer: <strong>${p.farmer_name || p.owner || "—"}</strong></div>
      <div class="lp-popup-row">Village: <strong>${p.village || "—"}</strong></div>
      <div class="lp-popup-row">District: <strong>${p.district || "—"}</strong></div>
      <div class="lp-popup-row">State: <strong>${p.state || "—"}</strong></div>
      <div class="lp-popup-row">Project: <strong>${p.project_code || "—"}</strong></div>
      <div class="lp-popup-row">Status: <strong>${p.status || "active"}</strong></div>
      ${p.khata_num ? `<div class="lp-popup-row">Khata: <strong>${p.khata_num}</strong></div>` : ""}
    `, { className: "lp-popup" });

    layer.on("click", () => {
      setSelectedId((prev) =>
        prev === (p.id || p.parcel_id) ? null : (p.id || p.parcel_id)
      );
    });
  }, []);

  const hasFilters = Object.keys(FILTER_INIT).some((k) => {
    if (k === "sort_by") return filters[k] !== "created_at";
    if (k === "sort_dir") return filters[k] !== "DESC";
    if (k === "page") return false;
    return filters[k] !== "";
  });

  const sortIcon = (col) => {
    if (filters.sort_by !== col) {
      return <span className="lp-sort-icon">↕</span>;
    }

    return (
      <span className="lp-sort-icon lp-sort-active">
        {filters.sort_dir === "ASC" ? "↑" : "↓"}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="lp-loader">
        <div className="lp-spinner" />
        <p className="lp-loader-text">FETCHING LAND PARCEL DATA...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lp-error-screen">
        <div className="lp-error-box">
          <h2>⚠️ API Error</h2>
          <p>{error}</p>
          <button className="lp-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── KPI cards: hamesha backend ke `overview` se (current filters ke according) ──
  const kpi = overview || {
    totalParcels: 0, totalHectares: 0, totalFarmers: 0,
    totalDistricts: 0, totalProjects: 0,
  };

  return (
    <div className="lp-root">
      <main className="lp-main">

        {/* STATS - SAME UI AS FARMER DASHBOARD */}
        <section className="dash-section">
          <SectionHeader
            icon="📊"
            title="Overview"
            subtitle="Key performance indicators"
          />

          <div className="kpi-grid">
            {[
              {
                label: "Total Parcels",
                value: kpi.totalParcels,
                icon: "🗺️",
                decimals: 0,
                suffix: "",
              },
              {
                label: "Total Area",
                value: Number(kpi.totalHectares || 0),
                icon: "📐",
                decimals: 2,
                suffix: " ha",
              },
              {
                label: "Total Farmers",
                value: kpi.totalFarmers,
                icon: "👨‍🌾",
                decimals: 0,
                suffix: "",
              },
              {
                label: "Districts",
                value: kpi.totalDistricts,
                icon: "📍",
                decimals: 0,
                suffix: "",
              },
              {
                label: "Projects",
                value: kpi.totalProjects,
                icon: "📂",
                decimals: 0,
                suffix: "",
              },
            ].map((s) => (
              <div
                className="kpi-card"
                key={s.label}
                style={{ "--kpi-color": "#2563eb" }}
              >
                <div className="kpi-icon-wrap">{s.icon}</div>

                <div className="kpi-body">
                  <p className="kpi-label">{s.label}</p>
                  <h2 className="kpi-value">
                    <CountUp
                      end={Number(s.value) || 0}
                      duration={2}
                      decimals={s.decimals}
                      separator=","
                    />
                    {s.suffix}
                  </h2>
                </div>

                <div className="kpi-bar" style={{ background: "#2563eb" }} />
              </div>
            ))}
          </div>
        </section>

        {/* FILTERS - SAME UI AS FARMER DASHBOARD */}
        <section className="dash-section">
          <SectionHeader
            icon="🔽"
            title="Filters"
            subtitle="Narrow down land parcel records"
          />

          <div className="filter-panel">
            <div className="filter-group">
              <label className="filter-label">PROJECT</label>
              <select
                className="filter-select"
                value={filters.project_code}
                onChange={(e) => setInstantFilter("project_code", e.target.value)}
              >
                <option value="">All Projects</option>
                {filterOptions.project_codes.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">STATE</label>
              <select
                className="filter-select"
                value={filters.state}
                onChange={(e) => setInstantFilter("state", e.target.value)}
              >
                <option value="">All States</option>
                {filterOptions.states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">DISTRICT</label>
              <select
                className="filter-select"
                value={filters.district}
                onChange={(e) => setInstantFilter("district", e.target.value)}
              >
                <option value="">All Districts</option>
                {filterOptions.districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">VILLAGE</label>
              <select
                className="filter-select"
                value={filters.village}
                onChange={(e) => setInstantFilter("village", e.target.value)}
              >
                <option value="">All Villages</option>
                {filterOptions.villages.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="header-search">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search farmer, ID, plot..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="header-search-input"
              />
            </div>

            <button className="btn-reset" onClick={clearFilters}>
              ↺ Reset All
            </button>
          </div>
        </section>

        {/* MAP STYLE BAR */}
        <div className="lp-map-style-bar">
          <span className="lp-map-style-label">Map:</span>
          {Object.entries(MAP_TILES).map(([key, tile]) => (
            <button
              key={key}
              className={`lp-map-style-btn ${mapStyle === key ? "lp-map-style-active" : ""}`}
              onClick={() => setMapStyle(key)}
            >
              {tile.name}
            </button>
          ))}

          {fetching && <span className="lp-fetching-text">Updating...</span>}
        </div>

        {/* CONTENT GRID */}
        <div className="lp-content-grid">

          {/* TABLE PANEL */}
          <div className="lp-panel lp-panel-table">
            <div className="lp-panel-header">
              <div className="lp-panel-title">
                <span className="lp-panel-dot lp-dot-amber" />
                {activeTab === "parcels" && "Parcel Records"}
                {activeTab === "farmers" && "Farmer Summary"}
                {activeTab === "villages" && "Village Summary"}
              </div>

              <div className="lp-panel-meta">
                {activeTab === "parcels" && "Click row → zoom map · Show Parcel → details"}
              </div>
            </div>

            <div className="lp-table-wrap">

              {activeTab === "parcels" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="lp-th-sort" onClick={() => handleSort("parcel_id")}>
                        Parcel ID {sortIcon("parcel_id")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("project_code")}>
                        Project {sortIcon("project_code")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("area_ha")}>
                        Area (ha) {sortIcon("area_ha")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("farmer_name")}>
                        Farmer {sortIcon("farmer_name")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("village")}>
                        Village {sortIcon("village")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("district")}>
                        District {sortIcon("district")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("state")}>
                        State {sortIcon("state")}
                      </th>
                      <th>Khata</th>
                      <th className="lp-th-sort" onClick={() => handleSort("plot_num")}>
                        Plot {sortIcon("plot_num")}
                      </th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {parcels.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="lp-table-empty">
                          No parcels found
                        </td>
                      </tr>
                    ) : parcels.map((parcel, idx) => {
                      const id = parcel.id || parcel.parcel_id;
                      const selected = id === selectedId;

                      return (
                        <tr
                          key={id ?? idx}
                          className={selected ? "lp-tr-selected" : ""}
                          onClick={() => handleRowClick(parcel)}
                        >
                          <td className="lp-cell-idx">
                            {(filters.page - 1) * PAGE_SIZE + idx + 1}
                          </td>
                          <td className="lp-cell-mono">{shortId(id)}</td>
                          <td className="lp-cell-mono">{parcel.project_code || "—"}</td>
                          <td>{fmt(parcel.area_ha)}</td>
                          <td><strong>{parcel.farmer_name || parcel.owner || "—"}</strong></td>
                          <td>{parcel.village || "—"}</td>
                          <td>{parcel.district || "—"}</td>
                          <td>{parcel.state || "—"}</td>
                          <td className="lp-cell-mono">{parcel.khata_num || "—"}</td>
                          <td className="lp-cell-mono"><strong>{parcel.plot_num || "—"}</strong></td>
                          <td>
                            <button
                              className="lp-row-map-btn"
                              title="Show on map & view details"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(id);
                                handleViewDetails(parcel, e);
                              }}
                            >
                              Show Parcel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {activeTab === "farmers" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Farmer Name</th>
                      <th>State</th>
                      <th>District</th>
                      <th>Village</th>
                      <th>Parcels</th>
                      <th>Area (ha)</th>
                      <th>Filter</th>
                    </tr>
                  </thead>

                  <tbody>
                    {farmerAggregation.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="lp-table-empty">
                          No farmer data
                        </td>
                      </tr>
                    ) : farmerAggregation.map((f, idx) => (
                      <tr key={f.farmer_id || idx}>
                        <td className="lp-cell-idx">{idx + 1}</td>
                        <td>
                          <strong>{f.farmer_name}</strong>
                          <br />
                          <small className="lp-text-muted">{shortId(f.farmer_id)}</small>
                        </td>
                        <td>{f.state || "—"}</td>
                        <td>{f.district || "—"}</td>
                        <td>{f.village || "—"}</td>
                        <td>{f.total_parcels}</td>
                        <td>{fmt(f.total_area_ha)}</td>
                        <td>
                          <button
                            className="lp-row-map-btn"
                            onClick={() => {
                              dispatch({ type: "SET", key: "farmer_name", value: f.farmer_name });
                              setActiveTab("parcels");
                            }}
                          >
                            📋 Parcels
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === "villages" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Village</th>
                      <th>District</th>
                      <th>State</th>
                      <th>Parcels</th>
                      <th>Area (ha)</th>
                      <th>Farmers</th>
                      <th>Filter</th>
                    </tr>
                  </thead>

                  <tbody>
                    {villageAggregation.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="lp-table-empty">
                          No village data
                        </td>
                      </tr>
                    ) : villageAggregation.map((v, idx) => (
                      <tr key={v.village}>
                        <td className="lp-cell-idx">{idx + 1}</td>
                        <td><strong>{v.village}</strong></td>
                        <td>{v.district || "—"}</td>
                        <td>{v.state || "—"}</td>
                        <td>{v.total_parcels}</td>
                        <td>{fmt(v.total_area_ha)}</td>
                        <td>{v.total_farmers}</td>
                        <td>
                          <button
                            className="lp-row-map-btn"
                            onClick={() => {
                              dispatch({ type: "SET", key: "village", value: v.village });
                              setActiveTab("parcels");
                            }}
                          >
                            📋 Parcels
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* PAGINATION — strict 50/page, server-driven */}
            {activeTab === "parcels" && pagination && (
              <div className="lp-pagination">
                <div className="lp-pagination-info">
                  Showing&nbsp;
                  <strong>{(filters.page - 1) * PAGE_SIZE + 1}</strong>
                  &nbsp;–&nbsp;
                  <strong>{Math.min(filters.page * PAGE_SIZE, pagination.total)}</strong>
                  &nbsp;of&nbsp;<strong>{pagination.total}</strong>
                </div>

                <div className="lp-page-controls">
                  <button
                    className="lp-page-btn"
                    disabled={!pagination.has_prev}
                    onClick={() => dispatch({ type: "SET_PAGE", value: 1 })}
                  >
                    «
                  </button>

                  <button
                    className="lp-page-btn"
                    disabled={!pagination.has_prev}
                    onClick={() => dispatch({ type: "SET_PAGE", value: filters.page - 1 })}
                  >
                    ‹
                  </button>

                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    const start = Math.max(
                      1,
                      Math.min(filters.page - 2, pagination.total_pages - 4)
                    );
                    const pg = start + i;

                    return (
                      <button
                        key={pg}
                        className={`lp-page-btn lp-page-num ${filters.page === pg ? "lp-page-current" : ""}`}
                        onClick={() => dispatch({ type: "SET_PAGE", value: pg })}
                      >
                        {pg}
                      </button>
                    );
                  })}

                  <button
                    className="lp-page-btn"
                    disabled={!pagination.has_next}
                    onClick={() => dispatch({ type: "SET_PAGE", value: filters.page + 1 })}
                  >
                    ›
                  </button>

                  <button
                    className="lp-page-btn"
                    disabled={!pagination.has_next}
                    onClick={() => dispatch({ type: "SET_PAGE", value: pagination.total_pages })}
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MAP PANEL */}
          <div className="lp-panel lp-panel-map">
            <div className="lp-panel-header">
              <div className="lp-panel-title">
                <span className="lp-panel-dot lp-dot-accent" />
                Parcel Map — {MAP_TILES[mapStyle].name}
              </div>

              <div className="lp-panel-meta">
                {geojson.features.length} polygons
              </div>
            </div>

            <div className="lp-map-container">
              <MapContainer
                center={[20.5937, 78.9629]}
                zoom={5}
                className="lp-leaflet-map"
              >
                <TileLayer
                  url={MAP_TILES[mapStyle].url}
                  attribution={MAP_TILES[mapStyle].attribution}
                />

                <GeoJSON
                  ref={geoJsonLayerRef}
                  data={geojson}
                  style={(feature) =>
                    feature.properties.id === selectedId ||
                    feature.properties.parcel_id === selectedId
                      ? POLYGON_SELECTED
                      : POLYGON_STYLE
                  }
                  onEachFeature={onEachFeature}
                />

                <FitBounds geojson={geojson} />
                <HighlightFeature featureId={selectedId} geojson={geojson} />
              </MapContainer>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}