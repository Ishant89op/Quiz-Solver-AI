import { saveSetting } from "../popup.js";

const DISPLAY_MODES = [
  { id: "floatingDot", label: "Floating Dot", desc: "Small circle bottom-right, hover to expand" },
  { id: "urlHash", label: "URL Hash", desc: "Answer written to address bar hash only" },
  { id: "consoleLog", label: "Console Log", desc: "Styled output in DevTools console" },
  { id: "sidebar", label: "Sidebar Panel", desc: "Collapsible panel with answer history" },
  { id: "tooltip", label: "Tooltip on Selection", desc: "Appears above selected question text" },
  { id: "hiddenField", label: "Hidden Field", desc: "Invisible input, accessible via hotkey" }
];

export function initDisplaySection(settings) {
  const section = document.getElementById("section-display");
  const current = settings.displayMode || "floatingDot";

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Display Mode</div>`;
  html += `<div class="qsa-radio-group">`;

  for (const mode of DISPLAY_MODES) {
    html += `<label class="qsa-radio-item">`;
    html += `<input type="radio" name="displayMode" value="${mode.id}" ${mode.id === current ? "checked" : ""}>`;
    html += `<div><div class="qsa-radio-label">${mode.label}</div>`;
    html += `<div class="qsa-radio-desc">${mode.desc}</div></div>`;
    html += `</label>`;
  }

  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Display Options</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Show explanation</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-show-explanation" ${settings.showExplanation !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Show confidence badge</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-show-confidence" ${settings.showConfidence !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Auto-clear answer</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-auto-clear" ${settings.autoClearAnswer ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `<div class="qsa-field" id="qsa-clear-delay-field" style="margin-top:8px;${settings.autoClearAnswer ? "" : "display:none;"}">`;
  html += `<div class="qsa-label">Clear after (seconds)</div>`;
  html += `<div class="qsa-slider-container">`;
  html += `<input type="range" class="qsa-slider" id="qsa-clear-delay" min="3" max="60" step="1" value="${settings.autoClearDelay || 10}">`;
  html += `<span class="qsa-slider-value" id="qsa-clear-delay-value">${settings.autoClearDelay || 10}s</span>`;
  html += `</div></div>`;

  html += `</div>`;

  section.innerHTML = html;

  section.querySelectorAll('input[name="displayMode"]').forEach(radio => {
    radio.addEventListener("change", () => saveSetting("displayMode", radio.value));
  });

  document.getElementById("qsa-show-explanation").addEventListener("change", (e) => {
    saveSetting("showExplanation", e.target.checked);
  });

  document.getElementById("qsa-show-confidence").addEventListener("change", (e) => {
    saveSetting("showConfidence", e.target.checked);
  });

  const autoClear = document.getElementById("qsa-auto-clear");
  autoClear.addEventListener("change", (e) => {
    saveSetting("autoClearAnswer", e.target.checked);
    document.getElementById("qsa-clear-delay-field").style.display = e.target.checked ? "" : "none";
  });

  const clearDelay = document.getElementById("qsa-clear-delay");
  const clearDelayValue = document.getElementById("qsa-clear-delay-value");
  clearDelay.addEventListener("input", () => { clearDelayValue.textContent = clearDelay.value + "s"; });
  clearDelay.addEventListener("change", () => saveSetting("autoClearDelay", parseInt(clearDelay.value)));
}
