import { initProviderSection } from "./sections/provider.js";
import { initDisplaySection } from "./sections/display.js";
import { initScreenshotSection } from "./sections/screenshot.js";
import { initDetectionSection } from "./sections/detection.js";
import { initTriggerSection } from "./sections/trigger.js";
import { initHistorySection } from "./sections/history.js";
import { initPrivacySection } from "./sections/privacy.js";
import { initAppearanceSection } from "./sections/appearance.js";

const STORAGE_PREFIX = "qsa_";

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();

  applyTheme(settings.theme || "dark");

  initNavigation();
  initMasterToggle(settings);

  await initProviderSection(settings);
  initDisplaySection(settings);
  initScreenshotSection(settings);
  initDetectionSection(settings);
  initTriggerSection(settings);
  await initHistorySection(settings);
  initPrivacySection(settings);
  initAppearanceSection(settings);

  updateTokenCounter();
});

function initNavigation() {
  const nav = document.getElementById("qsa-nav");
  const buttons = nav.querySelectorAll(".qsa-nav-btn");
  const sections = document.querySelectorAll(".qsa-section");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      sections.forEach(s => s.classList.remove("active"));

      btn.classList.add("active");
      const sectionId = `section-${btn.dataset.section}`;
      document.getElementById(sectionId).classList.add("active");
    });
  });
}

function initMasterToggle(settings) {
  const toggle = document.getElementById("qsa-enabled-toggle");
  toggle.checked = settings.enabled !== false;

  toggle.addEventListener("change", () => {
    saveSetting("enabled", toggle.checked);
  });
}

async function updateTokenCounter() {
  const stored = await chrome.storage.local.get(`${STORAGE_PREFIX}session_tokens`);
  const tokens = stored[`${STORAGE_PREFIX}session_tokens`] || 0;
  document.getElementById("qsa-token-counter").textContent = `Tokens: ~${tokens.toLocaleString()}`;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);
  const defaults = {
    provider: "openai",
    displayMode: "floatingDot",
    screenshotMode: "autoCapture",
    enabled: true,
    autoTrigger: true,
    triggerAfterInteraction: false,
    showExplanation: true,
    showConfidence: true,
    autoClearAnswer: false,
    autoClearDelay: 10,
    includeScreenshot: true,
    detectionEnabled: true,
    detectImages: true,
    debounceDelay: 1000,
    siteList: [],
    theme: "dark",
    accentColor: "#6366f1",
    overlayOpacity: 0.92,
    stripUrl: false,
    anonymiseOptions: false,
    temperature: 0.3,
    activationHotkey: "Alt+Shift+A",
    regionSelectHotkey: "Alt+Shift+S"
  };

  const settings = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      settings[key.slice(STORAGE_PREFIX.length)] = value;
    }
  }
  return settings;
}

function applyTheme(theme) {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function saveSetting(key, value) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}${key}`]: value });
}

export function saveApiKey(provider, key) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}apikey_${provider}`]: key });
}

export function saveModel(provider, model) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}model_${provider}`]: model });
}

export function saveTemperature(provider, temp) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}temperature_${provider}`]: temp });
}

export async function getApiKey(provider) {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}apikey_${provider}`);
  return result[`${STORAGE_PREFIX}apikey_${provider}`] || "";
}

export async function getModel(provider) {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}model_${provider}`);
  return result[`${STORAGE_PREFIX}model_${provider}`] || "";
}

export async function getTemperature(provider) {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}temperature_${provider}`);
  return result[`${STORAGE_PREFIX}temperature_${provider}`] ?? 0.3;
}

export { applyTheme };
