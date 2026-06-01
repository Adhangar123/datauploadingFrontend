const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";

// ─────────────────────────────────────────────────────────────
// uploadDocumentZip
//
// CHANGES vs old version:
//   1. fetch → XMLHttpRequest  (progress events support)
//   2. onUploadProgress callback added  (% dikhane ke liye)
//   3. 30 minute timeout  (1GB+ files ke liye zaroorat hai)
//   4. Response always JSON parse hoti hai (same as fetch .json())
//   5. Network errors / timeouts alag-alag throw hote hain
//
// Usage:
//   const res = await uploadDocumentZip(formData, (percent) => {
//     console.log(`Uploaded: ${percent}%`);
//   });
// ─────────────────────────────────────────────────────────────

export const uploadDocumentZip = (formData, onUploadProgress = null) => {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("token");
    const xhr = new XMLHttpRequest();

    // 30 minute timeout — 1GB+ files ke liye
    xhr.timeout = 30 * 60 * 1000;

    xhr.open(
      "POST",
      `${API_BASE_URL}/api/v1/farmer-docs/zip-upload`
    );

    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    // ── Upload progress ──────────────────────────────────────
    if (onUploadProgress && typeof onUploadProgress === "function") {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(percent);
        }
      });
    }

    // ── Success / failure ────────────────────────────────────
    xhr.addEventListener("load", () => {
      let data = null;

      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // JSON parse nahi hua — raw text return karo
        data = { raw: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, status: xhr.status, data });
      } else {
        // Server ne error response diya (4xx / 5xx)
        reject({
          ok: false,
          status: xhr.status,
          data,
          message: data?.message || `Server error: ${xhr.status}`,
        });
      }
    });

    // ── Network error (internet gaya, CORS, etc.) ────────────
    xhr.addEventListener("error", () => {
      reject({
        ok: false,
        status: 0,
        message: "Network error — check your internet connection",
      });
    });

    // ── Timeout ──────────────────────────────────────────────
    xhr.addEventListener("timeout", () => {
      reject({
        ok: false,
        status: 0,
        message: "Request timed out — file too large or server is slow",
      });
    });

    // ── Abort ────────────────────────────────────────────────
    xhr.addEventListener("abort", () => {
      reject({
        ok: false,
        status: 0,
        message: "Upload was cancelled",
      });
    });

    xhr.send(formData);
  });
};