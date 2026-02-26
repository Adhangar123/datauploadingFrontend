import React, { useState } from "react";
import * as XLSX from "xlsx";
import { kml as kmlToGeoJSON } from "@tmcw/togeojson";
import tokml from "tokml";
import {
  FaFileCsv,
  FaFileExcel,
  FaFileCode,
  FaExchangeAlt,
  FaDownload,
} from "react-icons/fa";
import "../style/Fileconverter.css";

const Fileconverter = () => {
  const [files, setFiles] = useState({
    csv: null,
    xlsx: null,
    kml: null,
    geojson: null,
  });

  const [convertedFiles, setConvertedFiles] = useState({
    csvToXlsx: null,
    xlsxToCsv: null,
    kmlToGeojson: null,
    geojsonToKml: null,
  });

  const [error, setError] = useState("");
  const [activeConverter, setActiveConverter] = useState(null);

  /* ================= Utility ================= */

  const downloadFile = (fileData) => {
    const blob = new Blob([fileData.data], { type: fileData.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileData.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const validateFileExtension = (file, expectedExt) => {
    return file.name.toLowerCase().endsWith(expectedExt);
  };

  const startProcess = (type) => {
    setError("");
    setActiveConverter(type);
  };

  const stopProcess = () => {
    setActiveConverter(null);
  };

  /* ================= CSV → XLSX ================= */

  const handleCsvToXlsx = () => {
    if (!files.csv) return setError("Please select CSV file");
    if (!validateFileExtension(files.csv, ".csv"))
      return setError("Invalid file type. Please upload a CSV file.");

    startProcess("csvToXlsx");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, sheet, "Sheet1");

        const xlsxData = XLSX.write(newWorkbook, {
          bookType: "xlsx",
          type: "array",
        });

        setConvertedFiles((prev) => ({
          ...prev,
          csvToXlsx: {
            data: xlsxData,
            name: files.csv.name.replace(/\.csv$/i, ".xlsx"),
            type:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        }));
      } catch {
        setError("Failed to convert CSV.");
      } finally {
        stopProcess();
      }
    };

    reader.readAsBinaryString(files.csv);
  };

  /* ================= XLSX → CSV ================= */

  const handleXlsxToCsv = () => {
    if (!files.xlsx) return setError("Please select XLSX file");
    if (!validateFileExtension(files.xlsx, ".xlsx"))
      return setError("Invalid file type. Please upload an XLSX file.");

    startProcess("xlsxToCsv");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);

        setConvertedFiles((prev) => ({
          ...prev,
          xlsxToCsv: {
            data: csv,
            name: files.xlsx.name.replace(/\.xlsx$/i, ".csv"),
            type: "text/csv",
          },
        }));
      } catch {
        setError("Failed to convert XLSX.");
      } finally {
        stopProcess();
      }
    };

    reader.readAsBinaryString(files.xlsx);
  };

  /* ================= KML → GeoJSON ================= */

  const handleKmlToGeojson = () => {
    if (!files.kml) return setError("Please select KML file");
    if (!validateFileExtension(files.kml, ".kml"))
      return setError("Invalid file type. Please upload a KML file.");

    startProcess("kmlToGeojson");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(e.target.result, "text/xml");
        const geojson = kmlToGeoJSON(xml);

        setConvertedFiles((prev) => ({
          ...prev,
          kmlToGeojson: {
            data: JSON.stringify(geojson, null, 2),
            name: files.kml.name.replace(/\.kml$/i, ".geojson"),
            type: "application/json",
          },
        }));
      } catch {
        setError("Failed to convert KML.");
      } finally {
        stopProcess();
      }
    };

    reader.readAsText(files.kml);
  };

  /* ================= GeoJSON → KML ================= */

  const handleGeojsonToKml = () => {
    if (!files.geojson) return setError("Please select GeoJSON file");
    if (!validateFileExtension(files.geojson, ".geojson"))
      return setError("Invalid file type. Please upload a GeoJSON file.");

    startProcess("geojsonToKml");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        const kmlData = tokml(geojson);

        setConvertedFiles((prev) => ({
          ...prev,
          geojsonToKml: {
            data: kmlData,
            name: files.geojson.name.replace(/\.geojson$/i, ".kml"),
            type: "application/vnd.google-earth.kml+xml",
          },
        }));
      } catch {
        setError("Failed to convert GeoJSON.");
      } finally {
        stopProcess();
      }
    };

    reader.readAsText(files.geojson);
  };

  return (
    <div className="file-converter-container">
      <h2 className="main-title">
        <FaExchangeAlt /> Universal File Converter
      </h2>

      {error && <div className="error-box">{error}</div>}

      <div className="converter-grid">
        {/* CSV → XLSX */}
        <div className="converter-card">
          <h3><FaFileCsv /> CSV ➝ XLSX</h3>

          <input type="file" accept=".csv"
            onChange={(e) =>
              setFiles({ ...files, csv: e.target.files[0] })
            }
          />

          <button
            className="convert-btn csv-btn"
            onClick={handleCsvToXlsx}
            disabled={activeConverter === "csvToXlsx"}
          >
            {activeConverter === "csvToXlsx"
              ? "Converting..."
              : "Convert"}
          </button>

          {convertedFiles.csvToXlsx && (
            <div className="converted-section">
              <p className="converted-text">
                Converted File: <strong>{convertedFiles.csvToXlsx.name}</strong>
              </p>
              <button
                className="download-btn"
                onClick={() => downloadFile(convertedFiles.csvToXlsx)}
              >
                <FaDownload /> Download File
              </button>
            </div>
          )}
        </div>

        {/* XLSX → CSV */}
        <div className="converter-card">
          <h3><FaFileExcel /> XLSX ➝ CSV</h3>

          <input type="file" accept=".xlsx"
            onChange={(e) =>
              setFiles({ ...files, xlsx: e.target.files[0] })
            }
          />

          <button
            className="convert-btn xlsx-btn"
            onClick={handleXlsxToCsv}
            disabled={activeConverter === "xlsxToCsv"}
          >
            {activeConverter === "xlsxToCsv"
              ? "Converting..."
              : "Convert"}
          </button>

          {convertedFiles.xlsxToCsv && (
            <div className="converted-section">
              <p className="converted-text">
                Converted File: <strong>{convertedFiles.xlsxToCsv.name}</strong>
              </p>
              <button
                className="download-btn"
                onClick={() => downloadFile(convertedFiles.xlsxToCsv)}
              >
                <FaDownload /> Download File
              </button>
            </div>
          )}
        </div>

        {/* KML → GeoJSON */}
        <div className="converter-card">
          <h3><FaFileCode /> KML ➝ GeoJSON</h3>

          <input type="file" accept=".kml"
            onChange={(e) =>
              setFiles({ ...files, kml: e.target.files[0] })
            }
          />

          <button
            className="convert-btn kml-btn"
            onClick={handleKmlToGeojson}
            disabled={activeConverter === "kmlToGeojson"}
          >
            {activeConverter === "kmlToGeojson"
              ? "Converting..."
              : "Convert"}
          </button>

          {convertedFiles.kmlToGeojson && (
            <div className="converted-section">
              <p className="converted-text">
                Converted File: <strong>{convertedFiles.kmlToGeojson.name}</strong>
              </p>
              <button
                className="download-btn"
                onClick={() => downloadFile(convertedFiles.kmlToGeojson)}
              >
                <FaDownload /> Download File
              </button>
            </div>
          )}
        </div>

        {/* GeoJSON → KML */}
        <div className="converter-card">
          <h3><FaFileCode /> GeoJSON ➝ KML</h3>

          <input type="file" accept=".geojson"
            onChange={(e) =>
              setFiles({ ...files, geojson: e.target.files[0] })
            }
          />

          <button
            className="convert-btn geojson-btn"
            onClick={handleGeojsonToKml}
            disabled={activeConverter === "geojsonToKml"}
          >
            {activeConverter === "geojsonToKml"
              ? "Converting..."
              : "Convert"}
          </button>

          {convertedFiles.geojsonToKml && (
            <div className="converted-section">
              <p className="converted-text">
                Converted File: <strong>{convertedFiles.geojsonToKml.name}</strong>
              </p>
              <button
                className="download-btn"
                onClick={() => downloadFile(convertedFiles.geojsonToKml)}
              >
                <FaDownload /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Fileconverter;