import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    ...(token && {
      Authorization: `Bearer ${token}`,
    }),
  };
};

/* ---------------- UPLOAD TREE DATA ---------------- */
export const uploadTreeData = async (data) => {
  // Convert date into timestamp (milliseconds)
  const formattedData = data.map((item) => ({
    parcel_id: item.parcel_id,
    project_code: item.project_code || null,
    species_name: item.species_name,
    tree_count: Number(item.tree_count),
    mode_of_data: item.mode_of_data || null,

    // Convert to timestamp like curl example
    plantation_and_monitoring_date:
      item.plantation_and_monitoring_date
        ? new Date(item.plantation_and_monitoring_date).getTime()
        : null,

    uploaded_by: item.uploaded_by || "system",
  }));

  const response = await axios.post(
    `${API_BASE_URL}/tree-data`,
    formattedData,
    {
      headers: getAuthHeaders(),
    }
  );

  return response.data;
};

/* ---------------- UPDATE TREE DATA ---------------- */
export const updateTreeData = async (id, data) => {
  const formattedData = {
    ...data,

    plantation_and_monitoring_date:
      data.plantation_and_monitoring_date
        ? new Date(data.plantation_and_monitoring_date).getTime()
        : null,
  };

  const response = await axios.put(
    `${API_BASE_URL}/tree-data/${id}`,
    formattedData,
    {
      headers: getAuthHeaders(),
    }
  );

  return response.data;
};