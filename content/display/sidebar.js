export function mount(data, settings) {
  let sidebar = document.querySelector(".qsa-sidebar");
  const opacity = settings.overlayOpacity || 0.92;

  if (!sidebar) {
    sidebar = document.createElement("div");
    sidebar.className = "qsa-sidebar";
    Object.assign(sidebar.style, {
      position: "fixed", top: "0", right: "-240px",
      width: "220px", height: "100vh",
      backgroundColor: `rgba(15, 15, 25, ${opacity})`,
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      fontSize: "12px", zIndex: "2147483646",
      transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      overflowY: "auto", padding: "0"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex", justifyContent: "space-between", alignItems: "center"
    });

    const title = document.createElement("span");
    title.textContent = "Answers";
    title.style.fontWeight = "600";
    title.style.fontSize = "13px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "x";
    Object.assign(closeBtn.style, {
      background: "none", border: "none", color: "#64748b",
      cursor: "pointer", fontSize: "14px", padding: "2px 6px"
    });
    closeBtn.addEventListener("click", () => { sidebar.style.right = "-240px"; });

    header.appendChild(title);
    header.appendChild(closeBtn);
    sidebar.appendChild(header);

    const content = document.createElement("div");
    content.className = "qsa-sidebar-content";
    content.style.padding = "8px";
    sidebar.appendChild(content);

    const toggle = document.createElement("div");
    toggle.className = "qsa-sidebar-toggle";
    Object.assign(toggle.style, {
      position: "fixed", top: "50%", right: "0",
      width: "16px", height: "40px",
      backgroundColor: "rgba(15, 15, 25, 0.8)",
      borderRadius: "4px 0 0 4px", cursor: "pointer",
      zIndex: "2147483646", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "#64748b", fontSize: "10px",
      transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    });
    toggle.textContent = "<";
    toggle.setAttribute("tabindex", "0");
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-label", "Toggle answer sidebar");

    let isOpen = false;
    toggle.addEventListener("click", () => {
      isOpen = !isOpen;
      sidebar.style.right = isOpen ? "0" : "-240px";
      toggle.style.right = isOpen ? "220px" : "0";
      toggle.textContent = isOpen ? ">" : "<";
    });
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle.click(); }
    });

    document.body.appendChild(sidebar);
    document.body.appendChild(toggle);
  }

  update(data, settings);

  const toggle = document.querySelector(".qsa-sidebar-toggle");
  if (toggle && sidebar.style.right !== "0px") toggle.click();
}

export function unmount() {
  const sidebar = document.querySelector(".qsa-sidebar");
  const toggle = document.querySelector(".qsa-sidebar-toggle");
  if (sidebar) sidebar.remove();
  if (toggle) toggle.remove();
}

export function update(data, settings) {
  const content = document.querySelector(".qsa-sidebar-content");
  if (!content) return;

  const entry = document.createElement("div");
  Object.assign(entry.style, {
    padding: "10px", marginBottom: "6px", borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderLeft: `3px solid ${getColor(data.confidence)}`
  });

  let h = `<div style="font-weight:600;font-size:12px;color:#fff;margin-bottom:4px;">${esc(data.answer)}</div>`;
  if (data.question) h += `<div style="font-size:11px;color:#64748b;margin-bottom:4px;">${esc((data.question || "").slice(0, 100))}</div>`;
  if (data.userAnswer) h += `<div style="font-size:11px;color:#f59e0b;">Chose: ${esc(data.userAnswer)}</div>`;
  if (settings.showExplanation !== false && data.explanation) {
    h += `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">${esc(data.explanation)}</div>`;
  }
  const now = new Date();
  h += `<div style="font-size:10px;color:#475569;margin-top:4px;">${pad(now.getHours())}:${pad(now.getMinutes())}</div>`;

  entry.innerHTML = h;
  content.insertBefore(entry, content.firstChild);
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

function pad(n) { return n.toString().padStart(2, "0"); }
