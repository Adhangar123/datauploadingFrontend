import {
  useState, useEffect, useRef, useCallback, useMemo, useReducer,
} from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader, InfoWindow } from "@react-google-maps/api";
import CountUp from "react-countup";
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

// 🔧 GOOGLE MAPS — put your key in .env as VITE_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Standard dark-mode style JSON (Google's own "night mode" palette) — used to
// replicate the old CARTO "dark" tile look since Google has no built-in dark tile.
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a5a" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98d1ca" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

const MAP_STYLES = {
  satellite: { name: "Satellite", mapTypeId: "satellite", styles: [] },
  dark: { name: "Dark", mapTypeId: "roadmap", styles: DARK_MAP_STYLE },
  light: { name: "Light", mapTypeId: "roadmap", styles: [] },
};

// 🔧 FIX — max zoom level the map / tiles are allowed to go to.
const MAX_MAP_ZOOM = 20;

const POLYGON_STYLE = {
  strokeColor: "#00e5a0",
  strokeWeight: 1.5,
  strokeOpacity: 0.85,
  fillColor: "#00e5a0",
  fillOpacity: 0.12,
};

const POLYGON_SELECTED = {
  strokeColor: "#fbbf24",
  strokeWeight: 3,
  strokeOpacity: 1,
  fillColor: "#fbbf24",
  fillOpacity: 0.28,
};

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
const GOOGLE_MAP_LIBRARIES = ["geometry"];

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

function featureId(props) {
  return props.id || props.parcel_id;
}

function popupHtml(p) {
  return `
    <div class="lp-popup-title">${p.name || "Land Parcel"}</div>
    <div class="lp-popup-row">Parcel ID: <strong>${shortId(p.id || p.parcel_id)}</strong></div>
    <div class="lp-popup-row">Area: <strong>${fmt(p.area_ha)} ha</strong></div>
    <div class="lp-popup-row">Farmer: <strong>${p.farmer_name || p.owner || "—"}</strong></div>
    <div class="lp-popup-row">Village: <strong>${p.village || "—"}</strong></div>
    <div class="lp-popup-row">District: <strong>${p.district || "—"}</strong></div>
    <div class="lp-popup-row">State: <strong>${p.state || "—"}</strong></div>
    <div class="lp-popup-row">Project: <strong>${p.project_code || "—"}</strong></div>
    <div class="lp-popup-row">Status: <strong>${p.status || "active"}</strong></div>
    ${p.khata_num ? `<div class="lp-popup-row">Khata: <strong>${p.khata_num}</strong></div>` : ""}
  `;
}

