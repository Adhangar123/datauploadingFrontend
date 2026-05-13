const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

// 🗺️ Bulk Upload Land Parcel Data
export const uploadLandParcelData = async (parcelRows) => {
  try {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      throw new Error("User not authenticated. Please login again.");
    }

    const response = await fetch(`${API_BASE_URL}/land-parcel/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parcelRows),
    });

    // 👇 handle non-JSON response safely
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid server response");
    }

    // ❌ API error
    if (!response.ok) {
      throw new Error(data.message || "Parcel upload failed");
    }

    // ✅ Success
    return data;

  } catch (error) {
    console.error("❌ Upload Error:", error.message);
    throw error;
  }
};
// LandparcelDataApi.js
// Aligned with updated backend: server-side filtering, sorting, pagination

const BASE_URL =
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

/* ──────────────────────────────────────────────────────────────
   TOKEN HELPERS
────────────────────────────────────────────────────────────── */
export function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("lp_jwt") ||
    ""
  );
}

/* ──────────────────────────────────────────────────────────────
   BUILD QUERY STRING from filter/sort/pagination params
   Matches backend's validateFilters() exactly
────────────────────────────────────────────────────────────── */
export function buildQueryString(params = {}) {
  const q = new URLSearchParams();

  // Identity filters
  if (params.parcel_id)  q.set("parcel_id",  params.parcel_id);
  if (params.project_id) q.set("project_id", params.project_id);
  if (params.farmer_id)  q.set("farmer_id",  params.farmer_id);

  // Multi-value IN filters (comma-separated)
  if (params.project_ids?.length) q.set("project_ids", params.project_ids.join(","));
  if (params.farmer_ids?.length)  q.set("farmer_ids",  params.farmer_ids.join(","));

  // Text / ILIKE filters
  if (params.farmer_name) q.set("farmer_name", params.farmer_name);
  if (params.state)        q.set("state",        params.state);
  if (params.district)     q.set("district",     params.district);
  if (params.village)      q.set("village",      params.village);

  // Boolean
  if (params.is_active !== undefined && params.is_active !== "")
    q.set("is_active", String(params.is_active));

  // Numeric range
  if (params.area_ha_min !== undefined && params.area_ha_min !== "")
    q.set("area_ha_min", params.area_ha_min);
  if (params.area_ha_max !== undefined && params.area_ha_max !== "")
    q.set("area_ha_max", params.area_ha_max);

  // Date ranges
  if (params.created_from) q.set("created_from", params.created_from);
  if (params.created_to)   q.set("created_to",   params.created_to);
  if (params.updated_from) q.set("updated_from", params.updated_from);
  if (params.updated_to)   q.set("updated_to",   params.updated_to);

  // Pagination — limit=0 = fetch ALL (default: no limit)
  q.set("page",  String(params.page  ?? 1));
  q.set("limit", String(params.limit ?? 0));

  // Sorting
  if (params.sort_by)  q.set("sort_by",  params.sort_by);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);

  return q.toString();
}

/* ──────────────────────────────────────────────────────────────
   FETCH LAND PARCELS  (server-side filters + pagination)
────────────────────────────────────────────────────────────── */
export async function fetchLandParcels(params = {}) {
  try {
    const token = getAuthToken();
    if (!token) throw new Error("Authentication token not found");

    const qs  = buildQueryString(params);
    const url = `${BASE_URL}/land-parcel/fetch${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("lp_jwt");
      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok) {
      let errBody = {};
      try { errBody = await response.json(); } catch (_) {}
      throw new Error(errBody.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    console.log("Land Parcel API Response:", json);

    // Backend returns { success, data[], pagination{} }
    let parcels = [];
    if (Array.isArray(json))            parcels = json;
    else if (Array.isArray(json.data))  parcels = json.data;
    else if (Array.isArray(json.parcels)) parcels = json.parcels;
    else if (Array.isArray(json.results)) parcels = json.results;
    else if (json.parcel_id || json.geom) parcels = [json];

    return {
      data:       parcels.map(normalizeParcel),
      pagination: json.pagination ?? null,
      error:      null,
    };
  } catch (err) {
    console.error("[LandparcelDataApi] fetchLandParcels error:", err);
    return { data: [], pagination: null, error: err.message || "Failed to fetch land parcels" };
  }
}

/* ──────────────────────────────────────────────────────────────
   NORMALIZE PARCEL  (flat row — backend already JOINs farmer)
────────────────────────────────────────────────────────────── */
export function normalizeParcel(parcel) {
  let geometry = null;
  if (parcel.geom)       geometry = parcel.geom;
  else if (parcel.geometry) geometry = parcel.geometry;
  else if (parcel.geojson) geometry = parcel.geojson.geometry || parcel.geojson;
  else if (parcel.coordinates && parcel.type)
    geometry = { type: parcel.type, coordinates: parcel.coordinates };

  const areaHa = parseFloat(
    parcel.area_ha ?? parcel.area_hectares ?? parcel.hectares ?? parcel.area ?? 0
  ) || 0;

  // Backend returns flat columns from the JOIN: farmer_name, state, district, village
  return {
    ...parcel,
    id:             parcel.parcel_id || parcel.id || parcel._id,
    parcel_id:      parcel.parcel_id,
    name:           parcel.parcel_name || parcel.name || parcel.title ||
                    `Parcel ${(parcel.parcel_id ?? "").slice(-8) || "Unknown"}`,
    area_hectares:  areaHa,
    area_ha:        areaHa,

    // Farmer info comes flat from JOIN
    farmer_id:      parcel.farmer_id,
    farmer_name:    parcel.farmer_name  || parcel.owner || "—",
    owner:          parcel.farmer_name  || parcel.owner || "—",
    state:          parcel.state        || "—",
    district:       parcel.district     || "—",
    village:        parcel.village      || "—",

    // Aliases for backward compat with existing component
    farmer_state:    parcel.state    || "—",
    farmer_district: parcel.district || "—",
    farmer_village:  parcel.village  || "—",

    project_id: parcel.project_id,
    status:     parcel.is_active === false ? "inactive" : (parcel.status || "active"),
    khata_num:  parcel.khata_num,
    plot_num:   parcel.plot_num,
    is_active:  parcel.is_active,
    created_at: parcel.created_at,
    updated_at: parcel.updated_at,
    created_by: parcel.created_by,
    updated_by: parcel.updated_by,
    geometry,
    _raw: parcel,
  };
}

/* ──────────────────────────────────────────────────────────────
   SUMMARY (client-side from currently loaded page)
────────────────────────────────────────────────────────────── */
export function computeSummary(parcels = []) {
  const totalParcels   = parcels.length;
  const totalHectares  = parcels.reduce((s, p) => s + (parseFloat(p.area_ha) || 0), 0);
  const uniqueFarmers  = new Set(parcels.map(p => p.farmer_id).filter(Boolean));
  const uniqueVillages = new Set(parcels.map(p => p.village).filter(v => v && v !== "—"));
  const uniqueDistricts= new Set(parcels.map(p => p.district).filter(d => d && d !== "—"));
  const uniqueStates   = new Set(parcels.map(p => p.state).filter(s => s && s !== "—"));

  return {
    totalParcels,
    totalHectares,
    totalFarmers:   uniqueFarmers.size,
    totalVillages:  uniqueVillages.size,
    totalDistricts: uniqueDistricts.size,
    totalStates:    uniqueStates.size,
  };
}

/* ──────────────────────────────────────────────────────────────
   CONVERT TO GEOJSON
────────────────────────────────────────────────────────────── */
export function parcelsToGeoJSON(parcels = []) {
  const features = parcels
    .map((p) => {
      const geometry = p.geometry || null;
      if (!geometry?.type || !geometry?.coordinates) return null;

      return {
        type: "Feature",
        geometry,
        properties: {
          id:              p.id || p.parcel_id || null,
          parcel_id:       p.parcel_id,
          name:            p.name || "Unnamed Parcel",
          area_ha:         p.area_ha || 0,
          area_hectares:   p.area_ha || 0,
          owner:           p.owner || "—",
          farmer_id:       p.farmer_id || "—",
          farmer_name:     p.farmer_name || "—",
          state:           p.state || "—",
          district:        p.district || "—",
          village:         p.village || "—",
          farmer_state:    p.state || "—",
          farmer_district: p.district || "—",
          farmer_village:  p.village || "—",
          project_id:      p.project_id || "—",
          status:          p.status || "active",
          khata_num:       p.khata_num,
          plot_num:        p.plot_num,
          is_active:       p.is_active,
        },
      };
    })
    .filter(Boolean);

  return { type: "FeatureCollection", features };
}

/* ──────────────────────────────────────────────────────────────
   CLIENT-SIDE FILTER (for already-loaded data — instant search)
   NOTE: Primary filtering is server-side; this is for instant UX.
────────────────────────────────────────────────────────────── */
export function filterParcels(parcels = [], filters = {}) {
  const {
    search = "", status = "", district = "", projectId = "",
    farmerName = "", village = "", state = "",
  } = filters;

  const q   = search.toLowerCase().trim();
  const fn  = farmerName.toLowerCase().trim();
  const vil = village.toLowerCase().trim();
  const st  = state.toLowerCase().trim();

  return parcels.filter((p) => {
    if (q) {
      const haystack = [p.name, p.owner, p.farmer_name, p.parcel_id,
                        p.plot_num, p.khata_num].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (status    && (p.status    || "").toLowerCase() !== status.toLowerCase())    return false;
    if (district  && (p.district  || "").toLowerCase() !== district.toLowerCase())  return false;
    if (projectId && (p.project_id|| "").toLowerCase() !== projectId.toLowerCase()) return false;
    if (fn        && !(p.farmer_name || p.owner || "").toLowerCase().includes(fn))  return false;
    if (vil       && !(p.village  || "").toLowerCase().includes(vil))               return false;
    if (st        && (p.state     || "").toLowerCase() !== st)                      return false;
    return true;
  });
}

/* ──────────────────────────────────────────────────────────────
   HELPERS — unique value lists
────────────────────────────────────────────────────────────── */
export function getUniqueValues(parcels = [], fieldKey) {
  return [...new Set(parcels.map(p => p[fieldKey]).filter(Boolean))].sort();
}

export function getProjects(parcels = []) {
  return [...new Set(parcels.map(p => p.project_id).filter(Boolean))].sort();
}

export function getFarmersList(parcels = []) {
  const map = new Map();
  parcels.forEach(p => {
    const id = p.farmer_id;
    if (!id) return;
    if (!map.has(id)) map.set(id, { id, name: p.farmer_name || p.owner || "—",
      state: p.state || "—", district: p.district || "—", village: p.village || "—",
      parcelCount: 0, totalArea: 0 });
    const f = map.get(id);
    f.parcelCount++;
    f.totalArea += p.area_ha || 0;
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getVillagesList(parcels = []) {
  return [...new Set(parcels.map(p => p.village).filter(v => v && v !== "—"))].sort();
}

export function getStatesList(parcels = []) {
  return [...new Set(parcels.map(p => p.state).filter(s => s && s !== "—"))].sort();
}

export function getDistrictsList(parcels = []) {
  return [...new Set(parcels.map(p => p.district).filter(d => d && d !== "—"))].sort();
}

/* ──────────────────────────────────────────────────────────────
   AGGREGATIONS
────────────────────────────────────────────────────────────── */
export function aggregateByFarmer(parcels = []) {
  const map = new Map();
  parcels.forEach(p => {
    const key = p.farmer_id || p.owner;
    if (!key || key === "—") return;
    if (!map.has(key)) map.set(key, {
      farmer_id: p.farmer_id, farmer_name: p.farmer_name || p.owner,
      state: p.state, district: p.district, village: p.village,
      total_parcels: 0, total_area_ha: 0,
    });
    const f = map.get(key);
    f.total_parcels++;
    f.total_area_ha += p.area_ha || 0;
  });
  return [...map.values()];
}

export function aggregateByVillage(parcels = []) {
  const map = new Map();
  parcels.forEach(p => {
    const v = p.village;
    if (!v || v === "—") return;
    if (!map.has(v)) map.set(v, {
      village: v, district: p.district, state: p.state,
      total_parcels: 0, total_area_ha: 0, farmers: new Set(),
    });
    const vd = map.get(v);
    vd.total_parcels++;
    vd.total_area_ha += p.area_ha || 0;
    if (p.farmer_id) vd.farmers.add(p.farmer_id);
  });
  return [...map.values()].map(v => ({
    ...v, total_farmers: v.farmers.size, farmers: undefined,
  }));
}