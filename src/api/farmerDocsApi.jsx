const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://datauploadingbackend-13977221722.asia-south2.run.app";
export const uploadDocumentZip = (formData, onUploadProgress = null) => {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("token");
    const xhr = new XMLHttpRequest();

    // 30 minute timeout — 1GB+ files ke liye
    xhr.timeout = 30 * 60 * 1000;

    xhr.open("POST", `${API_BASE_URL}/api/v1/farmer-docs/zip-upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    // ── Upload progress ──────────────────────────────────────
    if (typeof onUploadProgress === "function") {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(percent);
        }
      });
    }

    // ── Response received (any status code) ─────────────────
    xhr.addEventListener("load", () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { raw: xhr.responseText };
      }

      // ✅ FIX: 2xx → resolve ok:true, 4xx/5xx → resolve ok:false
      // Dono cases mein resolve — frontend if(!res.ok) check karta hai
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      });
    });

    // ── Network error (internet gaya, CORS blocked, etc.) ───
    // ✅ FIX: reject(new Error(...)) — .message directly milega
    xhr.addEventListener("error", () => {
      reject(
        new Error("Network error — check your internet connection or CORS config")
      );
    });

    // ── Timeout ──────────────────────────────────────────────
    xhr.addEventListener("timeout", () => {
      reject(
        new Error("Request timed out — file too large or server is slow")
      );
    });

    // ── Abort ────────────────────────────────────────────────
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload was cancelled"));
    });

    xhr.send(formData);
  });
};
// ─────────────────────────────────────────────────────────────
// uploadDocumentZip
//
// ✅ FIXES vs old version:
//   1. Error case: reject({ message }) → reject(new Error(message))
//      Frontend catch mein err.message directly milega
//   2. 4xx/5xx bhi resolve hota hai { ok: false, ... } ke saath
//      Frontend mein if (!res.ok) check sahi se kaam karega
//   3. Timeout: 30 min (1GB+ files ke liye)
//   4. onUploadProgress: XHR network upload % track karta hai
//
// Usage:
//   const res = await uploadDocumentZip(formData, (percent) => {
//     setXhrPercent(percent);
//   });
//   if (!res.ok) throw new Error(res.data?.message || "Upload failed");
// 