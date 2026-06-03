const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";

export const uploadDocumentZip = (
  formData,
  onUploadProgress = null,
  options = {}
) => {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("token");
    const xhr = new XMLHttpRequest();

    // 30 min timeout — large mini ZIP batches ke liye safe
    xhr.timeout = 30 * 60 * 1000;

    const abortFromSignal = () => xhr.abort();

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new Error("Upload was cancelled"));
        return;
      }

      options.signal.addEventListener("abort", abortFromSignal, {
        once: true,
      });
    }

    xhr.open("POST", `${API_BASE_URL}/api/v1/farmer-docs/zip-upload`);

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    // XHR network upload progress
    if (typeof onUploadProgress === "function") {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(percent);
        }
      });
    }

    xhr.addEventListener("load", () => {
      options.signal?.removeEventListener("abort", abortFromSignal);

      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { raw: xhr.responseText };
      }

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      });
    });

    xhr.addEventListener("error", () => {
      options.signal?.removeEventListener("abort", abortFromSignal);
      reject(new Error("Network error — check internet connection or CORS config"));
    });

    xhr.addEventListener("timeout", () => {
      options.signal?.removeEventListener("abort", abortFromSignal);
      reject(new Error("Request timed out — file too large or server is slow"));
    });

    xhr.addEventListener("abort", () => {
      options.signal?.removeEventListener("abort", abortFromSignal);
      reject(new Error("Upload was cancelled"));
    });

    xhr.send(formData);
  });
};

export const uploadAllBatches = async ({
  zipFile,
  buildMiniZipForFarmers,
  farmerIds = [],
  batchSize = 8,
  onXhrProgress = null,
  onBatchComplete = null,
  onError = null,
  signal = null,
}) => {
  let totalSucceeded = 0;
  let totalFailed = 0;
  const allErrors = [];

  const totalBatches =
    farmerIds.length > 0 ? Math.ceil(farmerIds.length / batchSize) : 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    if (signal?.aborted) {
      return {
        totalSucceeded,
        totalFailed,
        totalBatches,
        allErrors,
        cancelled: true,
      };
    }

    const clientBatchNumber = batchIndex + 1;
    const batchFarmerIds = farmerIds.slice(
      batchIndex * batchSize,
      batchIndex * batchSize + batchSize
    );

    try {
      const miniZipFile =
        typeof buildMiniZipForFarmers === "function"
          ? await buildMiniZipForFarmers(batchFarmerIds, clientBatchNumber)
          : zipFile;

      const formData = new FormData();
      formData.append("zipFile", miniZipFile);

      // Mini ZIP already contains only this batch.
      // Keep backend batch_number 1 to avoid offset skipping inside mini ZIP.
      formData.append("batch_number", "1");
      formData.append("batch_size", String(batchSize));
      formData.append("total_farmers", String(batchFarmerIds.length));
      formData.append("client_batch_number", String(clientBatchNumber));
      formData.append("client_total_batches", String(totalBatches));

      const res = await uploadDocumentZip(formData, onXhrProgress, { signal });

      if (!res.ok) {
        const errMsg =
          res.data?.message ||
          `Server error on batch ${clientBatchNumber} (HTTP ${res.status})`;

        const err = new Error(errMsg);
        if (typeof onError === "function") onError(err, clientBatchNumber);

        allErrors.push({
          batchNumber: clientBatchNumber,
          error: errMsg,
          serverData: res.data,
        });

        break;
      }

      const { data } = res;

      totalSucceeded += data.succeeded || 0;
      totalFailed += data.failed || 0;

      if (data.errors?.length) {
        data.errors.forEach((e) =>
          allErrors.push({ batchNumber: clientBatchNumber, ...e })
        );
      }

      if (typeof onBatchComplete === "function") {
        onBatchComplete({
          batchNumber: clientBatchNumber,
          totalBatches,
          succeeded: data.succeeded || 0,
          failed: data.failed || 0,
          processedUntil: (batchIndex + 1) * batchSize,
          totalFarmers: farmerIds.length,
          farmerIds: batchFarmerIds,
          response: data,
        });
      }
    } catch (err) {
      if (typeof onError === "function") onError(err, clientBatchNumber);

      allErrors.push({
        batchNumber: clientBatchNumber,
        error: err.message,
      });

      if (signal?.aborted) {
        return {
          totalSucceeded,
          totalFailed,
          totalBatches,
          allErrors,
          cancelled: true,
        };
      }

      break;
    }
  }

  return {
    totalSucceeded,
    totalFailed,
    totalBatches,
    allErrors,
    cancelled: false,
  };
};

// ─────────────────────────────────────────────
// getSecureDocument — farmer ka document URL fetch karo
//
// doc_type: "aadhar" | "agreement" | "photo"
// Returns: { file_url: "https://storage.googleapis.com/..." }
// ─────────────────────────────────────────────

export const getSecureDocument = async (farmerId, docType) => {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${API_BASE_URL}/api/v1/farmer-docs/view?farmer_id=${encodeURIComponent(
      farmerId
    )}&doc_type=${encodeURIComponent(docType)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to fetch document");
  }

  return data;
};

// ─────────────────────────────────────────────
// uploadSingleFarmer — single farmer ke docs upload
// ─────────────────────────────────────────────

export const uploadSingleFarmer = async ({
  farmerId,
  aadharFile = null,
  agreementFile = null,
  photoFile = null,
}) => {
  const token = localStorage.getItem("token");
  const formData = new FormData();

  formData.append("farmer_id", farmerId);

  if (aadharFile) formData.append("aadhar", aadharFile);
  if (agreementFile) formData.append("agreement_letter", agreementFile);
  if (photoFile) formData.append("farmer_photo", photoFile);

  const res = await fetch(`${API_BASE_URL}/api/v1/farmer-docs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Upload failed");
  }

  return data;
};