import {
  useState, useEffect, useRef, useCallback, useMemo, useReducer,
} from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../style/LpdataVisualization.css";

import {
  fetchLandParcels,
  computeSummary,
  parcelsToGeoJSON,
  filterParcels,
  getUniqueValues,
  getProjects,
  getFarmersList,
  getVillagesList,
  getStatesList,
  getDistrictsList,
  aggregateByFarmer,
  aggregateByVillage,
} from "../api/LandparcelDataApi";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const SORTABLE_COLUMNS = [
  { value: "created_at",  label: "Created Date" },
  { value: "area_ha",     label: "Area (ha)" },
  { value: "farmer_name", label: "Farmer Name" },
  { value: "district",    label: "District" },
  { value: "village",     label: "Village" },
  { value: "state",       label: "State" },
  { value: "plot_num",    label: "Plot No." },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];

const MAP_TILES = {
  satellite: {
    name: "Satellite",
    url:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri",
  },
  dark: {
    name: "Dark",
    url:  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO",
  },
  light: {
    name: "Light",
    url:  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO",
  },
};

const POLYGON_STYLE = {
  color: "#00e5a0", weight: 1.5, opacity: 0.85,
  fillColor: "#00e5a0", fillOpacity: 0.12,
};
const POLYGON_SELECTED = {
  color: "#fbbf24", weight: 3, opacity: 1,
  fillColor: "#fbbf24", fillOpacity: 0.28,
};

/* ─────────────────────────────────────────────
   FILTER STATE REDUCER
───────────────────────────────────────────── */
const FILTER_INIT = {
  // server-side params
  farmer_name: "", state: "", district: "", village: "",
  project_id: "", is_active: "",
  area_ha_min: "", area_ha_max: "",
  created_from: "", created_to: "",
  sort_by: "created_at", sort_dir: "DESC",
  page: 1, limit: 0,
  // client-side instant search
  search: "",
};

function filterReducer(state, action) {
  switch (action.type) {
    case "SET":     return { ...state, [action.key]: action.value, page: 1 };
    case "SET_PAGE":return { ...state, page: action.value };
    case "SET_LIMIT":return { ...state, limit: action.value, page: 1 };
    case "SORT":    return { ...state, sort_by: action.sort_by, sort_dir: action.sort_dir, page: 1 };
    case "CLEAR":   return { ...FILTER_INIT };
    default:        return state;
  }
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
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
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } catch (e) { console.error(e); }
  }, [geojson, map]);
  return null;
}

