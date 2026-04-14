import { callAI } from "./ai/index.js";
import { MSG_TYPES, PROVIDERS, DEFAULT_MODELS, VISION_PROVIDERS, CHAT_SYSTEM_PROMPT } from "../shared/constants.js";
import * as storage from "../shared/storage.js";
import { parseJSON, estimateTokens } from "../shared/utils.js";
import * as firebase from "../shared/firebase.js";

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
  const settings = await storage.getSettings();
  if (settings.enabled === false) {
    return;
  }

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

    // Firebase Auth
    case "firebase_login":
      try {
        const user = await firebase.signInWithGoogle();
        return { type: "firebase_login_success", user };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message };
      }

    case "firebase_logout":
      await firebase.signOut();
      return { type: "firebase_logout_success" };

    case "firebase_get_user":
      try {
        const currentUser = await firebase.getCurrentUser({ verify: false });
        return { type: "firebase_user", user: currentUser };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message || "Failed to check sign-in status" };
      }

    // Firebase Chat CRUD
    case "firebase_get_chats":
      try {
        const user2 = await firebase.getCurrentUser();
        if (!user2) return { type: MSG_TYPES.ERROR, error: "Not logged in" };
        const chats = await firebase.getChats(user2.uid, user2.idToken);
        return { type: "firebase_chats", chats };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message };
      }

    case "firebase_create_chat":
      try {
        const user3 = await firebase.getCurrentUser();
        if (!user3) return { type: MSG_TYPES.ERROR, error: "Not logged in" };
        const chat = await firebase.createChat(user3.uid, user3.idToken, message.title);
        return { type: "firebase_chat_created", chat };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message };
      }

    case "firebase_save_messages":
      try {
        const user4 = await firebase.getCurrentUser();
        if (!user4) return { type: MSG_TYPES.ERROR, error: "Not logged in" };
        await firebase.addMessageToChat(user4.uid, user4.idToken, message.chatId, message.messages);
        return { type: "firebase_messages_saved" };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message };
      }

    case "firebase_delete_chat":
      try {
        const user5 = await firebase.getCurrentUser();
        if (!user5) return { type: MSG_TYPES.ERROR, error: "Not logged in" };
        await firebase.deleteChat(user5.uid, user5.idToken, message.chatId);
        return { type: "firebase_chat_deleted" };
      } catch (err) {
        return { type: MSG_TYPES.ERROR, error: err.message };
      }

    default:
      return { type: MSG_TYPES.ERROR, error: "Unknown message type" };
  }
}

async function solveQuestion(message, sender) {
  const settings = await storage.getSettings();
  const { question, options, questionType, imageBase64, questionHash, userAnswer } = message;
  const currentUser = await firebase.getCurrentUser();

  if (!currentUser) {
    return {
      type: MSG_TYPES.ERROR,
      error: "Sign in with Google in the sidebar to use Quiz Solver AI."
    };
  }

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

  // Keep the captured image available when the selected model can accept vision input.
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
    const { rawResponse, modelUsed, providerUsed } = await requestQuizAnswer(provider, config, prompt, imageData, {
      options
    });
    const parsed = parseJSON(rawResponse);
    const result = normalizeQuizResult(parsed, rawResponse);

    const tokenEstimate = estimateTokens(prompt) + estimateTokens(rawResponse);
    await storage.addTokens(tokenEstimate);

    await storage.setCachedAnswer(questionHash, result);
    await storage.addHistoryEntry({
      question: question.slice(0, 300),
      options: options || [],
      questionType,
      answer: result.answer,
      explanation: result.explanation,
      full: result.full,
      confidence: result.confidence,
      userAnswer: userAnswer || null,
      provider: providerUsed,
      model: modelUsed
    });

    return {
      type: MSG_TYPES.ANSWER_RESULT,
      ...result,
      fromCache: false,
      model: modelUsed,
      provider: providerUsed
    };
  } catch (err) {
    const cached = await storage.getCachedAnswer(questionHash);
    if (cached) {
      return { type: MSG_TYPES.ANSWER_RESULT, ...cached, fromCache: true, fallback: true };
    }
    return { type: MSG_TYPES.ERROR, error: err.message || "AI request failed" };
  }
}

function buildPrompt(question, options, questionType, userAnswer, settings) {
  let prompt = "Answer this quiz using only the extracted data below.\n";
  prompt += "Use every part of the question before deciding.\n\n";
  prompt += "Question-\n";
  prompt += `${question}\n\n`;
  prompt += "Options-\n";
  if (options && options.length > 0) {
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    options.forEach((opt, i) => {
      prompt += `(${labels[i] || i + 1}) ${opt}\n`;
    });
  } else {
    prompt += "None provided\n";
  }

  if (questionType) {
    prompt += `\nQuestion type-\n${questionType}\n`;
  }

  if (userAnswer) {
    prompt += `\nCurrent answer-\n${userAnswer}\n`;
    prompt += "Say whether the current answer is correct.\n";
  }

  prompt += "\nReturn JSON with `only_answer`, `full`, and `confidence`.\n";
  prompt += "`only_answer` must contain just the final answer.\n";
  prompt += "`full` must start with the final answer, then give the full explanation.\n";

  return prompt;
}

