import { saveSetting } from "../popup.js";

export function initScreenshotSection(settings) {
  const section = document.getElementById("section-screenshot");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Capture Mode</div>`;
  html += `<div class="qsa-radio-group">`;

  html += `<label class="qsa-radio-item">`;
  html += `<input type="radio" name="screenshotMode" value="autoCapture" ${settings.screenshotMode === "autoCapture" ? "checked" : ""}>`;
  html += `<div><div class="qsa-radio-label">Auto-capture element</div>`;
  html += `<div class="qsa-radio-desc">Automatically captures the question container</div></div>`;
  html += `</label>`;

  html += `<label class="qsa-radio-item">`;
  html += `<input type="radio" name="screenshotMode" value="regionSelect" ${settings.screenshotMode === "regionSelect" ? "checked" : ""}>`;
  html += `<div><div class="qsa-radio-label">Region select</div>`;
  html += `<div class="qsa-radio-desc">Manual only. Use the hotkey to draw a specific capture area</div></div>`;
  html += `</label>`;

  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Region Select Hotkey</div>`;
  html += `<div class="qsa-field">`;
  html += `<div class="qsa-hotkey-input" id="qsa-region-hotkey" tabindex="0">${settings.regionSelectHotkey || "Alt+Shift+S"}</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Click and press your desired key combination</div>`;
  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Include screenshot in AI call</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-include-screenshot" ${settings.includeScreenshot !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Only works with vision-capable models. Region select stays manual even when enabled.</div>`;
  html += `</div>`;

  section.innerHTML = html;

  section.querySelectorAll('input[name="screenshotMode"]').forEach(radio => {
    radio.addEventListener("change", () => saveSetting("screenshotMode", radio.value));
  });

  document.getElementById("qsa-include-screenshot").addEventListener("change", (e) => {
    saveSetting("includeScreenshot", e.target.checked);
  });

  initHotkeyRecorder("qsa-region-hotkey", "regionSelectHotkey");
}

function initHotkeyRecorder(elementId, settingKey) {
  const el = document.getElementById(elementId);
  let recording = false;

  el.addEventListener("click", () => {
    recording = true;
    el.classList.add("recording");
    el.textContent = "Press keys...";
  });

  el.addEventListener("keydown", (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    const key = e.key;
    if (!["Control", "Alt", "Shift", "Meta"].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      const combo = parts.join("+");
      el.textContent = combo;
      el.classList.remove("recording");
      recording = false;
      saveSetting(settingKey, combo);
    }
  });

  el.addEventListener("blur", () => {
    if (recording) {
      el.classList.remove("recording");
      recording = false;
    }
  });
}
