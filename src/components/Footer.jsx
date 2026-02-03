import React from "react";
import "../style/Footer.css";
import { FaFacebookF, FaTwitter, FaLinkedinIn } from "react-icons/fa";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">

        {/* TOP ROW */}
        <div className="footer-top">

          {/* Logo - Left */}
          <div className="footer-logo">
            <img src="/img/logo.png" alt="FIT Climate Logo" />
          </div>

          {/* About Us - Right */}
          <div className="footer-links">
            <ul>
              <li>About Us</li>
            </ul>
          </div>

        </div>

        {/* COPYRIGHT */}
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} FIT Climate. All Rights Reserved.
        </p>

      </div>
    </footer>
  );
};

export default Footer;
