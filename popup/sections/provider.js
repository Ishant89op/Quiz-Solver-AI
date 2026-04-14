import { saveSetting, saveModel, saveTemperature, getModel, getTemperature } from "../popup.js";
import { PROVIDERS, PROVIDER_LABELS, MODELS, DEFAULT_MODELS } from "../../shared/constants.js";

export async function initProviderSection(settings) {
  const section = document.getElementById("section-provider");
  const currentProvider = settings.provider || "openai";

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">AI Provider</div>`;
  html += `<div class="qsa-field">`;
  html += `<select class="qsa-select" id="qsa-provider-select">`;
  for (const [key, label] of Object.entries(PROVIDER_LABELS)) {
    html += `<option value="${key}" ${key === currentProvider ? "selected" : ""}>${label}</option>`;
  }
  html += `</select></div></div>`;

  html += `<div id="qsa-provider-config"></div>`;

  html += `<div class="qsa-divider"></div>`;
  html += `<div class="qsa-btn-group">`;
  html += `<button class="qsa-btn qsa-btn-sm qsa-btn-outline" id="qsa-test-connection">Test Connection</button>`;
  html += `</div>`;
  html += `<div id="qsa-connection-status"></div>`;

  section.innerHTML = html;

  await renderProviderConfig(currentProvider);

  document.getElementById("qsa-provider-select").addEventListener("change", async (e) => {
    const provider = e.target.value;
    saveSetting("provider", provider);
    await renderProviderConfig(provider);
  });

  document.getElementById("qsa-test-connection").addEventListener("click", testConnection);
}

async function renderProviderConfig(provider) {
  const container = document.getElementById("qsa-provider-config");
  const currentModel = await getModel(provider);
  const temperature = await getTemperature(provider);
  const effectiveModel = currentModel || DEFAULT_MODELS[provider] || "";
  const usingDefaultModel = !currentModel && !!effectiveModel;

  let html = "";

  html += `<div class="qsa-info" style="margin-bottom:12px;">Some providers may use bundled credentials. Requests go only to the selected provider and selected model. If that exact model fails, the extension shows the real error instead of switching providers.</div>`;

  if (provider === "custom") {
    const stored = await chrome.storage.local.get("qsa_custom_endpoint");
    const endpoint = stored.qsa_custom_endpoint || "";
    html += `<div class="qsa-field">`;
    html += `<div class="qsa-label">Custom Endpoint URL</div>`;
    html += `<input type="text" class="qsa-input" id="qsa-custom-endpoint" value="${endpoint}" placeholder="http://localhost:1234">`;
    html += `</div>`;
  }

  // Model selector (searchable dropdown)
  html += `<div class="qsa-field">`;
  html += `<div class="qsa-label">Model</div>`;

  if (provider === "ollama") {
    html += `<select class="qsa-select" id="qsa-model-select"><option value="">Loading...</option></select>`;
  } else if (provider === "custom") {
    html += `<input type="text" class="qsa-input" id="qsa-model-input-custom" value="${currentModel}" placeholder="model-name">`;
  } else {
    const models = MODELS[provider] || [];
    html += `<div class="qsa-searchable-select" id="qsa-model-wrapper">`;
    html += `<input type="text" class="qsa-input qsa-search-input" id="qsa-model-search" placeholder="Search models..." autocomplete="off">`;
    html += `<div class="qsa-dropdown" id="qsa-model-dropdown">`;
    for (const m of models) {
      const selected = m.id === (currentModel || DEFAULT_MODELS[provider]);
      html += `<div class="qsa-dropdown-item ${selected ? "qsa-dropdown-selected" : ""}" data-value="${m.id}" data-vision="${m.vision}">`;
      html += `${m.label}${m.vision ? ' <span class="qsa-badge-sm">[V]</span>' : ""}`;
      html += `</div>`;
    }
    html += `</div></div>`;
    html += `<div class="qsa-model-current" id="qsa-current-model" style="font-size:11px;color:var(--text-muted);margin-top:4px;">`;
    const activeModel = models.find(m => m.id === effectiveModel);
    if (activeModel) {
      html += usingDefaultModel ? `Effective model: ${activeModel.label} (provider default)` : `Effective model: ${activeModel.label}`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  if (provider === "custom") {
    const customLabel = currentModel
      ? `Effective model: ${currentModel}`
      : "Enter the exact model name to use with this provider.";
    html += `<div class="qsa-model-current" id="qsa-current-model" style="font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:12px;">${customLabel}</div>`;
  } else if (provider === "ollama") {
    const ollamaLabel = effectiveModel
      ? (usingDefaultModel ? `Effective model: ${effectiveModel} (provider default)` : `Effective model: ${effectiveModel}`)
      : "Effective model will be shown after Ollama models load.";
    html += `<div class="qsa-model-current" id="qsa-current-model" style="font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:12px;">${ollamaLabel}</div>`;
  }

  // Temperature
  html += `<div class="qsa-field">`;
  html += `<div class="qsa-label">Temperature</div>`;
  html += `<div class="qsa-slider-container">`;
  html += `<input type="range" class="qsa-slider" id="qsa-temperature" min="0" max="1" step="0.05" value="${temperature}">`;
  html += `<span class="qsa-slider-value" id="qsa-temp-value">${temperature}</span>`;
  html += `</div></div>`;

  container.innerHTML = html;

  // Custom endpoint
  const customEndpoint = document.getElementById("qsa-custom-endpoint");
  if (customEndpoint) {
    customEndpoint.addEventListener("change", () => {
      chrome.storage.local.set({ qsa_custom_endpoint: customEndpoint.value });
    });
  }

  // Custom model input (for "custom" provider only)
  const customModelInput = document.getElementById("qsa-model-input-custom");
  if (customModelInput) {
    customModelInput.addEventListener("change", () => {
      const currentEl = document.getElementById("qsa-current-model");
      if (customModelInput.value.trim()) {
        saveModel(provider, customModelInput.value.trim());
        if (currentEl) {
          currentEl.textContent = `Effective model: ${customModelInput.value.trim()}`;
        }
      } else if (currentEl) {
        currentEl.textContent = "Enter the exact model name to use with this provider.";
      }
    });
  }

  // Ollama: fetch models
  const ollamaSelect = document.getElementById("qsa-model-select");
  if (ollamaSelect && provider === "ollama") {
    fetchOllamaModels(ollamaSelect, currentModel);
    ollamaSelect.addEventListener("change", () => {
      saveModel(provider, ollamaSelect.value);
      const currentEl = document.getElementById("qsa-current-model");
      if (currentEl) {
        currentEl.textContent = `Effective model: ${ollamaSelect.value}`;
      }
    });
  }

  // Searchable dropdown
  const searchInput = document.getElementById("qsa-model-search");
  const dropdown = document.getElementById("qsa-model-dropdown");
  if (searchInput && dropdown) {
    setupSearchableDropdown(provider, searchInput, dropdown);
  }

  // Temperature slider
  const tempSlider = document.getElementById("qsa-temperature");
  const tempValue = document.getElementById("qsa-temp-value");
  tempSlider.addEventListener("input", () => { tempValue.textContent = tempSlider.value; });
  tempSlider.addEventListener("change", () => saveTemperature(provider, parseFloat(tempSlider.value)));
}

function setupSearchableDropdown(provider, searchInput, dropdown) {
  const items = dropdown.querySelectorAll(".qsa-dropdown-item");
  let visible = false;

  searchInput.addEventListener("focus", () => {
    dropdown.style.display = "block";
    visible = true;
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? "" : "none";
    });
  });

  items.forEach(item => {
    item.addEventListener("click", () => {
      const value = item.dataset.value;
      saveModel(provider, value);

      items.forEach(i => i.classList.remove("qsa-dropdown-selected"));
      item.classList.add("qsa-dropdown-selected");

      searchInput.value = "";
      dropdown.style.display = "none";
      visible = false;

      const label = item.textContent.trim();
      const currentEl = document.getElementById("qsa-current-model");
      if (currentEl) currentEl.textContent = `Effective model: ${label}`;
    });
  });

  document.addEventListener("click", (e) => {
    if (visible && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
      visible = false;
    }
  });
}

