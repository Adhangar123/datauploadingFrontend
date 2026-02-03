import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext"; // ✅ AuthContext import
import "../style/Navbar.css";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth(); // ✅ useAuth

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
  logout(); // remove token + update state
  navigate("/"); // ✅ redirect to Dashboard (home)
};

  return (
    <header className="navbar-container">
      {/* Logo */}
      <div className="navbar-logo">
        <img src="/img/logo.png" alt="Logo" />
      </div>

      {/* Buttons */}
      <div className="navbar-actions">
        {/* ✅ Logout Button */}
        {isAuthenticated && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="navbar-button logout"
            onClick={handleLogout}
          >
            Logout
          </motion.button>
        )}

        {/* Help Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`navbar-button ${isActive("/help") ? "active" : ""}`}
          onClick={() => navigate("/Help")}
        >
          Help
        </motion.button>
      </div>
    </header>
  );
};

export default Navbar;
