import React, { useState } from "react";
import * as XLSX from "xlsx";
import { kml as kmlToGeoJSON } from "@tmcw/togeojson";
import tokml from "tokml";
import { FaFileCsv, FaFileExcel, FaFileCode, FaExchangeAlt } from "react-icons/fa";
import "../style/Fileconverter.css";

const Fileconverter = () => {

  const [files, setFiles] = useState({
    csv: null,
    xlsx: null,
    kml: null,
    geojson: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ================= Utility ================= */

  const downloadFile = (data, fileName, type) => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const validateFileExtension = (file, expectedExt) => {
    return file.name.toLowerCase().endsWith(expectedExt);
  };

  const startProcess = () => {
    setError("");
    setLoading(true);
  };

  const stopProcess = () => {
    setLoading(false);
  };

  /* ================= CSV → XLSX ================= */

  const handleCsvToXlsx = () => {
    if (!files.csv) return setError("Please select CSV file");
    if (!validateFileExtension(files.csv, ".csv"))
      return setError("Invalid file type. Please upload a CSV file.");

    startProcess();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });

        if (!workbook.SheetNames.length)
          throw new Error("CSV file is empty or invalid.");

        const newWorkbook = XLSX.utils.book_new();
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        XLSX.utils.book_append_sheet(newWorkbook, sheet, "Sheet1");

        const xlsxData = XLSX.write(newWorkbook, {
          bookType: "xlsx",
          type: "array",
        });

        downloadFile(
          xlsxData,
          files.csv.name.replace(/\.csv$/i, ".xlsx"),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

      } catch (err) {
        setError("Failed to convert CSV. File might be corrupted.");
      } finally {
        stopProcess();
      }
    };

    reader.onerror = () => {
      setError("Error reading CSV file.");
      stopProcess();
    };

    reader.readAsBinaryString(files.csv);
  };

  /* ================= XLSX → CSV ================= */

  const handleXlsxToCsv = () => {
    if (!files.xlsx) return setError("Please select XLSX file");
    if (!validateFileExtension(files.xlsx, ".xlsx"))
      return setError("Invalid file type. Please upload a XLSX file.");

    startProcess();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });

        if (!workbook.SheetNames.length)
          throw new Error("XLSX file is empty or invalid.");

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);

        if (!csv) throw new Error("Conversion failed.");

        downloadFile(csv, files.xlsx.name.replace(/\.xlsx$/i, ".csv"), "text/csv");

      } catch (err) {
        setError("Failed to convert XLSX. File might be corrupted.");
      } finally {
        stopProcess();
      }
    };

    reader.onerror = () => {
      setError("Error reading XLSX file.");
      stopProcess();
    };

    reader.readAsBinaryString(files.xlsx);
  };

  /* ================= KML → GeoJSON ================= */

  const handleKmlToGeojson = () => {
    if (!files.kml) return setError("Please select KML file");
    if (!validateFileExtension(files.kml, ".kml"))
      return setError("Invalid file type. Please upload a KML file.");

    startProcess();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(e.target.result, "text/xml");

        if (xml.getElementsByTagName("parsererror").length)
          throw new Error("Invalid KML format.");

        const geojson = kmlToGeoJSON(xml);

        if (!geojson.features || !geojson.features.length)
          throw new Error("No valid data found in KML.");

        downloadFile(
          JSON.stringify(geojson, null, 2),
          files.kml.name.replace(/\.kml$/i, ".geojson"),
          "application/json"
        );

      } catch (err) {
        setError("Failed to convert KML. File might be corrupted.");
      } finally {
        stopProcess();
      }
    };

    reader.onerror = () => {
      setError("Error reading KML file.");
      stopProcess();
    };

    reader.readAsText(files.kml);
  };

  /* ================= GeoJSON → KML ================= */

  const handleGeojsonToKml = () => {
    if (!files.geojson) return setError("Please select GeoJSON file");
    if (!validateFileExtension(files.geojson, ".geojson"))
      return setError("Invalid file type. Please upload a GeoJSON file.");

    startProcess();

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);

        if (!geojson.type || !geojson.features)
          throw new Error("Invalid GeoJSON structure.");

        const kmlData = tokml(geojson);

        downloadFile(
          kmlData,
          files.geojson.name.replace(/\.geojson$/i, ".kml"),
          "application/vnd.google-earth.kml+xml"
        );

      } catch (err) {
        setError("Failed to convert GeoJSON. Invalid JSON or corrupted file.");
      } finally {
        stopProcess();
      }
    };

    reader.onerror = () => {
      setError("Error reading GeoJSON file.");
      stopProcess();
    };

    reader.readAsText(files.geojson);
  };

  return (
    <div className="file-converter-container">
      <h2 className="main-title">
        <FaExchangeAlt /> Universal File Converter
      </h2>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="loading-box">Processing... Please wait ⏳</div>}

      <div className="converter-grid">

        <div className="converter-card">
          <h3><FaFileCsv /> CSV ➝ XLSX</h3>
          <input type="file" accept=".csv"
            onChange={(e) => setFiles({ ...files, csv: e.target.files[0] })}
          />
          <button disabled={loading} className="convert-btn csv-btn" onClick={handleCsvToXlsx}>
            {loading ? "Converting..." : "Convert"}
          </button>
        </div>

        <div className="converter-card">
          <h3><FaFileExcel /> XLSX ➝ CSV</h3>
          <input type="file" accept=".xlsx"
            onChange={(e) => setFiles({ ...files, xlsx: e.target.files[0] })}
          />
          <button disabled={loading} className="convert-btn xlsx-btn" onClick={handleXlsxToCsv}>
            {loading ? "Converting..." : "Convert"}
          </button>
        </div>

        <div className="converter-card">
          <h3><FaFileCode /> KML ➝ GeoJSON</h3>
          <input type="file" accept=".kml"
            onChange={(e) => setFiles({ ...files, kml: e.target.files[0] })}
          />
          <button disabled={loading} className="convert-btn kml-btn" onClick={handleKmlToGeojson}>
            {loading ? "Converting..." : "Convert"}
          </button>
        </div>

        <div className="converter-card">
          <h3><FaFileCode /> GeoJSON ➝ KML</h3>
          <input type="file" accept=".geojson"
            onChange={(e) => setFiles({ ...files, geojson: e.target.files[0] })}
          />
          <button disabled={loading} className="convert-btn geojson-btn" onClick={handleGeojsonToKml}>
            {loading ? "Converting..." : "Convert"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Fileconverter;