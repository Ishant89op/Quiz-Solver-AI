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

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Anonymise option text before sending</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-anonymise" ${settings.anonymiseOptions ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `</div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-info">`;
  html += `All API keys are stored locally in your browser. Nothing is sent to any extension servers. `;
  html += `Questions and answers are sent only to the AI provider you configure.`;
  html += `</div>`;

  section.innerHTML = html;

  document.getElementById("qsa-strip-url").addEventListener("change", (e) => {
    saveSetting("stripUrl", e.target.checked);
  });

  document.getElementById("qsa-anonymise").addEventListener("change", (e) => {
    saveSetting("anonymiseOptions", e.target.checked);
  });
}
