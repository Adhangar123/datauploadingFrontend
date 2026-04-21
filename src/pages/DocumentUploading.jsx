import React, { useState, useRef } from "react";
import Papa from "papaparse";
import axios from "axios";
import "../style/KmlTodatabase.css";

const REQUIRED_HEADERS = [
  "farmer_id",
  "aadhar",
  "agreement_letter",
  "farmer_photo",
];

const DocumentUploading = () => {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [correctedRows, setCorrectedRows] = useState([]);
  const [incorrectRows, setIncorrectRows] = useState([]);
  const [message, setMessage] = useState("");
  const [dbError, setDbError] = useState("");
  const [uploading, setUploading] = useState(false);

  // 👉 ALL FILES (folder se)
  const [allFiles, setAllFiles] = useState([]);

  const fileInputRef = useRef();

  // 📂 CSV + Folder Upload (SINGLE INPUT)
  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files);

    const csvFile = files.find((f) => f.name.endsWith(".csv"));

    if (!csvFile) {
      alert("❌ CSV file not found in selected folder");
      return;
    }

    setFile(csvFile);

    // CSV ke alawa sab files store karo
    setAllFiles(files.filter((f) => !f.name.endsWith(".csv")));
  };

  // 🧠 Sanitize
  const sanitizeRow = (row) => ({
    farmer_id: String(row.farmer_id || "").trim(),
    aadhar: row.aadhar?.trim(),
    agreement_letter: row.agreement_letter?.trim(),
    farmer_photo: row.farmer_photo?.trim(),
  });

  // 🧠 Validate
  const validateRow = (row, existingIds) => {
    let errors = [];

    if (!row.farmer_id) errors.push("farmer_id missing");
    if (!row.aadhar) errors.push("aadhar missing");
    if (!row.agreement_letter) errors.push("agreement missing");
    if (!row.farmer_photo) errors.push("photo missing");

    if (existingIds.includes(row.farmer_id)) {
      errors.push("Duplicate farmer_id");
    }

    return { isValid: errors.length === 0, errors };
  };

  // 📊 Read CSV
  const handleReadFile = () => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data;

        if (!data.length) return;

        setColumns(Object.keys(data[0]));

        let valid = [];
        let invalid = [];

        data.forEach((row) => {
          const clean = sanitizeRow(row);

          const check = validateRow(
            clean,
            valid.map((r) => r.farmer_id)
          );

          if (check.isValid) {
            valid.push(clean);
          } else {
            invalid.push({ ...clean, __errors: check.errors });
          }
        });

        setCorrectedRows(valid);
        setIncorrectRows(invalid);
      },
    });
  };

  // 🚀 SEND TO DB
  const handleSendToDB = async () => {
    try {
      setUploading(true);
      setMessage("");
      setDbError("");

      const formData = new FormData();

      correctedRows.forEach((row, index) => {
        formData.append(`records[${index}][farmer_id]`, row.farmer_id);

        // ✅ Exact match from folder files
        const aadharFile = allFiles.find((f) => f.name === row.aadhar);
        const agreementFile = allFiles.find(
          (f) => f.name === row.agreement_letter
        );
        const photoFile = allFiles.find(
          (f) => f.name === row.farmer_photo
        );

        if (!aadharFile || !agreementFile || !photoFile) {
          throw new Error(
            `Missing file for farmer_id ${row.farmer_id}`
          );
        }

        formData.append(`records[${index}][aadhar]`, aadharFile);
        formData.append(
          `records[${index}][agreement_letter]`,
          agreementFile
        );
        formData.append(
          `records[${index}][farmer_photo]`,
          photoFile
        );
      });

      const token = localStorage.getItem("token");

      await axios.post(
        "http://localhost:5000/api/upload-documents",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage("✅ Upload successful 🚀");
    } catch (err) {
      console.error(err);
      setDbError(err.message || "❌ Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setColumns([]);
    setCorrectedRows([]);
    setIncorrectRows([]);
    setAllFiles([]);
    fileInputRef.current.value = "";
  };

  return (
    <div className="kml-upload-container">
      <h2>Document Upload</h2>

      {/* ✅ SINGLE INPUT (CSV + FOLDER) */}
      <input
        type="file"
        webkitdirectory="true"
        multiple
        onChange={handleFolderUpload}
        ref={fileInputRef}
      />

      <button onClick={handleReadFile} disabled={!file}>
        1️⃣ Read & Validate
      </button>

      <button onClick={handleReset}>🔄 Reset</button>

      <div className="stack-container">

        {/* ✅ VALID */}
        <div className="box green">
          <h3>✅ Valid Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      {REQUIRED_HEADERS.includes(c) ? `${c} *` : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correctedRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{row[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="send-db-btn"
            onClick={handleSendToDB}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "2️⃣ Send to Database"}
          </button>

          <p>{message}</p>
          {dbError && <p style={{ color: "red" }}>{dbError}</p>}
        </div>

        {/* ❌ INVALID */}
        <div className="box red">
          <h3>❌ Incorrect Data</h3>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incorrectRows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        <input
                          value={row[c] ?? ""}
                          onChange={(e) => {
                            const updated = [...incorrectRows];
                            updated[i][c] = e.target.value;
                            setIncorrectRows(updated);
                          }}
                        />
                      </td>
                    ))}
                    <td style={{ color: "red" }}>
                      {row.__errors?.join(", ")}
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          const cleaned = sanitizeRow(row);
                          const check = validateRow(
                            cleaned,
                            correctedRows.map((r) => r.farmer_id)
                          );

                          if (!check.isValid) {
                            alert(check.errors.join("\n"));
                            return;
                          }

                          setCorrectedRows([...correctedRows, cleaned]);
                          setIncorrectRows(
                            incorrectRows.filter((_, idx) => idx !== i)
                          );
                        }}
                      >
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DocumentUploading;