import { saveSetting } from "../popup.js";

export function initDetectionSection(settings) {
  const section = document.getElementById("section-detection");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Question Detection</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Detection enabled</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-detection-enabled" ${settings.detectionEnabled !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `<div class="qsa-toggle-row">`;
  html += `<span class="qsa-toggle-label">Detect image/canvas questions</span>`;
  html += `<label class="qsa-toggle"><input type="checkbox" id="qsa-detect-images" ${settings.detectImages !== false ? "checked" : ""}><span class="qsa-toggle-track"></span></label>`;
  html += `</div>`;

  html += `</div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Debounce Delay</div>`;
  html += `<div class="qsa-slider-container">`;
  html += `<input type="range" class="qsa-slider" id="qsa-debounce" min="200" max="5000" step="100" value="${settings.debounceDelay || 1000}">`;
  html += `<span class="qsa-slider-value" id="qsa-debounce-value">${settings.debounceDelay || 1000}ms</span>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Delay before re-scanning after DOM changes</div>`;
  html += `</div>`;

  html += `<div class="qsa-divider"></div>`;

  html += `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Per-site Settings</div>`;

  html += `<div class="qsa-btn-group">`;
  html += `<button class="qsa-btn qsa-btn-sm qsa-btn-outline" id="qsa-add-site">Add Current Site</button>`;
  html += `</div>`;

  html += `<div class="qsa-site-list" id="qsa-site-list">`;
  const siteList = settings.siteList || [];
  if (siteList.length === 0) {
    html += `<div style="font-size:11px;color:var(--text-muted);padding:8px 0;">No sites configured</div>`;
  } else {
    for (const site of siteList) {
      html += renderSiteItem(site);
    }
  }
  html += `</div></div>`;

  section.innerHTML = html;

  document.getElementById("qsa-detection-enabled").addEventListener("change", (e) => {
    saveSetting("detectionEnabled", e.target.checked);
  });

  document.getElementById("qsa-detect-images").addEventListener("change", (e) => {
    saveSetting("detectImages", e.target.checked);
  });

  const debounce = document.getElementById("qsa-debounce");
  const debounceValue = document.getElementById("qsa-debounce-value");
  debounce.addEventListener("input", () => { debounceValue.textContent = debounce.value + "ms"; });
  debounce.addEventListener("change", () => saveSetting("debounceDelay", parseInt(debounce.value)));

  document.getElementById("qsa-add-site").addEventListener("click", addCurrentSite);
  bindSiteRemoveButtons();
}

function renderSiteItem(site) {
  return `<div class="qsa-site-item" data-host="${site.host}">
    <span>${site.host}</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <label class="qsa-toggle" style="width:28px;height:15px;">
        <input type="checkbox" class="qsa-site-toggle" data-host="${site.host}" ${site.enabled ? "checked" : ""}>
        <span class="qsa-toggle-track" style="border-radius:7px;"></span>
      </label>
      <button class="qsa-site-remove" data-host="${site.host}">x</button>
    </div>
  </div>`;
}

async function addCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch { return; }

  const stored = await chrome.storage.local.get("qsa_siteList");
  const siteList = stored.qsa_siteList || [];

  if (siteList.some(s => s.host === host)) return;

  siteList.push({ host, enabled: true });
  await chrome.storage.local.set({ qsa_siteList: siteList });

  const listEl = document.getElementById("qsa-site-list");
  const noSites = listEl.querySelector("div[style]");
  if (noSites && noSites.textContent.includes("No sites")) noSites.remove();

  listEl.insertAdjacentHTML("beforeend", renderSiteItem({ host, enabled: true }));
  bindSiteRemoveButtons();
}

function bindSiteRemoveButtons() {
  document.querySelectorAll(".qsa-site-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const host = btn.dataset.host;
      const stored = await chrome.storage.local.get("qsa_siteList");
      const siteList = (stored.qsa_siteList || []).filter(s => s.host !== host);
      await chrome.storage.local.set({ qsa_siteList: siteList });
      btn.closest(".qsa-site-item").remove();
    });
  });

  document.querySelectorAll(".qsa-site-toggle").forEach(toggle => {
    toggle.addEventListener("change", async () => {
      const host = toggle.dataset.host;
      const stored = await chrome.storage.local.get("qsa_siteList");
      const siteList = stored.qsa_siteList || [];
      const site = siteList.find(s => s.host === host);
      if (site) site.enabled = toggle.checked;
      await chrome.storage.local.set({ qsa_siteList: siteList });
    });
  });
}
