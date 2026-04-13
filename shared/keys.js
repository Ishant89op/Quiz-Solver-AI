const _SALT = [0x51, 0x73, 0x41, 0x6b, 0x33, 0x79, 0x5f, 0x78, 0x30, 0x72];

function _xor(data, salt) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    result.push(data[i] ^ salt[i % salt.length]);
  }
  return result;
}

function _decode(encoded) {
  if (!encoded) return "";
  try {
    const raw = atob(encoded);
    const bytes = Array.from(raw, c => c.charCodeAt(0));
    const decoded = _xor(bytes, _SALT);
    return String.fromCharCode(...decoded);
  } catch {
    return "";
  }
}

function _encode(plaintext) {
  const bytes = Array.from(plaintext, c => c.charCodeAt(0));
  const xored = _xor(bytes, _SALT);
  return btoa(String.fromCharCode(...xored));
}

// CHANGE: replace each empty string below with the encoded version of your API key.
// To encode a key, open the browser console at the extension popup and run:
//   _encodeKey("sk-your-actual-api-key-here")
// Then paste the output string into the corresponding field below.

const _VAULT = {
  claude:     "",
  openai:     "",
  gemini:     "",
  qwen:       "",
  mistral:    "",
  groq:       "",
  openrouter: "",
  ollama:     "",
  custom:     ""
};

export function getKey(provider) {
  return _decode(_VAULT[provider] || "");
}

export function hasKey(provider) {
  return !!_VAULT[provider];
}

export function getAllProviders() {
  return Object.keys(_VAULT).filter(p => !!_VAULT[p]);
}

export { _encode as encodeKey };
