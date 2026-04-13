import { callAI } from "./ai/index.js";
import { MSG_TYPES, PROVIDERS, DEFAULT_MODELS } from "../shared/constants.js";
import * as storage from "../shared/storage.js";
import { parseJSON, estimateTokens } from "../shared/utils.js";

const sessionHistory = [];

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await storage.getSettings();
  if (!settings.provider) {
    await storage.saveSettings({ provider: PROVIDERS.OPENAI });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ type: MSG_TYPES.ERROR, error: err.message || String(err) });
  });
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "activate-solver") {
    chrome.tabs.sendMessage(tab.id, { type: "trigger_solve" });
  } else if (command === "region-select") {
    chrome.tabs.sendMessage(tab.id, { type: "trigger_region_select" });
  }
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case MSG_TYPES.SOLVE_QUESTION:
      return await solveQuestion(message, sender);

    case MSG_TYPES.TEST_CONNECTION:
      return await testConnection(message);

    case MSG_TYPES.FETCH_OLLAMA_MODELS:
      return await fetchOllamaModels();

    case MSG_TYPES.GET_HISTORY:
      return { type: "history_result", history: await storage.getHistory() };

    case MSG_TYPES.CLEAR_HISTORY:
      await storage.clearHistory();
      return { type: "history_cleared" };

    case MSG_TYPES.EXPORT_HISTORY:
      return { type: "history_export", data: await storage.getHistory() };

    case MSG_TYPES.CAPTURE_TAB:
      return await captureTab(sender);

    case "chat_message":
      return await handleChatMessage(message);

    default:
      return { type: MSG_TYPES.ERROR, error: "Unknown message type" };
  }
}

async function solveQuestion(message, sender) {
  const settings = await storage.getSettings();
  const { question, options, questionType, imageBase64, questionHash, userAnswer } = message;

  const cached = await storage.getCachedAnswer(questionHash);
  if (cached) {
    return { type: MSG_TYPES.ANSWER_RESULT, ...cached, fromCache: true };
  }

  const provider = settings.provider;
  const apiKey = await storage.getApiKey(provider);
  const model = await storage.getModel(provider) || DEFAULT_MODELS[provider] || "";
  const temperature = await storage.getTemperature(provider);
  const customEndpoint = await storage.getCustomEndpoint();

  let prompt = buildPrompt(question, options, questionType, userAnswer, settings);

  let imageData = null;
  if (imageBase64 && settings.includeScreenshot) {
    imageData = imageBase64;
  }

  const config = {
    apiKey,
    model,
    temperature,
    customEndpoint,
    stripUrl: settings.stripUrl,
    pageUrl: sender?.tab?.url || ""
  };

  try {
    const rawResponse = await callAI(provider, config, prompt, imageData);
    const parsed = parseJSON(rawResponse);

    const result = parsed || {
      answer: rawResponse,
      explanation: "",
      confidence: "medium"
    };

    const tokenEstimate = estimateTokens(prompt) + estimateTokens(rawResponse);
    await storage.addTokens(tokenEstimate);

    await storage.setCachedAnswer(questionHash, result);
    await storage.addHistoryEntry({
      question: question.slice(0, 300),
      options: options || [],
      questionType,
      answer: result.answer,
      explanation: result.explanation,
      confidence: result.confidence,
      userAnswer: userAnswer || null,
      provider,
      model
    });

    return { type: MSG_TYPES.ANSWER_RESULT, ...result, fromCache: false };
  } catch (err) {
    const cached = await storage.getCachedAnswer(questionHash);
    if (cached) {
      return { type: MSG_TYPES.ANSWER_RESULT, ...cached, fromCache: true, fallback: true };
    }
    return { type: MSG_TYPES.ERROR, error: err.message || "AI request failed" };
  }
}

function buildPrompt(question, options, questionType, userAnswer, settings) {
  let prompt = `Question: ${question}\n`;

  if (options && options.length > 0) {
    prompt += "\nOptions:\n";
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    options.forEach((opt, i) => {
      prompt += `${labels[i] || i + 1}. ${opt}\n`;
    });
  }

  if (questionType) {
    prompt += `\nQuestion type: ${questionType}\n`;
  }

  if (userAnswer) {
    prompt += `\nThe user selected: ${userAnswer}\n`;
    prompt += "Indicate if the user's selection is correct or incorrect.\n";
  }

  return prompt;
}

async function testConnection(message) {
  const { provider, model, customEndpoint } = message;
  const apiKey = await storage.getApiKey(provider);

  const config = {
    apiKey,
    model: model || "test",
    temperature: 0.1,
    customEndpoint
  };

  try {
    const response = await callAI(provider, config, "Reply with exactly: connection successful");
    return { type: "test_result", success: true, response };
  } catch (err) {
    return { type: "test_result", success: false, error: err.message };
  }
}

async function fetchOllamaModels() {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    if (!response.ok) throw new Error("Ollama not reachable");
    const data = await response.json();
    const models = (data.models || []).map(m => ({
      id: m.name,
      label: m.name,
      vision: m.name.includes("llava") || m.name.includes("vision")
    }));
    return { type: "ollama_models", models };
  } catch (err) {
    return { type: "ollama_models", models: [], error: err.message };
  }
}

async function captureTab(sender) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    return { type: "tab_captured", dataUrl };
  } catch (err) {
    return { type: MSG_TYPES.ERROR, error: "Tab capture failed: " + err.message };
  }
}

async function handleChatMessage(message) {
  const { userMessage, conversationHistory } = message;
  const settings = await storage.getSettings();
  const provider = settings.provider;
  const apiKey = await storage.getApiKey(provider);
  const model = await storage.getModel(provider) || DEFAULT_MODELS[provider] || "";
  const temperature = await storage.getTemperature(provider);
  const customEndpoint = await storage.getCustomEndpoint();

  const contextPrompt = (conversationHistory || [])
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n") + "\nUser: " + userMessage;

  const config = { apiKey, model, temperature, customEndpoint };

  try {
    const rawResponse = await callAI(provider, config, contextPrompt);
    const tokenEstimate = estimateTokens(contextPrompt) + estimateTokens(rawResponse);
    await storage.addTokens(tokenEstimate);
    return { type: "chat_response", response: rawResponse };
  } catch (err) {
    return { type: MSG_TYPES.ERROR, error: err.message || "Chat request failed" };
  }
}