async function fetchOllamaModels(selectEl, currentModel) {
  try {
    const response = await chrome.runtime.sendMessage({ type: "fetch_ollama_models" });
    if (response && response.models && response.models.length > 0) {
      const preferredModel = currentModel || DEFAULT_MODELS.ollama || "";
      selectEl.innerHTML = "";
      for (const m of response.models) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label + (m.vision ? " [V]" : "");
        if (m.id === preferredModel) opt.selected = true;
        selectEl.appendChild(opt);
      }
      if (!selectEl.value && preferredModel) {
        selectEl.value = preferredModel;
      }
      const activeValue = selectEl.value || preferredModel || "";
      const currentEl = document.getElementById("qsa-current-model");
      if (currentEl && activeValue) {
        const suffix = !currentModel && activeValue === DEFAULT_MODELS.ollama ? " (provider default)" : "";
        currentEl.textContent = `Effective model: ${activeValue}${suffix}`;
      }
    } else {
      selectEl.innerHTML = `<option value="">No models found</option>`;
    }
  } catch {
    selectEl.innerHTML = `<option value="">Ollama not reachable</option>`;
  }
}

async function testConnection() {
  const statusEl = document.getElementById("qsa-connection-status");
  const btn = document.getElementById("qsa-test-connection");
  const provider = document.getElementById("qsa-provider-select").value;

  btn.disabled = true;
  btn.textContent = "Testing...";
  statusEl.innerHTML = `<div class="qsa-status"><span class="qsa-loading"></span> Testing...</div>`;

  const model = await getModel(provider) || DEFAULT_MODELS[provider] || "";
  const customEndpoint = document.getElementById("qsa-custom-endpoint")?.value || "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "test_connection",
      provider,
      model,
      customEndpoint
    });

    if (response && response.success) {
      statusEl.innerHTML = `<div class="qsa-status qsa-status-success"><span class="qsa-status-dot"></span> Connected successfully</div>`;
    } else {
      statusEl.innerHTML = `<div class="qsa-status qsa-status-error"><span class="qsa-status-dot"></span> ${response?.error || "Connection failed"}</div>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<div class="qsa-status qsa-status-error"><span class="qsa-status-dot"></span> ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "Test Connection";
}
