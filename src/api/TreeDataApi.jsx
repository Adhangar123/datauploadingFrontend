import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// ✅ Helper — 0 bhi correctly pass hoga
const toNum = (val) =>
  val !== null && val !== undefined && val !== "" ? Number(val) : null;

/* ---------------- UPLOAD TREE DATA ---------------- */
export const uploadTreeData = async (data) => {
  const formattedData = data.map((item) => ({
    parcel_id:        item.parcel_id,
    project_code:     item.project_code    || null,
    species_name:     item.species_name,
    plantation_type:  item.plantation_type || null,
    uploaded_by:      item.uploaded_by     || "system",
    plantation_year:  toNum(item.plantation_year),
    surviving_plants: toNum(item.surviving_plants),
    actual_planted:   toNum(item.actual_planted),
    mortality:        toNum(item.mortality),
    actual_area_ha:   toNum(item.actual_area_ha),
  }));

  const response = await axios.post(
    `${API_BASE_URL}/tree-data`,
    formattedData,
    { headers: getAuthHeaders() }
  );

  return response.data;
};

/* ---------------- UPDATE TREE DATA ---------------- */
export const updateTreeData = async (id, data) => {
  const formattedData = {
    parcel_id:        data.parcel_id       || null,
    project_code:     data.project_code    || null,
    species_name:     data.species_name    || null,
    plantation_type:  data.plantation_type || null,
    uploaded_by:      data.uploaded_by     || null,
    is_active:        data.is_active       ?? null,
    plantation_year:  toNum(data.plantation_year),
    surviving_plants: toNum(data.surviving_plants),
    actual_planted:   toNum(data.actual_planted),
    mortality:        toNum(data.mortality),
    actual_area_ha:   toNum(data.actual_area_ha),
  };

  const response = await axios.put(
    `${API_BASE_URL}/tree-data/${id}`,
    formattedData,
    { headers: getAuthHeaders() }
  );

  return response.data;
};