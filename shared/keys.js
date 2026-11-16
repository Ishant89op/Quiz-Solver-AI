// CHANGE: add your API keys below. These will be replaced by a backend fetch later.
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
  return _VAULT[provider] || "";
}

export function hasKey(provider) {
  return !!_VAULT[provider];
}

export function getAllProviders() {
  return Object.keys(_VAULT).filter(p => !!_VAULT[p]);
}
