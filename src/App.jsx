// src/App.jsx
import React from "react";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./Routes/AppRoutes";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { AuthProvider } from "./context/AuthContext";
import "./App.css";
import BirdFlock from "./components/BirdFlock";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-layout">
          <BirdFlock />
          <Navbar />
          <main className="page-content">
            <AppRoutes />
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
