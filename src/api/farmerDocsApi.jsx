const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";

export const uploadDocumentZip = async (formData) => {
  const token = localStorage.getItem("token");

  return fetch(
    `${API_BASE_URL}/api/v1/farmer-docs/zip-upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );
};