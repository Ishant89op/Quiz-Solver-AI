export const EXTENSION_NAME = "Quiz Solver AI";
export const STORAGE_PREFIX = "qsa_";
export const CLASS_PREFIX = "qsa-";

export const PROVIDERS = {
  CLAUDE: "claude",
  OPENAI: "openai",
  GEMINI: "gemini",
  QWEN: "qwen",
  MISTRAL: "mistral",
  GROQ: "groq",
  OPENROUTER: "openrouter",
  OLLAMA: "ollama",
  CUSTOM: "custom"
};

export const PROVIDER_LABELS = {
  [PROVIDERS.CLAUDE]: "Claude (Anthropic)",
  [PROVIDERS.OPENAI]: "OpenAI",
  [PROVIDERS.GEMINI]: "Google Gemini",
  [PROVIDERS.QWEN]: "Qwen (Alibaba)",
  [PROVIDERS.MISTRAL]: "Mistral",
  [PROVIDERS.GROQ]: "Groq",
  [PROVIDERS.OPENROUTER]: "OpenRouter",
  [PROVIDERS.OLLAMA]: "Ollama (Local)",
  [PROVIDERS.CUSTOM]: "Custom OpenAI-compatible"
};

export const PROVIDER_ENDPOINTS = {
  [PROVIDERS.CLAUDE]: "https://api.anthropic.com/v1/messages",
  [PROVIDERS.OPENAI]: "https://api.openai.com/v1/chat/completions",
  [PROVIDERS.GEMINI]: "https://generativelanguage.googleapis.com/v1beta/models",
  [PROVIDERS.QWEN]: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
  [PROVIDERS.MISTRAL]: "https://api.mistral.ai/v1/chat/completions",
  [PROVIDERS.GROQ]: "https://api.groq.com/openai/v1/chat/completions",
  [PROVIDERS.OPENROUTER]: "https://openrouter.ai/api/v1/chat/completions",
  [PROVIDERS.OLLAMA]: "http://localhost:11434/api/chat",
  [PROVIDERS.CUSTOM]: ""
};

