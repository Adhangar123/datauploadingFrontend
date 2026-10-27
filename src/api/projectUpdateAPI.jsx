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

// Safe JSON parse: agar server HTML / empty response de to bhi crash nahi hoga
const parseResponse = async (response) => {
  let data;
  try {
    data = await response.json();
  } catch {
    data = { success: false, message: `Unexpected server response (HTTP ${response.status}).` };
  }
  return { ok: response.ok, status: response.status, data };
};

// ─── GET all projects (paginated) ───────────────────────────────────────────
// Backend max limit = 200
export const fetchProjects = async (limit = 200, page = 1) => {
  try {
    const response = await fetch(`${API_BASE}?page=${page}&limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    const { data } = await parseResponse(response);
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

// ─── POST create project ────────────────────────────────────────────────────
// NOTE: created_by / updated_by ab backend token (req.user.id) se leta hai,
// isliye frontend se bhejna band kar diya.
export const createProject = async (projectData) => {
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(projectData),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// ─── PUT update project ─────────────────────────────────────────────────────
export const updateProject = async (projectId, projectData) => {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(projectData),
    });
    return await parseResponse(response);
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// ─── DELETE project (soft by default, hard=true for permanent) ──────────────
export const deleteProject = async (projectId, hard = false) => {
  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(projectId)}?hard=${hard ? "true" : "false"}`,
      {
        method: "DELETE",
        headers: getAuthHeaders(),
      }
    );
    return await parseResponse(response);
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// ─── GET project history ────────────────────────────────────────────────────
export const fetchProjectHistory = async (projectId, page = 1, limit = 50) => {
  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(projectId)}/history?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );
    return await parseResponse(response);
  } catch (error) {
    console.error("Fetch history error:", error);
    throw error;
  }
};