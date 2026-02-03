// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { isAuthenticated, logout as serviceLogout, getToken } from "../Auth/authService";

const AuthContext = createContext({
  isAuthenticated: false,
  loading: true,
  refreshAuth: () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }) => {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  // ✅ Refresh auth state (token + expiration check)
  const refreshAuth = useCallback(() => {
    const valid = isAuthenticated();
    setIsAuth(valid);
    setLoading(false);
    return valid;
  }, []);

  // ✅ Logout
  const logout = useCallback(() => {
    serviceLogout();
    setIsAuth(false);
    setLoading(false);
  }, []);

  // Sync across tabs + initial check
  useEffect(() => {
    refreshAuth();
    const handleStorage = (e) => {
      if (e.key === "auth_token") refreshAuth();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ isAuthenticated: isAuth, loading, refreshAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
