// farmerApi.js — All API calls for Farmer Dashboard

import axios from "axios";

// ─── Base URLs ────────────────────────────────────────────────────────────────

const BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

// ─── Axios Instance with Auth Token Interceptor ───────────────────────────────

const apiClient = axios.create({
  baseURL: BASE_URL,
});

// Attach token automatically to every request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token"); // change key if different
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally — redirect to login if token expired
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login"; // change to your login route
    }
    return Promise.reject(error);
  }
);

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Fetch all farmer data
 * @param {number} limit - max records to fetch
 * @returns {Promise<Array>} - array of farmer objects
 */
export const fetchFarmers = async (limit = 5000) => {
  const res = await apiClient.get(`/farmerdata?limit=${limit}`);
  return res.data.data;
};

/**
 * Update a farmer record by ID
 * @param {string|number} farmerId - farmer's unique ID
 * @param {Object} updatedData - fields to update
 * @returns {Promise<Object>} - updated farmer object
 */
export const updateFarmer = async (farmerId, updatedData) => {
  const res = await apiClient.put(`/farmerdata/update/${farmerId}`, updatedData);
  return res.data;
};

export default apiClient;