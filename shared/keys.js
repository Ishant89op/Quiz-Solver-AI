// CHANGE: add your API keys below. These will be replaced by a backend fetch later.
const _VAULT = {
  claude:     "",
  openai:     "",
  gemini:     "AIzaSyDb38KjD5cPOQ-Do52z9v3txEimYF-Z_KA",
  qwen:       "",
  mistral:    "",
  groq:       "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",
  openrouter: "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",
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
