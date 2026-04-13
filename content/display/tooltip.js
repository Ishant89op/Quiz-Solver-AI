export function mount(data, settings) {
  unmount();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const opacity = settings.overlayOpacity || 0.92;

  const tooltip = document.createElement("div");
  tooltip.className = "qsa-tooltip";
  Object.assign(tooltip.style, {
    position: "fixed",
    left: Math.max(8, rect.left + rect.width / 2 - 140) + "px",
    top: Math.max(8, rect.top - 8) + "px",
    transform: "translateY(-100%)",
    width: "280px",
    backgroundColor: `rgba(24, 24, 32, ${opacity})`,
    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    borderRadius: "10px", padding: "12px 14px",
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: "13px", lineHeight: "1.5",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.08)",
    zIndex: "2147483647"
  });
  tooltip.setAttribute("tabindex", "0");
  tooltip.setAttribute("role", "tooltip");

  let h = `<div style="font-weight:600;margin-bottom:6px;">${esc(data.answer)}</div>`;
  if (settings.showExplanation !== false && data.explanation) {
    h += `<div style="font-size:12px;color:#94a3b8;">${esc(data.explanation)}</div>`;
  }
  if (settings.showConfidence !== false) {
    const c = getColor(data.confidence);
    h += `<div style="margin-top:6px;"><span style="font-size:11px;padding:2px 6px;border-radius:3px;background:${c}22;color:${c};">${(data.confidence || "").toUpperCase()}</span></div>`;
  }

  const arrow = document.createElement("div");
  Object.assign(arrow.style, {
    position: "absolute", bottom: "-6px", left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
    width: "12px", height: "12px",
    backgroundColor: `rgba(24, 24, 32, ${opacity})`,
    border: "1px solid rgba(255,255,255,0.08)",
    borderTop: "none", borderLeft: "none"
  });

  tooltip.innerHTML = h;
  tooltip.appendChild(arrow);
  document.body.appendChild(tooltip);

  tooltip.addEventListener("keydown", (e) => { if (e.key === "Escape") unmount(); });
  const clickHandler = (e) => {
    if (!tooltip.contains(e.target)) { unmount(); document.removeEventListener("click", clickHandler); }
  };
  setTimeout(() => document.addEventListener("click", clickHandler), 100);

  return tooltip;
}

export function unmount() {
  const existing = document.querySelector(".qsa-tooltip");
  if (existing) existing.remove();
}

export function update(data, settings) {
  mount(data, settings);
}

function getColor(c) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  if (c === "low") return "#ef4444";
  return "#6366f1";
}

function esc(s) {
  if (!s) return "";
  const d = document.createElement("div"); d.textContent = s; return d.innerHTML;
}
