export async function autoCapture(element) {
  if (!element) return null;

  try {
    const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
    if (!response || !response.dataUrl) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          canvas.width, canvas.height
        );
        const base64 = canvas.toDataURL("image/png").split(",")[1];
        resolve(base64);
      };
      img.onerror = () => resolve(null);
      img.src = response.dataUrl;
    });
  } catch {
    return null;
  }
}
