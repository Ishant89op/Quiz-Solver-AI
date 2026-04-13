export function regionSelect() {
  return new Promise((resolve) => {
    if (document.querySelector(".qsa-region-overlay")) {
      resolve(null);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "qsa-region-overlay";
    Object.assign(overlay.style, {
      position: "fixed", top: "0", left: "0",
      width: "100vw", height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      cursor: "crosshair", zIndex: "2147483647",
      userSelect: "none"
    });

    const selBox = document.createElement("div");
    selBox.className = "qsa-region-selection";
    Object.assign(selBox.style, {
      position: "fixed",
      border: "2px dashed #6366f1",
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      display: "none", zIndex: "2147483647",
      pointerEvents: "none"
    });

    let startX, startY, isDragging = false;

    overlay.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      selBox.style.display = "block";
      selBox.style.left = startX + "px";
      selBox.style.top = startY + "px";
      selBox.style.width = "0";
      selBox.style.height = "0";
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      selBox.style.left = x + "px";
      selBox.style.top = y + "px";
      selBox.style.width = Math.abs(e.clientX - startX) + "px";
      selBox.style.height = Math.abs(e.clientY - startY) + "px";
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const rect = {
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        width: Math.abs(e.clientX - startX),
        height: Math.abs(e.clientY - startY)
      };

      cleanup();

      if (rect.width < 20 || rect.height < 20) {
        resolve(null);
        return;
      }

      try {
        const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
        if (!response || !response.dataUrl) { resolve(null); return; }

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
            0, 0, canvas.width, canvas.height
          );
          resolve(canvas.toDataURL("image/png").split(",")[1]);
        };
        img.onerror = () => resolve(null);
        img.src = response.dataUrl;
      } catch {
        resolve(null);
      }
    });

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { cleanup(); resolve(null); }
    });

    function cleanup() {
      overlay.remove();
      selBox.remove();
    }

    document.body.appendChild(overlay);
    document.body.appendChild(selBox);
    overlay.setAttribute("tabindex", "0");
    overlay.focus();
  });
}
