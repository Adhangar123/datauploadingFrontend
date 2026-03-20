
import React, { useState } from "react";
import "../style/Login.css";
import { useAuth } from "../context/AuthContext";
import { loginUser } from "../api/AuthApi";

export default function Login({ onClose, onLoginSuccess }) {
  const { refreshAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await loginUser(email, password);

      // ✅ Save JWT Token
      localStorage.setItem("auth_token", data.token);

      // ✅ Refresh Auth Context
      refreshAuth();

      onLoginSuccess?.();
      onClose?.();

    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-card" onClick={(e) => e.stopPropagation()}>
        <div className="login-header">
          <img src="/img/logo.png" alt="Logo" />
        </div>

        <h2>Welcome</h2>
        <p className="login-subtitle">Login to continue to your dashboard</p>

        <div className="input-wrapper">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="input-wrapper">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide" : "Show"}
          </span>
        </div>

        {error && <p className="login-error">{error}</p>}

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {onClose && (
          <p className="login-cancel" onClick={onClose}>
            Cancel
          </p>
        )}
      </div>
    </div>
  );
}

