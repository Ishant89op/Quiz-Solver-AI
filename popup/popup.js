import { initProviderSection } from "./sections/provider.js";
import { initDisplaySection } from "./sections/display.js";
import { initScreenshotSection } from "./sections/screenshot.js";
import { initDetectionSection } from "./sections/detection.js";
import { initTriggerSection } from "./sections/trigger.js";
import { initPrivacySection } from "./sections/privacy.js";
import { initAppearanceSection } from "./sections/appearance.js";

const STORAGE_PREFIX = "qsa_";
const DEFAULT_SETTINGS = {
  provider: "openai",
  displayMode: "floatingDot",
  screenshotMode: "autoCapture",
  enabled: true,
  autoFillEnabled: false,
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
  hideSidebarHandle: false,
  stripUrl: false,
  anonymiseOptions: false,
  temperature: 0.3,
  activationHotkey: "Alt+Shift+A",
  regionSelectHotkey: "Alt+Shift+S"
};

document.addEventListener("DOMContentLoaded", () => {
  bootstrapPopup().catch((err) => {
    console.error("[Quiz Solver AI] Popup bootstrap failed:", err);
    renderPopupFatalError(err);
  });
});

async function bootstrapPopup() {
  let settings = { ...DEFAULT_SETTINGS };

  try {
    settings = await loadSettings();
  } catch (err) {
    console.error("[Quiz Solver AI] Failed to load settings, using defaults:", err);
    renderPopupNotice("Saved settings could not be loaded. Showing safe defaults instead.", "warning");
  }

  applyTheme(settings.theme || "dark");
  initNavigation();
  initMasterToggle(settings);
  setSettingsVisibility(false);
  await initAuthPanel();

  await initSection("section-provider", settings, initProviderSection, "Provider settings");
  await initSection("section-display", settings, initDisplaySection, "Display settings");
  await initSection("section-screenshot", settings, initScreenshotSection, "Capture settings");
  await initSection("section-detection", settings, initDetectionSection, "Detection settings");
  await initSection("section-trigger", settings, initTriggerSection, "Trigger settings");
  await initSection("section-privacy", settings, initPrivacySection, "Privacy settings");
  await initSection("section-appearance", settings, initAppearanceSection, "Theme settings");

  try {
    await updateTokenCounter();
  } catch (err) {
    console.error("[Quiz Solver AI] Failed to update token counter:", err);
    const counter = document.getElementById("qsa-token-counter");
    if (counter) counter.textContent = "Tokens: unavailable";
  }

  updateVersionLabel();
}

async function initSection(sectionId, settings, initializer, label) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  try {
    await initializer(settings);
  } catch (err) {
    console.error(`[Quiz Solver AI] Failed to initialize ${label}:`, err);
    section.innerHTML = `
      <div class="qsa-info" style="border:1px solid rgba(239,68,68,0.22);background:rgba(239,68,68,0.08);color:var(--text-primary);">
        <div style="font-weight:600;margin-bottom:6px;">${label} failed to load</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(err?.message || "Unknown error")}</div>
      </div>
    `;
    renderPopupNotice(`Some settings failed to load. ${label} has been replaced with an error card.`, "error");
  }
}

function initNavigation() {
  const nav = document.getElementById("qsa-nav");
  if (!nav) return;
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
  if (!toggle) return;
  toggle.checked = settings.enabled !== false;
  syncMasterToggleState(toggle.checked);

  toggle.addEventListener("change", () => {
    saveSetting("enabled", toggle.checked);
    syncMasterToggleState(toggle.checked);
  });
}

async function initAuthPanel() {
  renderAuthPanel({ status: "checking" });

  try {
    const response = await sendRuntimeMessage(
      { type: "firebase_get_user" },
      { timeoutMs: 4000, timeoutMessage: "Sign-in check timed out. Please try again." }
    );

    if (response?.user) {
      renderAuthPanel({ status: "signed_in", user: response.user });
      return "signed_in";
    }

    renderAuthPanel({
      status: "signed_out",
      error: response?.error || ""
    });
    return "signed_out";
  } catch (err) {
    renderAuthPanel({
      status: "signed_out",
      error: err?.message || "Could not verify sign-in status."
    });
    return "signed_out";
  }
}

