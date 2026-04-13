import { saveSetting } from "../popup.js";

export function initTriggerSection(settings) {
  const section = document.getElementById("section-trigger");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Activation</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Auto-trigger on question change</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-auto-trigger" ${settings.autoTrigger !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Only after user interacts with answer</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-trigger-interaction" ${settings.triggerAfterInteraction ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `</div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Activation Hotkey</div>`;
  html += `<div class="qsa-field">`;
  html += `<div class="qsa-hotkey-input" id="qsa-activation-hotkey" tabindex="0">${settings.activationHotkey || "Alt+Shift+A"}</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Click and press your desired key combination</div>`;
  html += `</div></div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-info">`;
  html += `Use the activation hotkey to manually trigger answer solving when auto-trigger is disabled, or to force re-check a question.`;
  html += `</div>`;

  section.innerHTML = html;

  document.getElementById("qsa-auto-trigger").addEventListener("change", (e) => {
    saveSetting("autoTrigger", e.target.checked);
  });

  document.getElementById("qsa-trigger-interaction").addEventListener("change", (e) => {
    saveSetting("triggerAfterInteraction", e.target.checked);
  });

  initHotkeyRecorder("qsa-activation-hotkey", "activationHotkey");
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
