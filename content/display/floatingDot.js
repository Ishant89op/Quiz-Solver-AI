export function mount(data, settings) {
  let dot = document.querySelector(".qsa-floating-dot");
  let card = document.querySelector(".qsa-floating-card");
  const accent = settings.accentColor || "#6366f1";
  const opacity = settings.overlayOpacity || 0.92;

  if (!dot) {
    dot = document.createElement("div");
    dot.className = "qsa-floating-dot";
    Object.assign(dot.style, {
      position: "fixed", bottom: "20px", right: "20px",
      width: "10px", height: "10px", borderRadius: "50%",
      cursor: "pointer", zIndex: "2147483646",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
    });
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", "Quiz answer indicator");

    card = document.createElement("div");
    card.className = "qsa-floating-card";
    Object.assign(card.style, {
      position: "fixed", bottom: "40px", right: "16px",
      width: "280px", maxHeight: "320px", overflowY: "auto",
      backgroundColor: `rgba(24, 24, 32, ${opacity})`,
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderRadius: "12px", padding: "16px", color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      fontSize: "13px", lineHeight: "1.5",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      border: "1px solid rgba(255,255,255,0.08)",
      zIndex: "2147483646", display: "none",
      opacity: "0", transform: "translateY(8px) scale(0.95)",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
    });

    let pinned = false;

    dot.addEventListener("mouseenter", () => { if (!pinned) show(card); });
    dot.addEventListener("mouseleave", () => {
      if (!pinned) setTimeout(() => { if (!card.matches(":hover") && !pinned) hide(card); }, 200);
    });
    card.addEventListener("mouseleave", () => { if (!pinned) hide(card); });
    dot.addEventListener("click", () => {
      pinned = !pinned;
      if (pinned) show(card);
      dot.style.boxShadow = pinned
        ? `0 0 0 3px ${accent}, 0 2px 8px rgba(0,0,0,0.3)`
        : "0 2px 8px rgba(0,0,0,0.3)";
    });
    dot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dot.click(); }
    });

    document.body.appendChild(dot);
    document.body.appendChild(card);
  }

  dot.style.backgroundColor = getColor(data.confidence);
  update(card, data, settings);
}

export function unmount() {
  const dot = document.querySelector(".qsa-floating-dot");
  const card = document.querySelector(".qsa-floating-card");
  if (dot) dot.remove();
  if (card) card.remove();
}

export function update(card, data, settings) {
  if (!card) card = document.querySelector(".qsa-floating-card");
  if (!card) return;

  const showExp = settings.showExplanation !== false;
  const showConf = settings.showConfidence !== false;
  let h = `<div style="font-weight:600;font-size:14px;margin-bottom:8px;color:#fff;">${esc(data.answer)}</div>`;
  if (data.userAnswer) {
    const correct = (data.answer || "").toLowerCase().includes((data.userAnswer || "").toLowerCase());
    h += `<div style="font-size:12px;margin-bottom:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.05);">`;
    h += `<span style="color:#94a3b8;">You chose:</span> <span style="color:${correct ? "#22c55e" : "#ef4444"};">${esc(data.userAnswer)}</span></div>`;
  }
  if (showExp && data.explanation) {
    h += `<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;">${esc(data.explanation)}</div>`;
  }
  if (showConf && data.confidence) {
    const c = getColor(data.confidence);
    h += `<div style="display:inline-block;font-size:11px;font-weight:500;padding:2px 8px;border-radius:4px;background:${c}22;color:${c};border:1px solid ${c}44;">${data.confidence.toUpperCase()}</div>`;
  }
  if (data.fromCache) h += ` <span style="font-size:10px;color:#64748b;margin-left:4px;">(cached)</span>`;
  card.innerHTML = h;
}

function show(el) {
  el.style.display = "block";
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0) scale(1)"; });
}

function hide(el) {
  el.style.opacity = "0";
  el.style.transform = "translateY(8px) scale(0.95)";
  setTimeout(() => { el.style.display = "none"; }, 250);
}

function getColor(c) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  if (c === "low") return "#ef4444";
  return "#6366f1";
}

function esc(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
