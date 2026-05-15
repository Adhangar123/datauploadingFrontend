import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const uploadFarmerDocsZip = async (zipFile) => {
  const formData = new FormData();
  formData.append("zipFile", zipFile);

  const { data } = await api.post("/api/v1/farmer-docs/zip-upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
};

export default api;
