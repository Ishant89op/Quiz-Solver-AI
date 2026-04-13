import { saveSetting, saveModel, saveTemperature, getModel, getTemperature } from "../popup.js";

const PROVIDERS = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  qwen: "Qwen (Alibaba)",
  mistral: "Mistral",
  groq: "Groq",
  openrouter: "OpenRouter",
  ollama: "Ollama (Local)",
  custom: "Custom OpenAI-compatible"
};

const MODELS = {
  claude: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5", vision: true },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", vision: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", vision: true }
  ],
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1", vision: true },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", vision: true },
    { id: "gpt-4o", label: "GPT-4o", vision: true },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", vision: true },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", vision: true },
    { id: "o3", label: "o3", vision: true },
    { id: "o4-mini", label: "o4 Mini", vision: true }
  ],
  gemini: [
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", vision: true },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", vision: true },
    { id: "gemini-3-flash", label: "Gemini 3 Flash", vision: true },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", vision: true },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", vision: true }
  ],
  qwen: [
    { id: "qwen-turbo", label: "Qwen Turbo", vision: false },
    { id: "qwen-plus", label: "Qwen Plus", vision: false },
    { id: "qwen-max", label: "Qwen Max", vision: false },
    { id: "qwen-vl-plus", label: "Qwen VL Plus", vision: true }
  ],
  mistral: [
    { id: "mistral-small-latest", label: "Mistral Small", vision: false },
    { id: "mistral-medium-latest", label: "Mistral Medium", vision: false },
    { id: "mistral-large-latest", label: "Mistral Large", vision: false },
    { id: "pixtral-large-latest", label: "Pixtral Large", vision: true },
    { id: "codestral-latest", label: "Codestral", vision: false }
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", vision: false },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", vision: false },
    { id: "llama3-70b-8192", label: "Llama 3 70B", vision: false },
    { id: "llama3-8b-8192", label: "Llama 3 8B", vision: false },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", vision: false },
    { id: "gemma2-9b-it", label: "Gemma 2 9B", vision: false }
  ],
  openrouter: [
    { id: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash", vision: true },
    { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro", vision: true },
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", vision: true },
    { id: "anthropic/claude-haiku-4", label: "Claude Haiku 4", vision: true },
    { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", vision: true },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", vision: false },
    { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (Free)", vision: false },
    { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)", vision: false },
    { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (Free)", vision: false },
    { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Free)", vision: false },
    { id: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B (Free)", vision: false },
    { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B (Free)", vision: false },
    { id: "microsoft/phi-4:free", label: "Phi-4 (Free)", vision: false },
    { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (Free)", vision: false }
  ],
  ollama: [],
  custom: []
};

const DEFAULT_MODELS = {
  claude: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  qwen: "qwen-plus",
  mistral: "mistral-small-latest",
  groq: "llama-3.3-70b-versatile",
  openrouter: "meta-llama/llama-3.1-8b-instruct:free",
  ollama: "",
  custom: ""
};

export async function initProviderSection(settings) {
  const section = document.getElementById("section-provider");
  const currentProvider = settings.provider || "openai";

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">AI Provider</div>`;
  html += `<div class="qsa-field">`;
  html += `<select class="qsa-select" id="qsa-provider-select">`;
  for (const [key, label] of Object.entries(PROVIDERS)) {
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

  let html = "";

  html += `<div class="qsa-info" style="margin-bottom:12px;">API key is pre-configured and secured.</div>`;

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
    const activeModel = models.find(m => m.id === (currentModel || DEFAULT_MODELS[provider]));
    html += activeModel ? `Selected: ${activeModel.label}` : "";
    html += `</div>`;
  }
  html += `</div>`;

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
      if (customModelInput.value.trim()) saveModel(provider, customModelInput.value.trim());
    });
  }

  // Ollama: fetch models
  const ollamaSelect = document.getElementById("qsa-model-select");
  if (ollamaSelect && provider === "ollama") {
    fetchOllamaModels(ollamaSelect, currentModel);
    ollamaSelect.addEventListener("change", () => saveModel(provider, ollamaSelect.value));
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
      if (currentEl) currentEl.textContent = `Selected: ${label}`;
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
      selectEl.innerHTML = "";
      for (const m of response.models) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label + (m.vision ? " [V]" : "");
        if (m.id === currentModel) opt.selected = true;
        selectEl.appendChild(opt);
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
