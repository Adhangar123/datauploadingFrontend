import React from "react";
import "../style/Help.css";

const Help = () => {
  return (
    <div className="help-container">
      <h2>📄 Help & Instructions</h2>

      <section className="help-section">
        <h3>1️⃣ Supported File </h3>
        <p>
          You can upload files in <strong>CSV</strong> or <strong>KML</strong> format.
        </p>
      </section>

      <section className="help-section">
        <h3>2️⃣ Required Fields</h3>
        <p>The uploaded data must include the following fields:</p>
        <ul>
          <li><strong>project_id</strong> - Unique project identifier</li>
          <li><strong>parcel_id</strong> - Land parcel ID</li>
          <li><strong>farmer_id</strong> - Unique farmer ID</li>
          <li><strong>onboarding_date</strong> - Date of onboarding (YYYY-MM-DD)</li>
          <li><strong>area_ha</strong> - Land area in hectares (numeric)</li>
          <li><strong>farmer_name</strong> - Full name of the farmer</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>3️⃣ Validation Rules</h3>
        <ul>
          <li>All required fields must be filled.</li>
          <li><strong>area_ha</strong> must be a positive number.</li>
          <li>Dates must be in valid format (YYYY-MM-DD).</li>
          <li>Extra fields not listed above will be ignored.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>4️⃣ How to Correct Errors</h3>
        <p>
          After uploading, invalid rows will appear in the <strong>Incorrect Data</strong> table. 
          You can edit fields directly in the table and click <strong>Approve</strong> to validate.
        </p>
      </section>

      <section className="help-section">
        <h3>5️⃣ Upload Process</h3>
        <ol>
          <li>Select your CSV or KML file.</li>
          <li>Click <strong>"Read & Validate File"</strong> to check for errors.</li>
          <li>Correct any invalid rows and approve them.</li>
          <li>Click <strong>"Send to Database"</strong> to upload valid data to the server.</li>
        </ol>
      </section>

      <section className="help-section">
        <h3>6️⃣ Notes</h3>
        <ul>
          <li>KML files must have properties mapped to backend fields: <strong>project_id, parcel_id, farmer_id, onboarding_date, area_ha, farmer_name</strong>.</li>
          <li>CSV files can have extra columns, but only the allowed fields will be used.</li>
        </ul>
      </section>
    </div>
  );
};

export default Help;
