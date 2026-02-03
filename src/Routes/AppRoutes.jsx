// src/Routes/AppRoutes.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "../components/Dashboard";
import Farmerdata from "../pages/Farmerdata";
import Landparceldata from "../pages/Landparceldata";
import ProtectedRoute from "../Auth/ProtectedRoute";

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Dashboard />} />

    {/* Protected Routes */}
    <Route element={<ProtectedRoute />}>
      <Route path="/farmer-data" element={<Farmerdata />} />
      <Route path="/land-parcel-data" element={<Landparceldata />} />
    </Route>
  </Routes>
);

export default AppRoutes;
