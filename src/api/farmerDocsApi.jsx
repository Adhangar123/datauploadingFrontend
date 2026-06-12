const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";

// ======================================================
// ZIP Upload — XHR wrapper
//
// ✅ FIX 1: xhr "error" aur "timeout" handlers add kiye
//           ab network fail pe promise hang nahi karega
//
// ✅ FIX 2: signal abort listener cleanup — "load",
//           "error", "timeout" teeno mein remove hoga
//           memory leak nahi hogi
// ======================================================

export const uploadDocumentZip = (
  formData,
  onUploadProgress = null,
  options = {}
) => {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("token");
    const xhr   = new XMLHttpRequest();

    xhr.timeout = 30 * 60 * 1000; // 30 min

    // ─── FIX: cleanup helper — teeno events mein call hogi ───
    const cleanup = () => {
      options.signal?.removeEventListener("abort", abortFromSignal);
    };

    const abortFromSignal = () => {
      xhr.abort();
      reject(new Error("Upload was cancelled"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new Error("Upload was cancelled"));
        return;
      }
      options.signal.addEventListener("abort", abortFromSignal, { once: true });
    }

    xhr.open("POST", `${API_BASE_URL}/api/v1/farmer-docs/zip-upload`);

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    if (typeof onUploadProgress === "function") {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(percent);
        }
      });
    }

    // ─── Success ───
    xhr.addEventListener("load", () => {
      cleanup(); // FIX: cleanup here too

      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { raw: xhr.responseText };
      }

      resolve({
        ok:     xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      });
    });

    // ─── FIX: Network error handler (connection refused, DNS fail etc.) ───
    xhr.addEventListener("error", () => {
      cleanup();
      const errMsg = "Network error — request could not be sent";
      console.error(`[XHR_ERROR] ${errMsg}`);
      reject(new Error(errMsg));
    });

    // ─── FIX: Timeout handler ───
    xhr.addEventListener("timeout", () => {
      cleanup();
      const errMsg = `Request timed out after ${xhr.timeout / 1000}s`;
      console.error(`[XHR_TIMEOUT] ${errMsg}`);
      reject(new Error(errMsg));
    });

    // ─── FIX: Abort by user (not signal) ───
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new Error("Upload was cancelled by user"));
    });

    xhr.send(formData);
  });
};

// ======================================================
// uploadAllBatches
//
// ✅ FIX 1: Double-batching bug FIX —
//           Client slice karta hai + mini-ZIP banata hai,
//           backend ko batata hai client_batch_mode=true
//           Backend re-slice NAHI karega ab
//
// ✅ FIX 2: batch_number aur offset client se
//           backend ko bhejta hai taaki backend
//           logs mein sahi info dike
//
// ✅ FIX 3: totalPartial track kiya
//
// ✅ FIX 4: break hata diya — ek batch fail ho toh
//           bhi agle batch pe jao
//
// ✅ FIX 5: file_errors collect karo partial farmers se
//
// ✅ FIX 6: Har batch ka clear console log — success,
//           partial, failed sab clearly dike
// ======================================================

