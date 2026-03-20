
const API_BASE_URL = "https://datauploadingbackend-13977221722.asia-south2.run.app/api";

// 🔐 Login API
export const loginUser = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: password.trim()
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
};

