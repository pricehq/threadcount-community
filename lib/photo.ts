"use client";
// Device camera capture for attachments: opens the camera (file input with capture), downscales on a canvas
// to <= 900px and returns a JPEG data URL. Resolves null if the user cancels.
export function takePhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
    let done = false;
    const finish = (v: string | null) => { if (!done) { done = true; resolve(v); } };
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) { finish(null); return; }
      const img = new Image();
      img.onload = () => {
        const max = 900; const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        finish(cv.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => finish(null);
      img.src = URL.createObjectURL(f);
    };
    // Cancelling the picker fires no change event; treat focus returning without a file as a cancel.
    window.addEventListener("focus", () => setTimeout(() => { if (!inp.files || !inp.files.length) finish(null); }, 800), { once: true });
    inp.click();
  });
}

/** Upload a data URL to the facility's photo store; returns the photo id. */
export async function uploadPhoto(mutate: (op: string, payload?: unknown) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>, kind: string, data: string): Promise<{ id: string } | { error: string }> {
  const r = await mutate("photo.put", { kind, data });
  if (!r.ok) return { error: r.error };
  return { id: (r.result as { id: string }).id };
}

export const photoUrl = (id: string) => `/api/photo/${id}`;
export function viewPhoto(id: string) { window.open(photoUrl(id), "_blank", "noopener"); }
