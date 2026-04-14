import { PROVIDERS, SYSTEM_PROMPT } from "../../shared/constants.js";
import { call as callClaude } from "./providers/claude.js";
import { call as callOpenAI } from "./providers/openai.js";
import { call as callGemini } from "./providers/gemini.js";
import { call as callQwen } from "./providers/qwen.js";
import { call as callMistral } from "./providers/mistral.js";
import { call as callGroq } from "./providers/groq.js";
import { call as callOpenRouter } from "./providers/openrouter.js";
import { call as callOllama } from "./providers/ollama.js";
import { call as callCustom } from "./providers/custom.js";

const providerMap = {
  [PROVIDERS.CLAUDE]: callClaude,
  [PROVIDERS.OPENAI]: callOpenAI,
  [PROVIDERS.GEMINI]: callGemini,
  [PROVIDERS.QWEN]: callQwen,
  [PROVIDERS.MISTRAL]: callMistral,
  [PROVIDERS.GROQ]: callGroq,
  [PROVIDERS.OPENROUTER]: callOpenRouter,
  [PROVIDERS.OLLAMA]: callOllama,
  [PROVIDERS.CUSTOM]: callCustom
};

export async function callAI(provider, config, prompt, imageBase64 = null) {
  const handler = providerMap[provider];
  if (!handler) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const fullConfig = {
    ...config,
    systemPrompt: config.systemPrompt || SYSTEM_PROMPT
  };

  try {
    return await handler(fullConfig, prompt, imageBase64);
  } catch (err) {
    const errorMsg = err.message || "Unknown error";
    if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
      throw new Error("Invalid API key - check your key in settings");
    }
    if (errorMsg.includes("403")) {
      throw new Error("Access denied for this model or provider - check model permissions and account access");
    }
    if (errorMsg.includes("429") || errorMsg.includes("rate")) {
      throw new Error("Rate limit reached - wait a moment and try again");
    }
    if (errorMsg.includes("quota") || errorMsg.includes("insufficient")) {
      throw new Error("API quota exceeded - check your billing");
    }
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      throw new Error("Network error - check your connection");
    }
    throw err;
  }
}
