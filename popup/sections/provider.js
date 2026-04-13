import { saveSetting, saveApiKey, saveModel, saveTemperature, getApiKey, getModel, getTemperature } from "../popup.js";

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
    { id: "gpt-4o", label: "GPT-4o", vision: true },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", vision: true },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", vision: true },
    { id: "o3", label: "o3", vision: true },
    { id: "o4-mini", label: "o4 Mini", vision: true }
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true }
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
    { id: "mistral-large-latest", label: "Mistral Large", vision: false }
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", vision: false },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", vision: false },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", vision: false },
    { id: "gemma2-9b-it", label: "Gemma 2 9B", vision: false }
  ],
  openrouter: [],
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
  openrouter: "",
  ollama: "",
  custom: ""
};

const NO_KEY_PROVIDERS = ["ollama"];

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
  const apiKey = await getApiKey(provider);
  const currentModel = await getModel(provider);
  const temperature = await getTemperature(provider);

  let html = "";

  if (!NO_KEY_PROVIDERS.includes(provider)) {
    html += `<div class="qsa-field">`;
    html += `<div class="qsa-label">API Key</div>`;
    html += `<input type="password" class="qsa-input qsa-input-password" id="qsa-api-key" value="${apiKey}" placeholder="Enter your API key">`;
    html += `</div>`;
  }

  if (provider === "custom") {
    const stored = await chrome.storage.local.get("qsa_custom_endpoint");
    const endpoint = stored.qsa_custom_endpoint || "";
    html += `<div class="qsa-field">`;
    html += `<div class="qsa-label">Custom Endpoint URL</div>`;
    html += `<input type="text" class="qsa-input" id="qsa-custom-endpoint" value="${endpoint}" placeholder="http://localhost:1234">`;
    html += `</div>`;
  }

  html += `<div class="qsa-field">`;
  html += `<div class="qsa-label">Model <span class="qsa-badge qsa-badge-vision" id="qsa-vision-badge" style="display:none;">[V]</span></div>`;

  if (provider === "openrouter") {
    html += `<input type="text" class="qsa-input" id="qsa-model-input" value="${currentModel}" placeholder="meta-llama/llama-3.3-70b-instruct:free">`;
    html += `<a href="https://openrouter.ai/models" target="_blank" class="qsa-link" style="margin-top:4px;display:inline-block;">Browse models on OpenRouter</a>`;
  } else if (provider === "ollama") {
    html += `<select class="qsa-select" id="qsa-model-select"><option value="">Loading...</option></select>`;
    html += `<div class="qsa-field" style="margin-top:8px;">`;
    html += `<input type="text" class="qsa-input" id="qsa-model-input" value="${currentModel}" placeholder="Or type model name manually">`;
    html += `</div>`;
  } else if (provider === "custom") {
    html += `<input type="text" class="qsa-input" id="qsa-model-input" value="${currentModel}" placeholder="model-name">`;
  } else {
    const models = MODELS[provider] || [];
    html += `<select class="qsa-select" id="qsa-model-select">`;
    for (const m of models) {
      const selected = m.id === (currentModel || DEFAULT_MODELS[provider]) ? "selected" : "";
      html += `<option value="${m.id}" ${selected}>${m.label}${m.vision ? " [V]" : ""}</option>`;
    }
    html += `</select>`;
    html += `<div class="qsa-field" style="margin-top:8px;">`;
    html += `<input type="text" class="qsa-input" id="qsa-model-input" value="" placeholder="Or enter custom model ID">`;
    html += `</div>`;
  }
  html += `</div>`;

  html += `<div class="qsa-field">`;
  html += `<div class="qsa-label">Temperature</div>`;
  html += `<div class="qsa-slider-container">`;
  html += `<input type="range" class="qsa-slider" id="qsa-temperature" min="0" max="1" step="0.05" value="${temperature}">`;
  html += `<span class="qsa-slider-value" id="qsa-temp-value">${temperature}</span>`;
  html += `</div></div>`;

  container.innerHTML = html;

  const apiKeyInput = document.getElementById("qsa-api-key");
  if (apiKeyInput) {
    apiKeyInput.addEventListener("change", () => saveApiKey(provider, apiKeyInput.value));
  }

  const customEndpoint = document.getElementById("qsa-custom-endpoint");
  if (customEndpoint) {
    customEndpoint.addEventListener("change", () => {
      chrome.storage.local.set({ qsa_custom_endpoint: customEndpoint.value });
    });
  }

  const modelSelect = document.getElementById("qsa-model-select");
  if (modelSelect) {
    modelSelect.addEventListener("change", () => {
      saveModel(provider, modelSelect.value);
      updateVisionBadge(provider, modelSelect.value);
    });

    if (provider === "ollama") {
      fetchOllamaModels(modelSelect, currentModel);
    }
  }

  const modelInput = document.getElementById("qsa-model-input");
  if (modelInput) {
    modelInput.addEventListener("change", () => {
      if (modelInput.value.trim()) {
        saveModel(provider, modelInput.value.trim());
      }
    });
  }

  const tempSlider = document.getElementById("qsa-temperature");
  const tempValue = document.getElementById("qsa-temp-value");
  tempSlider.addEventListener("input", () => {
    tempValue.textContent = tempSlider.value;
  });
  tempSlider.addEventListener("change", () => {
    saveTemperature(provider, parseFloat(tempSlider.value));
  });

  updateVisionBadge(provider, currentModel || DEFAULT_MODELS[provider]);
}

function updateVisionBadge(provider, modelId) {
  const badge = document.getElementById("qsa-vision-badge");
  if (!badge) return;

  const models = MODELS[provider] || [];
  const model = models.find(m => m.id === modelId);
  badge.style.display = (model && model.vision) ? "inline" : "none";
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
      selectEl.innerHTML = `<option value="">No models found - use text input below</option>`;
    }
  } catch {
    selectEl.innerHTML = `<option value="">Ollama not reachable - use text input below</option>`;
  }
}

async function testConnection() {
  const statusEl = document.getElementById("qsa-connection-status");
  const btn = document.getElementById("qsa-test-connection");
  const provider = document.getElementById("qsa-provider-select").value;

  btn.disabled = true;
  btn.textContent = "Testing...";
  statusEl.innerHTML = `<div class="qsa-status"><span class="qsa-loading"></span> Testing...</div>`;

  const apiKey = document.getElementById("qsa-api-key")?.value || "";
  const modelSelect = document.getElementById("qsa-model-select");
  const modelInput = document.getElementById("qsa-model-input");
  const model = modelInput?.value || modelSelect?.value || "";
  const customEndpoint = document.getElementById("qsa-custom-endpoint")?.value || "";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "test_connection",
      provider,
      apiKey,
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
