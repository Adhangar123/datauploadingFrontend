import React from "react";
import "../style/Footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} FIT Climate. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
