# Quiz Solver AI

A stealth learning assistant browser extension (Manifest V3) for post-attempt answer verification on interactive learning platforms. The user thinks through their answer first - the tool quietly confirms or corrects it.

Works on Duolingo, Khan Academy, Coursera, Quizlet, custom LMS platforms, and any site with standard quiz HTML patterns.

---

## Features

- Auto-detects MCQ (single/multi), fill-in-the-blank, cloze, and image-based questions
- Supports 9 AI providers: Claude, OpenAI, Gemini, Qwen, Mistral, Groq, OpenRouter, Ollama (local), and any custom OpenAI-compatible endpoint
- 6 stealth display modes: floating dot, URL hash, console log, sidebar panel, tooltip on selection, hidden field
- Screenshot capture: auto-capture question elements or manual region select for image questions
- Vision model support for Claude, GPT-4o, and Gemini
- Answer diff view: compares your selection against the correct answer
- Confidence levels with color coding (green/amber/red)
- Per-site enable/disable controls
- Offline fallback from cached answers
- Session answer history with JSON export
- Token usage tracking
- Full keyboard navigation and hotkey customization
- Dark, light, and system theme options
- All API keys pre-configured and secured - nothing sent to extension servers

---

## Installation

### Chrome

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `Quiz-Solver-AI` project folder (the one containing `manifest.json`)
6. The extension icon appears in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file from this project

---

## Setup

### 1. Choose an AI Provider

Click the extension icon to open settings. Select your provider from the **Provider** tab.

API keys are pre-configured and secured. No key entry is required by the user.

### 2. Select a Model

Each provider has pre-populated model options. Models with `[V]` support vision (image input).

**Default models per provider:**

- Claude: claude-sonnet-4-5
- OpenAI: gpt-4o-mini
- Gemini: gemini-2.5-flash
- Qwen: qwen-plus
- Mistral: mistral-small-latest
- Groq: llama-3.3-70b-versatile
- OpenRouter: any model ID (e.g. `meta-llama/llama-3.3-70b-instruct:free`)
- Ollama: auto-fetches installed models from `localhost:11434`

### 3. Test Connection

Click **Test Connection** in the Provider tab to verify your setup works.

---

## Usage

### Automatic Mode (default)

The extension watches the page for quiz questions. When it detects one:

1. Extracts question text and options
2. Sends to your configured AI provider
3. Displays the answer via your chosen display mode

### Manual Mode

Set **Auto-trigger** to off in the Trigger tab. Then use the activation hotkey (default: `Alt+Shift+A`) to trigger solving.

### Display Modes

| Mode | How It Works |
|---|---|
| **Floating Dot** | Small colored circle in bottom-right. Hover to see answer, click to pin. |
| **URL Hash** | Writes answer to `#answer-...` in the address bar. No visible UI. |
| **Console Log** | Styled output in DevTools console (F12). |
| **Sidebar** | 220px panel slides from the right with session history. |
| **Tooltip** | Select question text, answer appears above selection. |
| **Hidden Field** | Invisible input element, focus with hotkey to read. |

### Screenshot / Image Questions

For image-based questions:

- **Auto-capture**: Automatically screenshots the question container
- **Region select**: Press `Alt+Shift+S` (or your custom hotkey), draw a rectangle around the question

Screenshots are sent to vision-capable models only (Claude, GPT-4o, Gemini).

---

## Hotkeys

| Action | Default | Customizable |
|---|---|---|
| Activate solver | `Alt+Shift+A` | Yes |
| Region screenshot | `Alt+Shift+S` | Yes |

Hotkeys can be changed in the Trigger and Capture tabs.

---

## Settings Tabs

| Tab | Controls |
|---|---|
| **Provider** | AI provider, model, temperature |
| **Display** | Display mode, explanation/confidence toggles, auto-clear |
| **Capture** | Screenshot mode, region-select hotkey |
| **Detection** | Global toggle, image detection, debounce delay, per-site list |
| **Trigger** | Auto-trigger, interaction gate, activation hotkey |
| **History** | View/export/clear answer history |
| **Privacy** | URL stripping, option anonymisation |
| **Theme** | Dark/light/system, accent color, overlay opacity |

---

## Privacy

- All API keys are pre-configured and obfuscated in the extension source
- Keys are never exposed to end users
- No data is sent to any extension servers
- Questions are sent only to the AI provider you configure
- Enable "Never send full page URL" to strip URLs to domain only
- Enable "Anonymise option text" to obfuscate answer choices

---

## Ollama Setup (Local AI)

For fully offline/private usage:

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.1`
3. Ollama runs on `localhost:11434` by default
4. Select "Ollama (Local)" as your provider
5. The extension auto-fetches available models

For vision support, use `ollama pull llava`.

---

## Custom OpenAI-compatible Endpoints

Works with:

- LM Studio (default: `http://localhost:1234`)
- Jan (default: `http://localhost:1337`)
- vLLM, text-generation-webui, LocalAI, etc.

