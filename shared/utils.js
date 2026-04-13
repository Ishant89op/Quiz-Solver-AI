export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

export function truncate(str, maxLen = 200) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export function cleanText(el) {
  if (!el) return "";
  return (el.innerText || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && style.opacity !== "0"
    && el.offsetWidth > 0
    && el.offsetHeight > 0;
}

export function createEl(tag, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "textContent") {
      el.textContent = val;
    } else if (key === "innerHTML") {
      el.innerHTML = val;
    } else {
      el.setAttribute(key, val);
    }
  }
  return el;
}

export function removeEl(selector) {
  const el = document.querySelector(selector);
  if (el) el.remove();
}

export function stripUrlToOrigin(url) {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function parseJSON(str) {
  try {
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}

export function formatTimestamp(ts) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function supportsVision(provider, modelId) {
  const { MODELS } = getConstants();
  const models = MODELS[provider] || [];
  const model = models.find(m => m.id === modelId);
  if (model) return model.vision;
  return false;
}

let _constants = null;
function getConstants() {
  if (!_constants) {
    try {
      _constants = import("./constants.js");
    } catch {
      _constants = { MODELS: {} };
    }
  }
  return _constants;
}
