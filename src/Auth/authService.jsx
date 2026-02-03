// src/Auth/authService.js
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// Store token and optional user info
export const setAuthData = (token, user = {}) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// Get stored JWT token
export const getToken = () => localStorage.getItem(TOKEN_KEY);

// Get stored user
export const getUser = () => {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
};

// Check if token exists and valid (with expiration)
export const isAuthenticated = () => {
  const token = getToken();
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() > payload.exp * 1000) {
      logout();
      return false;
    }
    return true;
  } catch {
    logout();
    return false;
  }
};

// Logout
export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("redirectAfterLogin");
};