export const uploadAllBatches = async ({
  zipFile,
  buildMiniZipForFarmers,
  farmerIds    = [],
  batchSize    = 8,
  onXhrProgress  = null,
  onBatchComplete = null,
  onError         = null,
  signal          = null,
}) => {
  let totalSucceeded  = 0;
  let totalPartial    = 0;
  let totalFailed     = 0;
  const allErrors     = [];
  const allFileErrors = [];

  const totalBatches =
    farmerIds.length > 0
      ? Math.ceil(farmerIds.length / batchSize)
      : 0;

  console.log(
    `[uploadAllBatches] START | total_farmers=${farmerIds.length} | batch_size=${batchSize} | total_batches=${totalBatches}`
  );

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    if (signal?.aborted) {
      console.warn(`[uploadAllBatches] CANCELLED at batch ${batchIndex + 1}`);
      return {
        totalSucceeded,
        totalPartial,
        totalFailed,
        totalBatches,
        allErrors,
        allFileErrors,
        cancelled: true,
      };
    }

    const clientBatchNumber = batchIndex + 1;
    const clientOffset      = batchIndex * batchSize;

    const batchFarmerIds = farmerIds.slice(clientOffset, clientOffset + batchSize);

    console.log(
      `[uploadAllBatches] Batch ${clientBatchNumber}/${totalBatches} | farmers=${batchFarmerIds.join(", ")}`
    );

    try {
      // ─── FIX: mini-ZIP banate hain sirf is batch ke farmers ke liye ───
      const miniZipFile =
        typeof buildMiniZipForFarmers === "function"
          ? await buildMiniZipForFarmers(batchFarmerIds, clientBatchNumber)
          : zipFile;

      const formData = new FormData();
      formData.append("zipFile",              miniZipFile);

      // ─── FIX: client_batch_mode=true bhejo — backend re-slice nahi karega ───
      formData.append("client_batch_mode",    "true");

      // ─── FIX: batch info bhejo — backend logs mein sahi dike ───
      formData.append("batch_number",         String(clientBatchNumber));
      formData.append("offset",               String(clientOffset));
      formData.append("batch_size",           String(batchSize));
      formData.append("total_farmers",        String(batchFarmerIds.length));
      formData.append("client_total_batches", String(totalBatches));

      const res = await uploadDocumentZip(formData, onXhrProgress, { signal });

      if (!res.ok) {
        // ─── FIX: HTTP error — clear console log ───
        const errMsg = res.data?.message || `HTTP ${res.status} — Batch ${clientBatchNumber} failed`;
        console.error(
          `[uploadAllBatches] BATCH_HTTP_FAIL | batch=${clientBatchNumber} | status=${res.status} | message=${errMsg}`
        );
        throw new Error(errMsg);
      }

      // ─── FIX: Teen counters update ───
      const batchSucceeded = res.data?.succeeded || 0;
      const batchPartial   = res.data?.partial   || 0;
      const batchFailed    = res.data?.failed    || 0;

      totalSucceeded += batchSucceeded;
      totalPartial   += batchPartial;
      totalFailed    += batchFailed;

      // ─── FIX: Batch level errors collect ───
      if (res.data?.errors?.length) {
        allErrors.push(...res.data.errors);

        // Clear console per farmer error
        res.data.errors.forEach((e) => {
          console.error(
            `[uploadAllBatches] FARMER_FAIL | batch=${clientBatchNumber} | farmer_id=${e.farmer_id} | error=${e.error}`
          );
        });
      }

      // ─── FIX: File level errors from partial farmers ───
      if (res.data?.success?.length) {
        res.data.success.forEach((farmer) => {
          if (farmer.file_errors?.length) {
            farmer.file_errors.forEach((fe) => {
              console.warn(
                `[uploadAllBatches] FILE_FAIL | batch=${clientBatchNumber} | farmer_id=${farmer.farmer_id} | docType=${fe.docType} | file=${fe.fileName} | error=${fe.error}`
              );
              allFileErrors.push({
                farmer_id: farmer.farmer_id,
                ...fe,
              });
            });
          }
        });
      }

      console.log(
        `[uploadAllBatches] Batch ${clientBatchNumber}/${totalBatches} DONE | succeeded=${batchSucceeded} | partial=${batchPartial} | failed=${batchFailed}`
      );

      onBatchComplete?.({
        batchNumber:  clientBatchNumber,
        totalBatches,
        response:     res.data,
      });

    } catch (err) {
      // ─── FIX: break nahi — agle batch pe jao ───
      console.error(
        `[uploadAllBatches] BATCH_CRASH | batch=${clientBatchNumber} | error=${err.message}`
      );

      onError?.(err, clientBatchNumber);

      allErrors.push({
        batchNumber: clientBatchNumber,
        farmers:     batchFarmerIds,
        error:       err.message,
      });

      // FIX: break hata diya — continue to next batch
    }
  }

  console.log(
    `[uploadAllBatches] ALL DONE | total_succeeded=${totalSucceeded} | total_partial=${totalPartial} | total_failed=${totalFailed} | batch_errors=${allErrors.length} | file_errors=${allFileErrors.length}`
  );

  return {
    totalSucceeded,
    totalPartial,
    totalFailed,
    totalBatches,
    allErrors,
    allFileErrors,
    cancelled: false,
  };
};

// ======================================================
// View Documents
// ======================================================

export const getSecureDocument = async (farmerId, docType) => {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${API_BASE_URL}/api/v1/farmer-docs/view?farmer_id=${encodeURIComponent(
      farmerId
    )}&doc_type=${encodeURIComponent(docType)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to fetch document");
  }

  return {
    file_urls: data.file_urls || [],
    file_url:  data.file_url  || null,
    count:     data.count     || 0,
  };
};

// ======================================================
// Single Farmer Upload
// ======================================================

export const uploadSingleFarmer = async ({
  farmerId,
  aadharFiles    = [],
  agreementFiles = [],
  photoFiles     = [],
}) => {
  const token = localStorage.getItem("token");

  const formData = new FormData();
  formData.append("farmer_id", farmerId);

  aadharFiles.forEach((file)    => formData.append("aadhar",           file));
  agreementFiles.forEach((file) => formData.append("agreement_letter", file));
  photoFiles.forEach((file)     => formData.append("farmer_photo",     file));

  const res = await fetch(`${API_BASE_URL}/api/v1/farmer-docs/upload`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Upload failed");
  }

  return data;
};