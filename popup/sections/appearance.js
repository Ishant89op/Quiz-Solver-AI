import { saveSetting, applyTheme } from "../popup.js";

export function initAppearanceSection(settings) {
  const section = document.getElementById("section-appearance");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Theme</div>`;
  html += `<div class="qsa-radio-group">`;

  const themes = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "system", label: "System" }
  ];

  for (const t of themes) {
    html += `<label class="qsa-radio-item">`;
    html += `<input type="radio" name="theme" value="${t.id}" ${(settings.theme || "dark") === t.id ? "checked" : ""}>`;
    html += `<span class="qsa-radio-label">${t.label}</span>`;
    html += `</label>`;
  }

  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Accent Color</div>`;
  html += `<div class="qsa-color-picker-row">`;
  html += `<input type="color" class="qsa-color-input" id="qsa-accent-color" value="${settings.accentColor || "#6366f1"}">`;
  html += `<span class="qsa-label" style="margin-bottom:0;">${settings.accentColor || "#6366f1"}</span>`;
  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Overlay Opacity</div>`;
  html += `<div class="qsa-slider-container">`;
  html += `<input type="range" class="qsa-slider" id="qsa-opacity" min="0.3" max="1" step="0.05" value="${settings.overlayOpacity || 0.92}">`;
  html += `<span class="qsa-slider-value" id="qsa-opacity-value">${Math.round((settings.overlayOpacity || 0.92) * 100)}%</span>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Controls floating dot and sidebar transparency</div>`;
  html += `</div>`;

  section.innerHTML = html;

  section.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", () => {
      saveSetting("theme", radio.value);
      applyTheme(radio.value);
    });
  });

  const colorInput = document.getElementById("qsa-accent-color");
  colorInput.addEventListener("input", (e) => {
    const label = colorInput.nextElementSibling;
    if (label) label.textContent = e.target.value;
    document.documentElement.style.setProperty("--accent", e.target.value);
  });
  colorInput.addEventListener("change", (e) => {
    saveSetting("accentColor", e.target.value);
  });

  const opacitySlider = document.getElementById("qsa-opacity");
  const opacityValue = document.getElementById("qsa-opacity-value");
  opacitySlider.addEventListener("input", () => {
    opacityValue.textContent = Math.round(opacitySlider.value * 100) + "%";
  });
  opacitySlider.addEventListener("change", () => {
    saveSetting("overlayOpacity", parseFloat(opacitySlider.value));
  });
}
