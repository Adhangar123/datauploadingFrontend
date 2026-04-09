const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1";

// 🔐 Login API
export const loginUser = async (email, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email?.trim().toLowerCase(),
        password: password?.trim()
      })
    });

    // ✅ Safe JSON parse (avoid crash)
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error("Invalid server response");
    }


    if (!response.ok) {
      throw new Error(data?.message || "Invalid credentials");
    }

    // ✅ Save token if exists
    if (data?.token) {
      localStorage.setItem("token", data.token);
    }

    return data;

  } catch (error) {
    console.error("Login API Error:", error.message);
    throw error;
  }
};



// 🚪 Logout API
export const logoutUser = async () => {
  try {
    const token = localStorage.getItem("token");

    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    let data = {};
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(data?.message || "Logout failed");
    }

    // ✅ Remove token
    localStorage.removeItem("token");

    return data;

  } catch (error) {
    console.error("Logout Error:", error.message);
    throw error;
  }
};



// 🟢 Auth Status Check
export const checkAuthStatus = async () => {
  try {
    const token = localStorage.getItem("token");

    const response = await fetch(`${API_BASE_URL}/auth/status`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    let data = {};
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(data?.message || "Status check failed");
    }

    return data;

  } catch (error) {
    console.error("Auth Status Error:", error.message);
    throw error;
  }
};