function HighlightFeature({ featureId, geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!featureId || !geojson) return;
    try {
      const target = geojson.features.find(
        f => f.properties.id === featureId || f.properties.parcel_id === featureId
      );
      if (!target) return;
      const bounds = window.L.geoJSON(target).getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } catch (e) { console.error(e); }
  }, [featureId, geojson, map]);
  return null;
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function LpdataVisualization() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token") ||
                   sessionStorage.getItem("token") ||
                   sessionStorage.getItem("lp_jwt");

  const [parcels,     setParcels]     = useState([]);
  const [pagination,  setPagination]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fetching,    setFetching]    = useState(false); // subtle re-fetch indicator
  const [error,       setError]       = useState("");
  const [selectedId,  setSelectedId]  = useState(null);
  const [mapStyle,    setMapStyle]    = useState("satellite");
  const [activeTab,   setActiveTab]   = useState("parcels");
  const [filters,     dispatch]       = useReducer(filterReducer, FILTER_INIT);

  const geoJsonLayerRef = useRef(null);
  // debounce timer for text inputs
  const debounceRef     = useRef(null);

  /* ─── AUTH CHECK ─── */
  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  /* ─── FETCH (re-runs when server-side params change) ─── */
  useEffect(() => {
    if (!token) return;

    const isInitial = parcels.length === 0;
    if (isInitial) setLoading(true); else setFetching(true);
    setError("");

    // Build server params (exclude client-side 'search')
    const serverParams = {
      farmer_name:  filters.farmer_name  || undefined,
      state:        filters.state        || undefined,
      district:     filters.district     || undefined,
      village:      filters.village      || undefined,
      project_id:   filters.project_id   || undefined,
      is_active:    filters.is_active !== "" ? filters.is_active : undefined,
      area_ha_min:  filters.area_ha_min  || undefined,
      area_ha_max:  filters.area_ha_max  || undefined,
      created_from: filters.created_from || undefined,
      created_to:   filters.created_to   || undefined,
      sort_by:      filters.sort_by,
      sort_dir:     filters.sort_dir,
      page:         filters.page,
      limit:        filters.limit,
    };

    fetchLandParcels(serverParams).then(({ data, pagination: pg, error: err }) => {
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
      }
      setLoading(false);
      setFetching(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.farmer_name, filters.state, filters.district, filters.village,
    filters.project_id, filters.is_active, filters.area_ha_min, filters.area_ha_max,
    filters.created_from, filters.created_to,
    filters.sort_by, filters.sort_dir,
    filters.page, filters.limit,
  ]);

  /* ─── CLIENT-SIDE INSTANT SEARCH (over loaded page) ─── */
  const filteredParcels = useMemo(
    () => filterParcels(parcels, { search: filters.search }),
    [parcels, filters.search]
  );

  const geojson = useMemo(() => parcelsToGeoJSON(filteredParcels), [filteredParcels]);

  /* ─── SUMMARY (over loaded page) ─── */
  const summary = useMemo(() => computeSummary(parcels), [parcels]);

  /* ─── DROPDOWN OPTIONS (from loaded page) ─── */
  const statusOptions   = useMemo(() => getUniqueValues(parcels, "status"),   [parcels]);
  const districtOptions = useMemo(() => getDistrictsList(parcels),             [parcels]);
  const projectOptions  = useMemo(() => getProjects(parcels),                  [parcels]);
  const villagesList    = useMemo(() => getVillagesList(parcels),              [parcels]);
  const statesList      = useMemo(() => getStatesList(parcels),                [parcels]);
  const farmerAggregation = useMemo(() => aggregateByFarmer(parcels),         [parcels]);
  const villageAggregation= useMemo(() => aggregateByVillage(parcels),        [parcels]);

  /* ─── HANDLERS ─── */
  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("lp_jwt");
    navigate("/login");
  }, [navigate]);

  // Debounced text filter setter (waits 400ms before hitting server)
  const setServerFilter = useCallback((key, value) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => dispatch({ type: "SET", key, value }), 400);
  }, []);

  const setInstantFilter = useCallback((key, value) => {
    dispatch({ type: "SET", key, value });
  }, []);

  const handleSort = useCallback((col) => {
    dispatch({
      type: "SORT",
      sort_by:  col,
      sort_dir: filters.sort_by === col && filters.sort_dir === "ASC" ? "DESC" : "ASC",
    });
  }, [filters.sort_by, filters.sort_dir]);

  const clearFilters = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const handleRowClick = useCallback((parcel) => {
    const id = parcel.id || parcel.parcel_id;
    setSelectedId(prev => prev === id ? null : id);
    setShowDetails(null);
  }, []);

  const handleViewDetails = useCallback((parcel, e) => {
    if (e) e.stopPropagation();
    const id = parcel.id || parcel.parcel_id;
    setShowDetails(prev => prev?.id === id ? null : parcel);
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
      <div class="lp-popup-row">Project: <strong>${p.project_id || "—"}</strong></div>
      <div class="lp-popup-row">Status: <strong>${p.status || "active"}</strong></div>
      ${p.khata_num ? `<div class="lp-popup-row">Khata: <strong>${p.khata_num}</strong></div>` : ""}
    `, { className: "lp-popup" });

    layer.on("click", () => {
      setSelectedId(prev =>
        prev === (p.id || p.parcel_id) ? null : (p.id || p.parcel_id)
      );
    });
  }, []);

  const hasFilters = Object.keys(FILTER_INIT).some(k => {
    if (k === "sort_by")  return filters[k] !== "created_at";
    if (k === "sort_dir") return filters[k] !== "DESC";
    if (k === "page")     return false;
    if (k === "limit")    return filters[k] !== 50;
    return filters[k] !== "";
  });

  const sortIcon = (col) => {
    if (filters.sort_by !== col) return <span className="lp-sort-icon">↕</span>;
    return <span className="lp-sort-icon lp-sort-active">{filters.sort_dir === "ASC" ? "↑" : "↓"}</span>;
  };

  /* ─── LOADING ─── */
  if (loading) return (
    <div className="lp-loader">
      <div className="lp-spinner" />
      <p className="lp-loader-text">FETCHING LAND PARCEL DATA...</p>
    </div>
  );

  /* ─── ERROR ─── */
  if (error) return (
    <div className="lp-error-screen">
      <div className="lp-error-box">
        <h2>⚠️ API Error</h2>
        <p>{error}</p>
        <button className="lp-btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  /* ─── RENDER ─── */
  return (
    <div className="lp-root">
      <main className="lp-main">

        {/* STATS */}
        <div className="lp-stats-row">
          {[
            { label: "Total Parcels",  value: pagination?.total ?? summary.totalParcels, unit: "registered parcels" },
            { label: "Total Area",    value: fmt(summary.totalHectares), unit: "hectares" },
            { label: "Total Farmers", value: summary.totalFarmers,   unit: "farmers" },
            // { label: "Villages",       value: summary.totalVillages,  unit: "villages" },
            { label: "All Districts",      value: summary.totalDistricts, unit: "districts" },
          ].map((s, i) => (
            <div key={i} className="lp-stat-card lp-stat-amber">
              <p className="lp-stat-label">{s.label}</p>
              <p className="lp-stat-value">{typeof s.value === "number" ? s.value.toLocaleString("en-IN") : s.value}</p>
              <p className="lp-stat-unit">{s.unit}</p>
            </div>
          ))}
        </div>

        {/* FILTER BAR */}
        <div className="lp-filter-bar">
          {/* Instant search */}
          <input
            className="lp-search-input"
            placeholder="Quick search: name, farmer, ID, plot…"
            defaultValue={filters.search}
            onChange={e => dispatch({ type: "SET", key: "search", value: e.target.value })}
          />

          {/* Server-side filters */}
          <input
            className="lp-filter-input"
            placeholder="Farmer name…"
            defaultValue={filters.farmer_name}
            onChange={e => setServerFilter("farmer_name", e.target.value)}
          />

          <select className="lp-select" value={filters.state}
            onChange={e => setInstantFilter("state", e.target.value)}>
            <option value="">All States</option>
            {statesList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select className="lp-select" value={filters.district}
            onChange={e => setInstantFilter("district", e.target.value)}>
            <option value="">All Districts</option>
            {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select className="lp-select" value={filters.village}
            onChange={e => setInstantFilter("village", e.target.value)}>
            <option value="">All Villages</option>
            {villagesList.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          <select className="lp-select" value={filters.project_id}
            onChange={e => setInstantFilter("project_id", e.target.value)}>
            <option value="">All Projects</option>
            {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {hasFilters && (
            <button className="lp-btn lp-btn-clear" onClick={clearFilters}>✕ Clear All</button>
          )}
        </div>

        {/* MAP STYLE BAR */}
        <div className="lp-map-style-bar">
          <span className="lp-map-style-label">Map:</span>
          {Object.entries(MAP_TILES).map(([key, tile]) => (
            <button key={key}
              className={`lp-map-style-btn ${mapStyle === key ? "lp-map-style-active" : ""}`}
              onClick={() => setMapStyle(key)}>
              {tile.name}
            </button>
          ))}
        </div>

        {/* CONTENT GRID */}
        <div className="lp-content-grid">

          {/* TABLE PANEL — LEFT */}
          <div className="lp-panel lp-panel-table">
            <div className="lp-panel-header">
              <div className="lp-panel-title">
                <span className="lp-panel-dot lp-dot-amber" />
                {activeTab === "parcels"  && "Parcel Records"}
                {activeTab === "farmers"  && "Farmer Summary"}
                {activeTab === "villages" && "Village Summary"}
              </div>
              <div className="lp-panel-meta">
                {activeTab === "parcels" && "Click row → zoom map · 👁 → details"}
              </div>
            </div>

            <div className="lp-table-wrap">

              {/* ── PARCELS TABLE ── */}
              {activeTab === "parcels" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="lp-th-sort" onClick={() => handleSort("parcel_id")}>
                        Parcel ID {sortIcon("parcel_id")}
                      </th>
                      <th className="lp-th-sort" onClick={() => handleSort("project_id")}>
                        Project {sortIcon("project_id")}
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
                    {filteredParcels.length === 0 ? (
                      <tr><td colSpan={11} className="lp-table-empty">No parcels found</td></tr>
                    ) : filteredParcels.map((parcel, idx) => {
                      const id       = parcel.id || parcel.parcel_id;
                      const selected = id === selectedId;
                      return (
                        <tr key={id ?? idx} className={selected ? "lp-tr-selected" : ""}
                          onClick={() => handleRowClick(parcel)}>
                          <td className="lp-cell-idx">{(filters.page - 1) * filters.limit + idx + 1}</td>
                          <td className="lp-cell-mono">{shortId(id)}</td>
                          <td className="lp-cell-mono">{parcel.project_id || "—"}</td>
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
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedId(id);
                                handleViewDetails(parcel, e);
                              }}>
                              Show Parcel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* ── FARMERS TABLE ── */}
              {activeTab === "farmers" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Farmer Name</th><th>State</th>
                      <th>District</th><th>Village</th>
                      <th>Parcels</th><th>Area (ha)</th><th>Filter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {farmerAggregation.length === 0
                      ? <tr><td colSpan={8} className="lp-table-empty">No farmer data</td></tr>
                      : farmerAggregation.map((f, idx) => (
                        <tr key={f.farmer_id || idx}>
                          <td className="lp-cell-idx">{idx + 1}</td>
                          <td>
                            <strong>{f.farmer_name}</strong>
                            <br /><small className="lp-text-muted">{shortId(f.farmer_id)}</small>
                          </td>
                          <td>{f.state || "—"}</td>
                          <td>{f.district || "—"}</td>
                          <td>{f.village || "—"}</td>
                          <td>{f.total_parcels}</td>
                          <td>{fmt(f.total_area_ha)}</td>
                          <td>
                            <button className="lp-row-map-btn"
                              onClick={() => {
                                dispatch({ type: "SET", key: "farmer_name", value: f.farmer_name });
                                setActiveTab("parcels");
                              }}>
                              📋 Parcels
                            </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ── VILLAGES TABLE ── */}
              {activeTab === "villages" && (
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Village</th><th>District</th><th>State</th>
                      <th>Parcels</th><th>Area (ha)</th><th>Farmers</th><th>Filter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {villageAggregation.length === 0
                      ? <tr><td colSpan={8} className="lp-table-empty">No village data</td></tr>
                      : villageAggregation.map((v, idx) => (
                        <tr key={v.village}>
                          <td className="lp-cell-idx">{idx + 1}</td>
                          <td><strong>{v.village}</strong></td>
                          <td>{v.district || "—"}</td>
                          <td>{v.state || "—"}</td>
                          <td>{v.total_parcels}</td>
                          <td>{fmt(v.total_area_ha)}</td>
                          <td>{v.total_farmers}</td>
                          <td>
                            <button className="lp-row-map-btn"
                              onClick={() => {
                                dispatch({ type: "SET", key: "village", value: v.village });
                                setActiveTab("parcels");
                              }}>
                              📋 Parcels
                            </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* PAGINATION (shown only in parcels tab) */}
            {activeTab === "parcels" && pagination && (
              <div className="lp-pagination">
                <div className="lp-pagination-info">
                  Showing&nbsp;
                  <strong>{filters.limit === 0 ? 1 : (filters.page - 1) * filters.limit + 1}</strong>
                  &nbsp;–&nbsp;
                  <strong>{filters.limit === 0 ? pagination.total : Math.min(filters.page * filters.limit, pagination.total)}</strong>
                  &nbsp;of&nbsp;<strong>{pagination.total}</strong>
                </div>

                <div className="lp-page-size">
                  <span>Rows:</span>
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <button key={n}
                      className={`lp-page-size-btn ${filters.limit === n ? "lp-page-size-active" : ""}`}
                      onClick={() => dispatch({ type: "SET_LIMIT", value: n })}>
                      {n}
                    </button>
                  ))}
                  <button
                    className={`lp-page-size-btn ${filters.limit === 0 ? "lp-page-size-active" : ""}`}
                    onClick={() => dispatch({ type: "SET_LIMIT", value: 0 })}>
                    All
                  </button>
                </div>

                <div className="lp-page-controls">
                  <button className="lp-page-btn" disabled={!pagination.has_prev}
                    onClick={() => dispatch({ type: "SET_PAGE", value: 1 })}>«</button>
                  <button className="lp-page-btn" disabled={!pagination.has_prev}
                    onClick={() => dispatch({ type: "SET_PAGE", value: filters.page - 1 })}>‹</button>

                  {/* Page number pills */}
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    const start = Math.max(1, Math.min(filters.page - 2, pagination.total_pages - 4));
                    const pg    = start + i;
                    return (
                      <button key={pg}
                        className={`lp-page-btn lp-page-num ${filters.page === pg ? "lp-page-current" : ""}`}
                        onClick={() => dispatch({ type: "SET_PAGE", value: pg })}>
                        {pg}
                      </button>
                    );
                  })}

                  <button className="lp-page-btn" disabled={!pagination.has_next}
                    onClick={() => dispatch({ type: "SET_PAGE", value: filters.page + 1 })}>›</button>
                  <button className="lp-page-btn" disabled={!pagination.has_next}
                    onClick={() => dispatch({ type: "SET_PAGE", value: pagination.total_pages })}>»</button>
                </div>
              </div>
            )}
          </div>

          {/* MAP PANEL — RIGHT */}
          <div className="lp-panel lp-panel-map">
            <div className="lp-panel-header">
              <div className="lp-panel-title">
                <span className="lp-panel-dot lp-dot-accent" />
                Parcel Map — {MAP_TILES[mapStyle].name}
              </div>
              <div className="lp-panel-meta">{geojson.features.length} polygons</div>
            </div>
            <div className="lp-map-container">
              <MapContainer center={[20.5937, 78.9629]} zoom={5} className="lp-leaflet-map">
                <TileLayer url={MAP_TILES[mapStyle].url} attribution={MAP_TILES[mapStyle].attribution} />
                <GeoJSON
                  ref={geoJsonLayerRef}
                  data={geojson}
                  style={feature =>
                    (feature.properties.id === selectedId || feature.properties.parcel_id === selectedId)
                      ? POLYGON_SELECTED : POLYGON_STYLE
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