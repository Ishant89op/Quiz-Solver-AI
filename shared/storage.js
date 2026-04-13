import { STORAGE_PREFIX, DEFAULT_SETTINGS } from "./constants.js";

function prefixKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

export async function get(key) {
  const prefixed = prefixKey(key);
  const result = await chrome.storage.local.get(prefixed);
  return result[prefixed];
}

export async function set(key, value) {
  const prefixed = prefixKey(key);
  await chrome.storage.local.set({ [prefixed]: value });
}

export async function remove(key) {
  const prefixed = prefixKey(key);
  await chrome.storage.local.remove(prefixed);
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(null);
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const cleanKey = key.slice(STORAGE_PREFIX.length);
      settings[cleanKey] = value;
    }
  }
  return settings;
}

export async function saveSettings(settingsObj) {
  const toStore = {};
  for (const [key, value] of Object.entries(settingsObj)) {
    toStore[prefixKey(key)] = value;
  }
  await chrome.storage.local.set(toStore);
}

export async function getApiKey(provider) {
  try {
    const { getKey, hasKey } = await import("./keys.js");
    if (hasKey(provider)) {
      return getKey(provider);
    }
  } catch {
    // vault module unavailable, skip
  }
  return await get(`apikey_${provider}`);
}

export async function getModel(provider) {
  return await get(`model_${provider}`);
}

export async function setModel(provider, model) {
  await set(`model_${provider}`, model);
}

export async function getCustomEndpoint() {
  return await get("custom_endpoint");
}

export async function setCustomEndpoint(url) {
  await set("custom_endpoint", url);
}

export async function getTemperature(provider) {
  const val = await get(`temperature_${provider}`);
  return val !== undefined ? val : DEFAULT_SETTINGS.temperature;
}

export async function setTemperature(provider, temp) {
  await set(`temperature_${provider}`, temp);
}

export async function getHistory() {
  const history = await get("history");
  return history || [];
}

export async function addHistoryEntry(entry) {
  const history = await getHistory();
  history.push({
    ...entry,
    timestamp: Date.now()
  });
  if (history.length > 500) {
    history.splice(0, history.length - 500);
  }
  await set("history", history);
}

export async function clearHistory() {
  await set("history", []);
}

export async function getTokenCount() {
  const count = await get("session_tokens");
  return count || 0;
}

export async function addTokens(count) {
  const current = await getTokenCount();
  await set("session_tokens", current + count);
}

export async function resetTokenCount() {
  await set("session_tokens", 0);
}

export async function getAnswerCache() {
  const cache = await get("answer_cache");
  return cache || {};
}

export async function setCachedAnswer(hash, answer) {
  const cache = await getAnswerCache();
  cache[hash] = { ...answer, cachedAt: Date.now() };
  await set("answer_cache", cache);
}

export async function getCachedAnswer(hash) {
  const cache = await getAnswerCache();
  return cache[hash] || null;
}
