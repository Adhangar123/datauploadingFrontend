
const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api";

// 🗺️ Bulk Upload Land Parcel Data
export const uploadLandParcelData = async (parcelRows) => {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE_URL}/land-parcel/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(parcelRows),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Parcel upload failed");
  }

  return data;
};

