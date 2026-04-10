const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

// 🗺️ Bulk Upload Land Parcel Data
export const uploadLandParcelData = async (parcelRows) => {
  try {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      throw new Error("User not authenticated. Please login again.");
    }

    const response = await fetch(`${API_BASE_URL}/land-parcel/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parcelRows),
    });

    // 👇 handle non-JSON response safely
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid server response");
    }

    // ❌ API error
    if (!response.ok) {
      throw new Error(data.message || "Parcel upload failed");
    }

    // ✅ Success
    return data;

  } catch (error) {
    console.error("❌ Upload Error:", error.message);
    throw error;
  }
};