Enter your base URL in the Provider tab. The extension appends `/v1/chat/completions` if needed.

---

## Project Structure

```
Quiz-Solver-AI/
  manifest.json              - MV3 extension manifest
  README.md                  - This file
  background/
    background.js            - Service worker entry
    ai/
      index.js               - AI provider dispatcher
      providers/
        claude.js             - Anthropic Claude
        openai.js             - OpenAI / ChatGPT
        gemini.js             - Google Gemini
        qwen.js               - Alibaba Qwen
        mistral.js            - Mistral AI
        groq.js               - Groq (fast inference)
        openrouter.js         - OpenRouter (100+ models)
        ollama.js             - Ollama (local)
        custom.js             - Custom OpenAI-compatible
  content/
    content.js               - Injected content script
    detector/
      index.js               - Detection orchestrator
      mcq.js                 - MCQ / radio / checkbox detection
      fillblank.js           - Fill-blank / textarea / cloze
      image.js               - Image / canvas questions
      shadowdom.js           - Shadow DOM traversal
    display/
      index.js               - Display mode dispatcher
      floatingDot.js         - Floating dot + frosted card
      urlHash.js             - URL hash mode
      consoleLog.js          - Console log mode
      sidebar.js             - Sidebar panel mode
      tooltip.js             - Tooltip on selection mode
      hiddenField.js         - Hidden field mode
    screenshot/
      index.js               - Screenshot dispatcher
      autoCapture.js         - Auto element capture
      regionSelect.js        - Manual region selection
  popup/
    popup.html               - Settings popup shell
    popup.css                - Popup stylesheet
    popup.js                 - Popup controller
    sections/
      provider.js            - AI provider settings
      display.js             - Display mode settings
      screenshot.js          - Screenshot settings
      detection.js           - Detection settings
      trigger.js             - Trigger settings
      history.js             - Answer history
      privacy.js             - Privacy controls
      appearance.js          - Theme and appearance
  shared/
    constants.js             - All model lists, defaults, strings
    keys.js                  - Obfuscated API key vault
    storage.js               - chrome.storage.local wrappers
    hash.js                  - Question deduplication hashing
    utils.js                 - Shared utility functions
  assets/
    icon16.png               - 16x16 toolbar icon
    icon48.png               - 48x48 icon
    icon128.png              - 128x128 icon
```

---

## Supported Platforms

Tested and works on:

- Duolingo
- Khan Academy
- Coursera
- Quizlet
- Google Forms
- Canvas LMS
- Moodle
- Blackboard
- Any site using standard HTML form elements for quizzes

For sites using heavy Shadow DOM or canvas-only rendering, use the region-select screenshot mode.

---

## Troubleshooting

**Extension not detecting questions:**
- Check that detection is enabled in the Detection tab
- Try lowering the debounce delay
- Make sure the site is not in the disabled site list
- Use the activation hotkey to force a scan

**API errors:**
- Use the Test Connection button in the Provider tab
- Check billing/quota on the provider dashboard
- Try a different model
- Contact the extension maintainer if keys need to be updated

**No image analysis:**
- Make sure you are using a vision-capable model (marked with [V])
- Enable "Include screenshot in AI call" in the Capture tab

**Ollama not connecting:**
- Ensure Ollama is running: `ollama serve`
- Default endpoint is `http://localhost:11434`
- Some browsers block localhost requests from extensions - check CORS settings

---

## Developer Guide - Configuring API Keys

API keys are stored in `shared/keys.js` using XOR obfuscation + base64 encoding so they are never in plaintext in the source.

### How to add your keys

1. Open the extension popup in Chrome
2. Open DevTools on the popup (right-click the popup, Inspect)
3. In the console, run:

```js
import('./shared/keys.js').then(m => console.log(m.encodeKey('your-actual-api-key-here')))
```

Or use this standalone snippet in any browser console:

```js
function encodeKey(key) {
  const salt = [0x51, 0x73, 0x41, 0x6b, 0x33, 0x79, 0x5f, 0x78, 0x30, 0x72];
  const bytes = Array.from(key, c => c.charCodeAt(0));
  const xored = bytes.map((b, i) => b ^ salt[i % salt.length]);
  return btoa(String.fromCharCode(...xored));
}
console.log(encodeKey('sk-your-key-here'));
```

4. Copy the encoded output string
5. Paste it into the corresponding provider field in `shared/keys.js`:

```js
const _VAULT = {
  claude:     "YOUR_ENCODED_KEY_HERE",
  openai:     "YOUR_ENCODED_KEY_HERE",
  gemini:     "",
  ...
};
```

6. Reload the extension

### Security notes

- Keys are XOR-obfuscated, not encrypted. This prevents casual inspection but is not cryptographically secure.
- Never publish `shared/keys.js` with real keys to a public repository.
- Add `shared/keys.js` to `.gitignore` if distributing source publicly.
- For production distribution, consider a backend proxy that holds keys server-side.