async function updateTokenCounter() {
  const counter = document.getElementById("qsa-token-counter");
  if (!counter) return;

  try {
    const response = await sendRuntimeMessage(
      { type: "firebase_get_daily_usage" },
      { timeoutMs: 5000, timeoutMessage: "Failed to load daily usage." }
    );

    if (response?.usage) {
      const usage = response.usage;
      const used = Number(usage.tokens || 0).toLocaleString();
      counter.textContent = usage.unlimited
        ? `Today: ~${used} / Unlimited`
        : `Today: ~${used} / ${Number(usage.limit || 100000).toLocaleString()}`;
      return;
    }

    if (response?.error) {
      throw new Error(response.error);
    }

    counter.textContent = "Today: unavailable";
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();
    counter.textContent = /not logged in|sign in/.test(message)
      ? "Today: sign in required"
      : "Today: unavailable";
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);
  const settings = { ...DEFAULT_SETTINGS };
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

function syncMasterToggleState(enabled) {
  const popup = document.getElementById("qsa-popup");
  if (!popup) return;
  popup.dataset.extensionEnabled = enabled ? "true" : "false";

  if (enabled) {
    renderPopupNotice("");
    return;
  }

  renderPopupNotice("Extension is off. Page scanning, the sidebar, hotkeys, and answer displays stay disabled until you turn it back on.", "warning");
}

function updateVersionLabel() {
  const versionEl = document.getElementById("qsa-version");
  if (!versionEl) return;
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
}

function renderAuthPanel({ status, user = null, error = "" }) {
  const content = document.getElementById("qsa-content");
  if (!content) return;
  setSettingsVisibility(status === "signed_in");

  let panel = document.getElementById("qsa-auth-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "qsa-auth-panel";
    content.parentElement?.insertBefore(panel, content);
  }

  panel.style.cssText = [
    "margin: 10px 16px 0",
    "padding: 12px",
    "border: 1px solid rgba(255,255,255,0.06)",
    "background: var(--bg-secondary)",
    "border-radius: 10px",
    "display: flex",
    "flex-direction: column",
    "gap: 8px"
  ].join(";");

  const title = status === "signed_in" ? "Signed in" : status === "checking" ? "Checking sign-in" : "Sign-in required";
  const description = status === "signed_in"
    ? (user?.email || user?.displayName || "Your Google session is active.")
    : status === "checking"
      ? "Checking your Google session."
      : "Google sign-in is required before solving questions and saving Firestore chats.";

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div>
        <div style="font-weight:600;font-size:12px;color:var(--text-primary);">${escapeHtml(title)}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-top:3px;">${escapeHtml(description)}</div>
      </div>
      <div id="qsa-auth-panel-action" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;"></div>
    </div>
    <div id="qsa-auth-panel-status" style="min-height:16px;font-size:11px;color:${error ? "#fca5a5" : "var(--text-muted)"};">${escapeHtml(error || "")}</div>
  `;

  const action = document.getElementById("qsa-auth-panel-action");
  if (!action) return;

  const openSidebarBtn = document.createElement("button");
  openSidebarBtn.className = "qsa-btn qsa-btn-sm qsa-btn-outline";
  openSidebarBtn.style.whiteSpace = "nowrap";
  openSidebarBtn.textContent = "Open Sidebar";
  openSidebarBtn.addEventListener("click", async () => {
    await openSidebarOnCurrentTab();
  });

  if (status === "checking") {
    const wait = document.createElement("div");
    wait.style.cssText = "font-size:11px;color:var(--text-muted);white-space:nowrap;";
    wait.textContent = "Please wait…";
    action.appendChild(wait);
    action.appendChild(openSidebarBtn);
    return;
  }

  const button = document.createElement("button");
  button.className = "qsa-btn qsa-btn-sm";
  button.style.whiteSpace = "nowrap";

  if (status === "signed_in") {
    button.textContent = "Sign out";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const statusEl = document.getElementById("qsa-auth-panel-status");
      if (statusEl) statusEl.textContent = "";

      try {
        await sendRuntimeMessage({ type: "firebase_logout" }, { timeoutMs: 4000, timeoutMessage: "Sign-out timed out. Please try again." });
        renderAuthPanel({ status: "signed_out" });
        updateTokenCounter().catch(() => {});
      } catch (err) {
        button.disabled = false;
        if (statusEl) statusEl.textContent = err?.message || "Failed to sign out.";
      }
    });
  } else {
    button.textContent = "Sign in with Google";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Signing in...";
      const statusEl = document.getElementById("qsa-auth-panel-status");
      if (statusEl) statusEl.textContent = "";

      try {
        const response = await sendRuntimeMessage(
          { type: "firebase_login" },
          { timeoutMs: 120000, timeoutMessage: "Google sign-in timed out. Please try again." }
        );

        if (response?.user) {
          renderAuthPanel({ status: "signed_in", user: response.user });
          updateTokenCounter().catch(() => {});
          return;
        }

        renderAuthPanel({
          status: "signed_out",
          error: response?.error || "Sign-in failed."
        });
      } catch (err) {
        renderAuthPanel({
          status: "signed_out",
          error: err?.message || "Sign-in failed."
        });
        updateTokenCounter().catch(() => {});
      }
    });
  }

  action.appendChild(button);
  action.appendChild(openSidebarBtn);
}

function setSettingsVisibility(isSignedIn) {
  const nav = document.getElementById("qsa-nav");
  const content = document.getElementById("qsa-content");
  if (nav) nav.style.display = isSignedIn ? "flex" : "none";
  if (content) content.style.display = isSignedIn ? "block" : "none";
}

function renderPopupNotice(message, tone = "warning") {
  const content = document.getElementById("qsa-content");
  if (!content) return;

  let notice = document.getElementById("qsa-popup-notice");
  if (!message) {
    notice?.remove();
    return;
  }

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "qsa-popup-notice";
    content.parentElement?.insertBefore(notice, content);
  }

  const palette = tone === "error"
    ? {
        border: "rgba(239,68,68,0.22)",
        background: "rgba(239,68,68,0.08)"
      }
    : {
        border: "rgba(245,158,11,0.22)",
        background: "rgba(245,158,11,0.08)"
      };

  notice.style.cssText = [
    "margin: 10px 16px 0",
    "padding: 10px 12px",
    `border: 1px solid ${palette.border}`,
    `background: ${palette.background}`,
    "border-radius: 8px",
    "font-size: 12px",
    "line-height: 1.5",
    "color: var(--text-primary)"
  ].join(";");
  notice.textContent = message;
}

async function openSidebarOnCurrentTab() {
  const popup = document.getElementById("qsa-popup");
  if (popup?.dataset.extensionEnabled === "false") {
    renderPopupNotice("Extension is off. Turn it on before opening the sidebar.", "warning");
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab");
    }

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: "open_sidebar" }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

    if (response?.disabled) {
      renderPopupNotice("Extension is off on this page. Turn it on and reload the tab.", "warning");
      return;
    }

    if (response?.ok) {
      renderPopupNotice("");
      return;
    }

    renderPopupNotice("Could not open the sidebar on this tab. Reload the page and try again.", "warning");
  } catch (err) {
    console.warn("[Quiz Solver AI] Failed to open sidebar:", err);
    renderPopupNotice("Could not open the sidebar on this tab. Reload the page and try again.", "warning");
  }
}

function sendRuntimeMessage(message, options = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let timeoutId = null;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        reject(new Error(options.timeoutMessage || "Request timed out"));
      }, options.timeoutMs);
    }

    chrome.runtime.sendMessage(message, (response) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function renderPopupFatalError(err) {
  renderPopupNotice("The settings popup hit a startup error. Reload the extension page and reopen the popup.", "error");
  const activeSection = document.querySelector(".qsa-section.active") || document.getElementById("section-provider");
  if (!activeSection) return;

  activeSection.innerHTML = `
    <div class="qsa-info" style="border:1px solid rgba(239,68,68,0.22);background:rgba(239,68,68,0.08);color:var(--text-primary);">
      <div style="font-weight:600;margin-bottom:6px;">Popup startup failed</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(err?.message || "Unknown error")}</div>
    </div>
  `;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

export function saveSetting(key, value) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}${key}`]: value });
}

export function saveModel(provider, model) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}model_${provider}`]: model });
}

export function saveTemperature(provider, temp) {
  chrome.storage.local.set({ [`${STORAGE_PREFIX}temperature_${provider}`]: temp });
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
