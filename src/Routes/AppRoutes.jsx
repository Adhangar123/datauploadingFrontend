// src/Routes/AppRoutes.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "../components/Dashboard";
import Farmerdata from "../pages/Farmerdata";
import Landparceldata from "../pages/Landparceldata";
import ProtectedRoute from "../Auth/ProtectedRoute";
import Help from "../pages/Help";

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/Help" element={<Help />} />


    {/* Protected Routes */}
    <Route element={<ProtectedRoute />}>
      <Route path="/farmer-data" element={<Farmerdata />} />
      <Route path="/land-parcel-data" element={<Landparceldata />} />
    </Route>
  </Routes>
);

export default AppRoutes;