export const MODELS = {
  [PROVIDERS.CLAUDE]: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5", vision: true },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", vision: true },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", vision: true }
  ],
  [PROVIDERS.OPENAI]: [
    { id: "gpt-4.1", label: "GPT-4.1", vision: true },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", vision: true },
    { id: "gpt-4o", label: "GPT-4o", vision: true },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", vision: true },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", vision: true },
    { id: "o3", label: "o3", vision: true },
    { id: "o4-mini", label: "o4 Mini", vision: true }
  ],
  [PROVIDERS.GEMINI]: [
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", vision: true },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", vision: true },
    { id: "gemini-3-flash", label: "Gemini 3 Flash", vision: true },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", vision: true },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", vision: true }
  ],
  [PROVIDERS.QWEN]: [
    { id: "qwen-turbo", label: "Qwen Turbo", vision: false },
    { id: "qwen-plus", label: "Qwen Plus", vision: false },
    { id: "qwen-max", label: "Qwen Max", vision: false },
    { id: "qwen-vl-plus", label: "Qwen VL Plus", vision: true }
  ],
  [PROVIDERS.MISTRAL]: [
    { id: "mistral-small-latest", label: "Mistral Small", vision: false },
    { id: "mistral-medium-latest", label: "Mistral Medium", vision: false },
    { id: "mistral-large-latest", label: "Mistral Large", vision: false },
    { id: "pixtral-large-latest", label: "Pixtral Large", vision: true },
    { id: "codestral-latest", label: "Codestral", vision: false }
  ],
  [PROVIDERS.GROQ]: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", vision: false },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", vision: false },
    { id: "llama3-70b-8192", label: "Llama 3 70B", vision: false },
    { id: "llama3-8b-8192", label: "Llama 3 8B", vision: false },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", vision: false },
    { id: "gemma2-9b-it", label: "Gemma 2 9B", vision: false }
  ],
  [PROVIDERS.OPENROUTER]: [
    { id: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash", vision: true },
    { id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro", vision: true },
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", vision: true },
    { id: "anthropic/claude-haiku-4", label: "Claude Haiku 4", vision: true },
    { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", vision: true },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", vision: true },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", vision: false },
    { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (Free)", vision: false },
    { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)", vision: false },
    { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (Free)", vision: false },
    { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (Free)", vision: false },
    { id: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B (Free)", vision: false },
    { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B (Free)", vision: false },
    { id: "microsoft/phi-4:free", label: "Phi-4 (Free)", vision: false },
    { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (Free)", vision: false }
  ],
  [PROVIDERS.OLLAMA]: [
    { id: "llama3", label: "Llama 3 (8B)", vision: false },
    { id: "llama3.1", label: "Llama 3.1 (8B)", vision: false },
    { id: "llama3.2", label: "Llama 3.2 (3B)", vision: false },
    { id: "llama3.2-vision", label: "Llama 3.2 Vision (11B)", vision: true },
    { id: "llama3.3", label: "Llama 3.3 (70B)", vision: false },
    { id: "mistral", label: "Mistral (7B)", vision: false },
    { id: "mixtral", label: "Mixtral 8x7B", vision: false },
    { id: "gemma2", label: "Gemma 2 (9B)", vision: false },
    { id: "gemma3", label: "Gemma 3 (4B)", vision: false },
    { id: "qwen2.5", label: "Qwen 2.5 (7B)", vision: false },
    { id: "phi3", label: "Phi-3 (3.8B)", vision: false },
    { id: "deepseek-r1", label: "DeepSeek R1 (7B)", vision: false },
    { id: "codellama", label: "Code Llama (7B)", vision: false },
    { id: "llava", label: "LLaVA (7B)", vision: true }
  ],
  [PROVIDERS.CUSTOM]: []
};

export const DEFAULT_MODELS = {
  [PROVIDERS.CLAUDE]: "claude-sonnet-4-5",
  [PROVIDERS.OPENAI]: "gpt-4o-mini",
  [PROVIDERS.GEMINI]: "gemini-2.5-flash",
  [PROVIDERS.QWEN]: "qwen-plus",
  [PROVIDERS.MISTRAL]: "mistral-small-latest",
  [PROVIDERS.GROQ]: "llama-3.3-70b-versatile",
  [PROVIDERS.OPENROUTER]: "meta-llama/llama-3.1-8b-instruct:free",
  [PROVIDERS.OLLAMA]: "llama3",
  [PROVIDERS.CUSTOM]: ""
};

export const DISPLAY_MODES = {
  FLOATING_DOT: "floatingDot",
  URL_HASH: "urlHash",
  SIDEBAR: "sidebar",
  NONE: "none"
};

export const DISPLAY_MODE_LABELS = {
  [DISPLAY_MODES.FLOATING_DOT]: "Floating Dot",
  [DISPLAY_MODES.URL_HASH]: "URL Hash",
  [DISPLAY_MODES.SIDEBAR]: "Sidebar Chat",
  [DISPLAY_MODES.NONE]: "None (Auto-fill only)"
};

export const SCREENSHOT_MODES = {
  AUTO_CAPTURE: "autoCapture",
  REGION_SELECT: "regionSelect"
};

export const CONFIDENCE_LEVELS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

export const CONFIDENCE_COLORS = {
  [CONFIDENCE_LEVELS.HIGH]: "#22c55e",
  [CONFIDENCE_LEVELS.MEDIUM]: "#f59e0b",
  [CONFIDENCE_LEVELS.LOW]: "#ef4444"
};

export const THEMES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system"
};

export const QUESTION_TYPES = {
  MCQ_SINGLE: "mcq_single",
  MCQ_MULTI: "mcq_multi",
  FILL_BLANK: "fill_blank",
  SHORT_ANSWER: "short_answer",
  CLOZE: "cloze",
  IMAGE: "image",
  UNKNOWN: "unknown"
};

export const MSG_TYPES = {
  SOLVE_QUESTION: "solve_question",
  TEST_CONNECTION: "test_connection",
  GET_ANSWER: "get_answer",
  ANSWER_RESULT: "answer_result",
  ERROR: "error",
  FETCH_OLLAMA_MODELS: "fetch_ollama_models",
  CAPTURE_TAB: "capture_tab",
  UPDATE_SETTINGS: "update_settings",
  GET_HISTORY: "get_history",
  CLEAR_HISTORY: "clear_history",
  EXPORT_HISTORY: "export_history"
};

export const DEFAULT_SETTINGS = {
  provider: PROVIDERS.OPENAI,
  displayMode: DISPLAY_MODES.FLOATING_DOT,
  screenshotMode: SCREENSHOT_MODES.AUTO_CAPTURE,
  enabled: true,
  autoSolve: false,
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
  theme: THEMES.DARK,
  accentColor: "#6366f1",
  overlayOpacity: 0.92,
  stripUrl: false,
  anonymiseOptions: false,
  temperature: 0.3,
  activationHotkey: "Alt+Shift+A",
  regionSelectHotkey: "Alt+Shift+S"
};

export const VISION_PROVIDERS = [
  PROVIDERS.CLAUDE,
  PROVIDERS.OPENAI,
  PROVIDERS.GEMINI
];

export const SYSTEM_PROMPT = `You are a precise quiz-solving assistant. Analyze the given question and provide the correct answer.

Respond ONLY with valid JSON in this exact format:
{
  "answer": "The correct answer letter or text",
  "explanation": "One sentence explaining why this is correct",
  "confidence": "high | medium | low"
}

Rules:
- For MCQ, return the option letter (A, B, C, D) and the option text
- For fill-in-the-blank, return the exact text to fill in
- For image questions, describe what you see and answer accordingly
- Be concise and definitive
- confidence must be exactly one of: high, medium, low`;
