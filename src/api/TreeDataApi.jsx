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

/* ---------------- UPLOAD TREE DATA ---------------- */
export const uploadTreeData = async (data) => {
  const formattedData = data.map((item) => ({
    parcel_id:        item.parcel_id,
    project_code:     item.project_code     || null,
    species_name:     item.species_name,
    plantation_type:  item.plantation_type  || null,
    plantation_year:  item.plantation_year  ? Number(item.plantation_year) : null,
    uploaded_by:      item.uploaded_by      || "system",
    surviving_plants: item.surviving_plants ? Number(item.surviving_plants) : null,
    actual_planted:   item.actual_planted   ? Number(item.actual_planted)   : null,
    mortality:        item.mortality        ? Number(item.mortality)        : null,
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
    parcel_id:        data.parcel_id        || null,
    project_code:     data.project_code     || null,
    species_name:     data.species_name     || null,
    plantation_type:  data.plantation_type  || null,
    plantation_year:  data.plantation_year  ? Number(data.plantation_year)  : null,
    uploaded_by:      data.uploaded_by      || null,
    is_active:        data.is_active        ?? null,
    surviving_plants: data.surviving_plants ? Number(data.surviving_plants) : null,
    actual_planted:   data.actual_planted   ? Number(data.actual_planted)   : null,
    mortality:        data.mortality        ? Number(data.mortality)        : null,
  };

  const response = await axios.put(
    `${API_BASE_URL}/tree-data/${id}`,
    formattedData,
    { headers: getAuthHeaders() }
  );

  return response.data;
};