function normalizeQuizResult(parsed, rawResponse) {
  const answer = getParsedValue(parsed, ["only_answer", "only-answer", "onlyAnswer", "answer"])
    || rawResponse;
  const full = getParsedValue(parsed, ["full", "full_explanation", "fullExplanation", "explanation"])
    || rawResponse;
  const confidence = normalizeConfidence(getParsedValue(parsed, ["confidence"]));

  return {
    answer: String(answer || "").trim(),
    full: String(full || rawResponse || "").trim(),
    explanation: String(full || rawResponse || "").trim(),
    confidence,
    rawResponse
  };
}

function getParsedValue(parsed, keys) {
  if (!parsed || typeof parsed !== "object") return "";
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeConfidence(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
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
    const { rawResponse } = await requestQuizAnswer(
      provider,
      { ...config, systemPrompt: "Reply briefly and exactly as instructed." },
      "Reply with exactly: connection successful",
      null,
      { allowContentRetry: false }
    );
    const response = rawResponse;
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
  const currentUser = await firebase.getCurrentUser();
  if (!currentUser) {
    return { type: MSG_TYPES.ERROR, error: "Sign in with Google to use the sidebar chat." };
  }
  const settings = await storage.getSettings();
  const provider = settings.provider;
  const apiKey = await storage.getApiKey(provider);
  const model = await storage.getModel(provider) || DEFAULT_MODELS[provider] || "";
  const temperature = await storage.getTemperature(provider);
  const customEndpoint = await storage.getCustomEndpoint();

  const contextPrompt = (conversationHistory || [])
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n") + "\nUser: " + userMessage;

  const config = { apiKey, model, temperature, customEndpoint, systemPrompt: CHAT_SYSTEM_PROMPT };

  try {
    const { rawResponse } = await requestChatResponse(provider, config, contextPrompt);
    const tokenEstimate = estimateTokens(contextPrompt) + estimateTokens(rawResponse);
    await storage.addTokens(tokenEstimate);
    return { type: "chat_response", response: rawResponse };
  } catch (err) {
    return { type: MSG_TYPES.ERROR, error: err.message || "Chat request failed" };
  }
}

async function requestQuizAnswer(provider, config, prompt, imageData, options = {}) {
  const allowContentRetry = options.allowContentRetry !== false;
  const selectedModel = config.model || DEFAULT_MODELS[provider] || "";
  const selectedConfig = {
    ...config,
    model: selectedModel
  };
  const attemptImageData = canUseVisionInput(provider, selectedModel) ? imageData : null;

  let rawResponse = await callAI(provider, selectedConfig, prompt, attemptImageData);

  if (allowContentRetry && shouldRetryForAmbiguousAnswer(rawResponse, options.options || [])) {
    rawResponse = await callAI(
      provider,
      { ...selectedConfig, temperature: 0.1 },
      `${prompt}\n\nChoose the single best answer from the provided options. Do not say that there is not enough information.`,
      attemptImageData
    );

    if (shouldRetryForAmbiguousAnswer(rawResponse, options.options || [])) {
      throw new Error("The selected model could not choose a best answer from the available options.");
    }
  }

  return {
    rawResponse,
    modelUsed: selectedModel,
    providerUsed: provider
  };
}

async function requestChatResponse(provider, config, prompt) {
  const selectedModel = config.model || DEFAULT_MODELS[provider] || "";
  const selectedConfig = {
    ...config,
    model: selectedModel
  };
  const rawResponse = await callAI(provider, selectedConfig, prompt);

  return {
    rawResponse,
    modelUsed: selectedModel,
    providerUsed: provider
  };
}

function canUseVisionInput(provider, model) {
  if (!model) {
    return VISION_PROVIDERS.includes(provider) || provider === PROVIDERS.OPENROUTER;
  }

  if (provider === PROVIDERS.OPENROUTER) {
    return /gemini|gpt-4|gpt-4o|claude|vision|pixtral|llava|qwen-vl/i.test(model);
  }
  if (provider === PROVIDERS.OLLAMA) return /vision|llava/i.test(model);
  return VISION_PROVIDERS.includes(provider);
}

function shouldRetryForAmbiguousAnswer(rawResponse, options) {
  if (!options || options.length === 0) return false;
  const text = (rawResponse || "").toLowerCase();
  return (
    text.includes("not enough information") ||
    text.includes("insufficient information") ||
    text.includes("cannot determine") ||
    text.includes("can't determine")
  );
}
