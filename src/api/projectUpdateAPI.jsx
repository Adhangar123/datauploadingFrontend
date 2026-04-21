// services/projectUpdateAPI.js

const API_BASE =
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1/project-update";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Fetch all projects
export const fetchProjects = async (limit = 100) => {
  try {
    const response = await fetch(`${API_BASE}?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

// Create a new project
export const createProject = async (projectData, userId) => {
  try {
    const payload = {
      ...projectData,
      created_by: userId,
      updated_by: userId,
    };

    const response = await fetch(API_BASE, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    return { ok: response.ok, data };
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// Update an existing project
export const updateProject = async (projectId, projectData, userId) => {
  try {
    const payload = {
      ...projectData,
      updated_by: userId,
    };

    const response = await fetch(`${API_BASE}/${projectId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    return { ok: response.ok, data };
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};