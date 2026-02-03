import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import "../style/Navbar.css";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="navbar-container">
      {/* Logo (Home Navigation) */}
      <div
        className="navbar-logo"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer" }}
      >
        <img src="/img/logo.png" alt="Logo" />
      </div>

      {/* Buttons */}
      <div className="navbar-actions">
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

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`navbar-button ${isActive("/help") ? "active" : ""}`}
          onClick={() => navigate("/help")}
        >
          Help
        </motion.button>
      </div>
    </header>
  );
};

export default Navbar;
