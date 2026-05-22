import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Login from "../pages/Login";
import "../style/Dashboard.css";

const Dashboard = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [redirectPath, setRedirectPath] = useState("");

  const handleCardClick = (path) => {
    if (isAuthenticated) {
      navigate(path);
    } else {
      setRedirectPath(path);
      setShowLogin(true);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    if (redirectPath) {
      navigate(redirectPath);
      setRedirectPath("");
    }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1>Data Transfer Dashboard</h1>
          <p>Upload, validate, and transfer structured project data</p>
        </div>

        <div className="dashboard-cards">
          <div
            className="dashboard-card farmer"
            onClick={() => handleCardClick("/farmer-data")}
          >
            <div className="card-icon">🌾</div>
            <h2>Farmer Data</h2>
            <p>Upload farmer profiles, validate records, and sync them securely.</p>
          </div>

          <div
            className="dashboard-card land"
            onClick={() => handleCardClick("/land-parcel-data")}
          >
            <div className="card-icon">🌾</div>
            <h2>Land Parcel Data</h2>
            <p>Upload land parcel boundaries, KML/GeoJSON files, and metadata.</p>
          </div>
          <div
            className="dashboard-card land"
            onClick={() => handleCardClick("/tree-data-upload")}
          >
            <div className="card-icon">🌾</div>
            <h2>Tree Data</h2>
            <p> Upload tree plantation data with  CSV file support</p>
          </div>
           <div
            className="dashboard-card cra" 
           onClick={() => handleCardClick("/DocumentUploading")}
          >
            <div className="card-icon">📊</div>
            <h2>Farmer Documents Data</h2>
            <p>
            upload verify Documents  Aadhaar cards, land ownership records, agreements.
            </p>
          </div>
           <div
            className="dashboard-card cra"
            onClick={() => handleCardClick("/visualization")}
          >
            <div className="card-icon">📊</div>
            <h2>Data Visualization</h2>
            <p>View farmer data insights, charts, and analytics dashboards.</p>
          </div>

            <div
              className="dashboard-card cra"
              onClick={() => handleCardClick("/WeeklyUpdate")}
            >
              <div className="card-icon">📊</div>
              <h2>Active Project Status</h2>
              <p>Track and monitor weekly updates of farmer data, including recent changes, additions, and progress insights.</p>
            </div>
        </div>
      </div>

      {showLogin && (
        <Login
          onClose={() => setShowLogin(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
};

export default Dashboard;
