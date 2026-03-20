
const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api";

// 🌾 Upload Farmer Data (Bulk)
export const uploadFarmerData = async (farmerRows) => {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE_URL}/farmerdata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(farmerRows),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Database error occurred");
  }

  return data;
};

