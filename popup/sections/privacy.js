import { saveSetting } from "../popup.js";

export function initPrivacySection(settings) {
  const section = document.getElementById("section-privacy");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Privacy Controls</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Never send full page URL to AI</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-strip-url" ${settings.stripUrl ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Strips URL to domain only before sending</div>`;

  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Option anonymisation is not available in this build.</div>`;

  html += `</div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-info">`;
  html += `Sign-in with Google is required before the extension will solve questions. `;
  html += `This extension sends prompts directly to the configured AI provider and Firebase when you use the sidebar. `;
  html += `It does not proxy requests through its own backend. Provider credentials may be bundled with the extension or stored locally depending on configuration.`;
  html += `</div>`;

  section.innerHTML = html;

  document.getElementById("qsa-strip-url").addEventListener("change", (e) => {
    saveSetting("stripUrl", e.target.checked);
  });

}
