import React, { useState, useMemo } from "react";

const API_URL =
  "https://datauploadingbackend-13977221722.asia-south2.run.app/api/v1/getold-data";

const PROJECT_CODE_MAP = {
  "nbs-001": "FCF047",
  "nbs-002": "FCF011",
  "nbs-003": "FCF048",
  "nbs-005": "FCF049",
  "nbs-006": "FCF050",
  "nbs-007": "FCF053",
  "nbs-008": "FCF057",
  "nbs-009": "FCF053",
};

const OldLandparcel = () => {
  const [loading, setLoading] = useState(false);
  const [parcelData, setParcelData] = useState([]);

  const replaceProjectCode = (value) => {
    if (!value) return "";
    const key = String(value).toLowerCase().trim();
    return PROJECT_CODE_MAP[key] || value;
  };

  const fetchParcelData = async () => {
    try {
      setLoading(true);

      const token = localStorage.getItem("token");

      const response = await fetch(API_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      console.log("API Response:", result);

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch data");
      }

      setParcelData(result.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to fetch parcel data");
    } finally {
      setLoading(false);
    }
  };

  // Group all fetched rows by their FINAL (mapped) project code.
  // Recalculates only when parcelData changes.
  const groupedByProjectCode = useMemo(() => {
    const groups = {};

    parcelData.forEach((item) => {
      const code = replaceProjectCode(item.proejct_id) || "UNKNOWN";

      if (!groups[code]) {
        groups[code] = [];
      }
      groups[code].push(item);
    });

    return groups;
  }, [parcelData]);

  const projectCodes = Object.keys(groupedByProjectCode).sort();

  // Builds KML text for a single group of features.
  // (Same logic as before, just reused per-group instead of for the whole dataset.)
  const convertGeoJSONToKML = (features) => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Old Land Parcels</name>

<Schema name="ParcelSchema" id="ParcelSchema">
  <SimpleField name="parcel_id" type="string"></SimpleField>
  <SimpleField name="farmer_id" type="string"></SimpleField>
  <SimpleField name="area_ha" type="string"></SimpleField>
  <SimpleField name="proejct_id" type="string"></SimpleField>
  <SimpleField name="geom" type="string"></SimpleField>
</Schema>
`;

    features.forEach((item) => {
      const geom = item.geom;

      if (!geom) return;

      const projectCode = replaceProjectCode(item.proejct_id);
      const geomType = geom.type || "";

      const extendedData = `
<ExtendedData>
  <SchemaData schemaUrl="#ParcelSchema">
    <SimpleData name="parcel_id">${item.parcel_id || ""}</SimpleData>
    <SimpleData name="farmer_id">${item.farmer_id || ""}</SimpleData>
    <SimpleData name="area_ha">${item.area_ha || ""}</SimpleData>
    <SimpleData name="proejct_id">${projectCode}</SimpleData>
    <SimpleData name="geom">${geomType}</SimpleData>
  </SchemaData>
</ExtendedData>`;

      if (geom.type === "Polygon") {
        const coordinates = geom.coordinates[0]
          .map((coord) => `${coord[0]},${coord[1]},0`)
          .join(" ");

        kml += `
<Placemark>
  <name>${item.parcel_id || ""}</name>${extendedData}
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <coordinates>
          ${coordinates}
        </coordinates>
      </LinearRing>
    </outerBoundaryIs>
  </Polygon>
</Placemark>`;
      }

      if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach((polygon) => {
          const coordinates = polygon[0]
            .map((coord) => `${coord[0]},${coord[1]},0`)
            .join(" ");

          kml += `
<Placemark>
  <name>${item.parcel_id || ""}</name>${extendedData}
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <coordinates>
          ${coordinates}
        </coordinates>
      </LinearRing>
    </outerBoundaryIs>
  </Polygon>
</Placemark>`;
        });
      }
    });

    kml += `
</Document>
</kml>`;

    return kml;
  };

  // Triggers a single browser download for a KML string.
  const triggerDownload = (kmlContent, filename) => {
    const blob = new Blob([kmlContent], {
      type: "application/vnd.google-earth.kml+xml",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Download KML for just ONE project code.
  const downloadKMLForProject = (projectCode) => {
    const items = groupedByProjectCode[projectCode] || [];

    if (!items.length) {
      alert(`No data found for ${projectCode}`);
      return;
    }

    const kmlContent = convertGeoJSONToKML(items);
    triggerDownload(kmlContent, `${projectCode}.kml`);
  };

  // Download a SEPARATE KML file for every project code, one after another.
  // A small delay between each one stops the browser from blocking/merging
  // several downloads that fire in the same tick.
  const downloadAllSeparately = () => {
    if (!parcelData.length) {
      alert("Please fetch parcel data first");
      return;
    }

    projectCodes.forEach((code, index) => {
      setTimeout(() => {
        downloadKMLForProject(code);
      }, index * 600);
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Old Land Parcel Data</h2>

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={fetchParcelData}
          disabled={loading}
          style={{
            padding: "10px 20px",
            marginRight: "10px",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Fetch Data"}
        </button>

        <button
          onClick={downloadAllSeparately}
          disabled={!parcelData.length}
          style={{
            padding: "10px 20px",
            cursor: parcelData.length ? "pointer" : "not-allowed",
          }}
        >
          Download All (Separate KML per Project)
        </button>
      </div>

      {/* Per-project breakdown with its own download button */}
      {projectCodes.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3>Download by Project Code</h3>
          <table
            border="1"
            cellPadding="8"
            cellSpacing="0"
            style={{ borderCollapse: "collapse", marginBottom: "10px" }}
          >
            <thead>
              <tr>
                <th>Project Code</th>
                <th>Records</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {projectCodes.map((code) => (
                <tr key={code}>
                  <td>{code}</td>
                  <td>{groupedByProjectCode[code].length}</td>
                  <td>
                    <button
                      onClick={() => downloadKMLForProject(code)}
                      style={{ padding: "6px 14px", cursor: "pointer" }}
                    >
                      Download KML
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          border="1"
          cellPadding="8"
          cellSpacing="0"
          style={{
            borderCollapse: "collapse",
            width: "100%",
          }}
        >
          <thead>
            <tr>
              <th>parcel_id</th>
              <th>farmer_id</th>
              <th>area_ha</th>
              <th>proejct_id</th>
              <th>geom</th>
            </tr>
          </thead>

          <tbody>
            {parcelData.length > 0 ? (
              parcelData.map((row, index) => (
                <tr key={index}>
                  <td>{row.parcel_id}</td>
                  <td>{row.farmer_id}</td>
                  <td>{row.area_ha}</td>
                  <td>{row.proejct_id}</td>
                  <td>{row.geom?.type || "N/A"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" align="center">
                  No data loaded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: "15px" }}>
        Total Records: <strong>{parcelData.length}</strong>
      </p>
    </div>
  );
};

export default OldLandparcel;