/* ─────────────────────────────────────────────
   GOOGLE MAP PANEL
   Replaces the old <MapContainer>/<TileLayer>/<GeoJSON> (react-leaflet)
   stack with a single Google Map + a google.maps.Data layer holding the
   parcel polygons. FitBounds / HighlightFeature (leaflet helper components)
   are folded into this component as plain effects on the map instance.
───────────────────────────────────────────── */
function GoogleParcelMap({ geojson, dataVersion, selectedId, onFeatureClick, mapStyleKey }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  const mapRef = useRef(null);
  const dataLayerRef = useRef(null);
  const mapStyleKeyRef = useRef(mapStyleKey);
  const [infoWindow, setInfoWindow] = useState(null); // { position, html }
  // 🔧 FIX — becomes true only once the Google map + Data layer actually
  // exist. Parcel data usually finishes fetching BEFORE the Google Maps
  // script/map finishes loading, so the "build polygons" effect below used
  // to run once too early (refs still null, it bailed out) and then never
  // ran again since geojson/dataVersion didn't change afterwards — result:
  // no polygons on first load, and nothing to zoom/click on. Including
  // mapReady in that effect's deps makes it re-run the moment the map
  // becomes available.
  const [mapReady, setMapReady] = useState(false);

  const styleFeature = useCallback(
    (feature) => {
      const id = feature.getProperty("id") || feature.getProperty("parcel_id");
      return id === selectedId ? POLYGON_SELECTED : POLYGON_STYLE;
    },
    [selectedId]
  );

  const onLoad = useCallback((map) => {
    mapRef.current = map;

    // 🔧 FIX — set map type explicitly rather than relying only on the
    // declarative `mapTypeId` prop, which doesn't always take effect on the
    // very first load. This guarantees the map opens in Satellite (or
    // whichever style is currently selected) every time.
    const styleConfig = MAP_STYLES[mapStyleKeyRef.current];
    map.setMapTypeId(styleConfig.mapTypeId);
    map.setOptions({ styles: styleConfig.styles });

    const dataLayer = new window.google.maps.Data({ map });
    dataLayerRef.current = dataLayer;

    dataLayer.addListener("click", (e) => {
      const props = {};
      e.feature.forEachProperty((v, k) => { props[k] = v; });

      setInfoWindow({
        position: { lat: e.latLng.lat(), lng: e.latLng.lng() },
        html: popupHtml(props),
      });

      onFeatureClick(featureId(props));
    });

    // 🔧 FIX — flip mapReady only after refs are actually set, so the build
    // effect below (which depends on mapReady) fires with a usable map.
    setMapReady(true);
  }, [onFeatureClick]);

  const onUnmount = useCallback(() => {
    if (dataLayerRef.current) dataLayerRef.current.setMap(null);
    dataLayerRef.current = null;
    mapRef.current = null;
    setMapReady(false);
  }, []);

  // 🔧 Rebuild the Data layer's features whenever fresh parcel data arrives
  // (mirrors the old `key={dataVersion}` remount trick for react-leaflet's
  // <GeoJSON>, which only ever built its layer once from the initial data).
  useEffect(() => {
    const map = mapRef.current;
    const dataLayer = dataLayerRef.current;
    if (!map || !dataLayer || !window.google) return;

    dataLayer.forEach((f) => dataLayer.remove(f));

    if (geojson?.features?.length) {
      dataLayer.addGeoJson(geojson);
    }

    dataLayer.setStyle(styleFeature);

    // Fit bounds to all currently-loaded parcels — same behaviour as the old
    // FitBounds helper (tight padding, close-in max zoom).
    const bounds = new window.google.maps.LatLngBounds();
    dataLayer.forEach((f) => {
      f.getGeometry().forEachLatLng((latLng) => bounds.extend(latLng));
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 20);
      const listener = window.google.maps.event.addListenerOnce(map, "bounds_changed", () => {
        if (map.getZoom() > 19) map.setZoom(19);
      });
      return () => window.google.maps.event.removeListener(listener);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, dataVersion, mapReady]);

  // Re-apply styling whenever the selected feature changes (no data reload).
  useEffect(() => {
    if (dataLayerRef.current) dataLayerRef.current.setStyle(styleFeature);
  }, [styleFeature]);

  // 🔧 Fly to the selected parcel — same behaviour as the old HighlightFeature
  // helper (close, animated zoom to just that polygon's bounds).
  useEffect(() => {
    const map = mapRef.current;
    const dataLayer = dataLayerRef.current;
    if (!map || !dataLayer || !selectedId || !mapReady || !window.google) return;

    let target = null;
    dataLayer.forEach((f) => {
      const id = f.getProperty("id") || f.getProperty("parcel_id");
      if (id === selectedId) target = f;
    });
    if (!target) return;

    const bounds = new window.google.maps.LatLngBounds();
    target.getGeometry().forEachLatLng((latLng) => bounds.extend(latLng));
    if (bounds.isEmpty()) return;

    // 🔧 FIX — panToBounds only MOVES the map, it never changes zoom level
    // (unlike Leaflet's flyToBounds, which did both). fitBounds adjusts
    // both center AND zoom to fit the target polygon's bounds, so clicking
    // a parcel now actually zooms in close on it, capped by the map's
    // configured maxZoom.
    map.fitBounds(bounds, 40);
    const listener = window.google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      map.setZoom(Math.min(MAX_MAP_ZOOM, Math.max(map.getZoom(), 18)));
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [selectedId, mapReady]);

  const styleConfig = MAP_STYLES[mapStyleKey];

  useEffect(() => {
    mapStyleKeyRef.current = mapStyleKey;
    // 🔧 FIX — explicitly re-apply the map type whenever the user clicks a
    // different style button, instead of relying only on the declarative
    // `mapTypeId` prop below.
    if (mapRef.current) {
      mapRef.current.setMapTypeId(styleConfig.mapTypeId);
      mapRef.current.setOptions({ styles: styleConfig.styles });
    }
  }, [mapStyleKey, styleConfig]);

  if (loadError) {
    return <div className="lp-map-loading">Failed to load Google Maps. Check your API key / network.</div>;
  }

  if (!isLoaded) {
    return <div className="lp-map-loading">Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={INDIA_CENTER}
      zoom={5}
      mapTypeId={styleConfig.mapTypeId}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        styles: styleConfig.styles,
        maxZoom: MAX_MAP_ZOOM,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      {infoWindow && (
        <InfoWindow
          position={infoWindow.position}
          onCloseClick={() => setInfoWindow(null)}
        >
          <div className="lp-popup" dangerouslySetInnerHTML={{ __html: infoWindow.html }} />
        </InfoWindow>
      )}
    </GoogleMap>
  );
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
  // ✅ backend ke `overview` block se aane wale filtered KPI totals
  // (sirf currently-loaded 50 rows se nahi, balki SAARE filtered rows se)
  const [overview, setOverview] = useState(null);
  // ✅ poore dataset se distinct dropdown values (Project/State/District/Village)
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

  // 🔧 bumped every time a fresh server response lands — used to force the
  // Google Data layer to rebuild its features (see GoogleParcelMap effect).
  const [dataVersion, setDataVersion] = useState(0);

  // Search box ka raw text — debounce hone tak isi se input control hota hai
  const [searchInput, setSearchInput] = useState("");

  const debounceRef = useRef(null);

  useEffect(() => {
    if (!token) navigate("/login");
  }, [token, navigate]);

  // ✅ dropdown options ek baar load hote hain (poora dataset se), page
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
        // 🔧 naya data aaya hai, map ka Data layer ko force-rebuild karo
        setDataVersion((v) => v + 1);
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

  // ✅ `parcels` already server-filtered (50 rows ka current page) hote
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

  // 🔧 force a full zoom-in fly-to even when clicking "Show Parcel" on the
  // SAME row twice in a row (selectedId change is required to re-trigger it).
  const zoomToParcel = useCallback((id) => {
    setSelectedId(null);
    requestAnimationFrame(() => setSelectedId(id));
  }, []);

  const onMapFeatureClick = useCallback((id) => {
    zoomToParcel(id);
  }, [zoomToParcel]);

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
          {Object.entries(MAP_STYLES).map(([key, style]) => (
            <button
              key={key}
              className={`lp-map-style-btn ${mapStyle === key ? "lp-map-style-active" : ""}`}
              onClick={() => setMapStyle(key)}
            >
              {style.name}
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
                                zoomToParcel(id);
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
                Parcel Map — {MAP_STYLES[mapStyle].name}
              </div>

              <div className="lp-panel-meta">
                {geojson.features.length} polygons
              </div>
            </div>

            <div className="lp-map-container">
              <GoogleParcelMap
                geojson={geojson}
                dataVersion={dataVersion}
                selectedId={selectedId}
                onFeatureClick={onMapFeatureClick}
                mapStyleKey={mapStyle}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}