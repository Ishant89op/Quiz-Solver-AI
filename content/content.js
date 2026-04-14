(function () {
  const DEBOUNCE_DEFAULT = 1000;
  const DEFAULT_SETTINGS = {
    enabled: true,
    provider: "openai",
    displayMode: "floatingDot",
    screenshotMode: "autoCapture",
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
    debounceDelay: DEBOUNCE_DEFAULT,
    siteList: [],
    activationHotkey: "Alt+Shift+A",
    regionSelectHotkey: "Alt+Shift+S"
  };
  const processedHashes = new Set();
  const questionDots = new Map();
  const authState = {
    checked: false,
    user: null
  };
  let settings = { ...DEFAULT_SETTINGS };
  let debounceTimer = null;
  let observer = null;
  let isProcessing = false;
  let dotCardHideTimer = null;
  let floatingCardHideTimer = null;
  let lastFloatingAnswerKey = "";
  let runtimeListenersBound = false;
  let isExtensionActive = false;

  const LOG_PREFIX = "%c[Quiz Solver AI]";
  const LOG_STYLE = "color: #6366f1; font-weight: bold;";

  // ─── Init ───────────────────────────────────────────────────────────
  async function init() {
    console.log(LOG_PREFIX, LOG_STYLE, "Initializing...");
    bindRuntimeListeners();
    await loadSettingsFromStorage();
    await refreshActivationState();
  }

  function extractSettings(stored) {
    const s = { ...DEFAULT_SETTINGS };
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("qsa_")) {
        s[key.slice(4)] = value;
      }
    }
    return s;
  }

  async function loadSettingsFromStorage() {
    try {
      const stored = await chrome.storage.local.get(null);
      settings = extractSettings(stored);
    } catch (e) {
      console.warn(LOG_PREFIX, LOG_STYLE, "Failed to load settings:", e);
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  function bindRuntimeListeners() {
    if (runtimeListenersBound) return;
    runtimeListenersBound = true;
    setupMessageListener();
    setupHotkeyListener();
    setupInteractionListeners();
    setupStorageListener();
  }

  function isCurrentSiteBlocked() {
    const currentHost = window.location.hostname;
    if (!settings.siteList || settings.siteList.length === 0) {
      return false;
    }
    return settings.siteList.some(site => site.host === currentHost && !site.enabled);
  }

  async function refreshActivationState() {
    const currentHost = window.location.hostname;

    if (settings.enabled === false) {
      console.log(LOG_PREFIX, LOG_STYLE, "Extension is disabled.");
      deactivateExtension("disabled");
      return;
    }

    if (isCurrentSiteBlocked()) {
      console.log(LOG_PREFIX, LOG_STYLE, "Site is blocked:", currentHost);
      deactivateExtension("site-blocked");
      return;
    }

    console.log(LOG_PREFIX, LOG_STYLE, "Active on", currentHost,
      "| Provider:", settings.provider || "default",
      "| Display:", settings.displayMode || "floatingDot",
      "| AutoSolve:", settings.autoSolve || false);

    await activateExtension();
  }

  async function activateExtension() {
    if (isExtensionActive) {
      const sidebar = getOrCreateSidebar();
      if (sidebar) {
        renderSidebarContent(sidebar);
        applySidebarOpenState();
      }
      startObserver();
      return;
    }

    isExtensionActive = true;
    const sidebar = getOrCreateSidebar();
    if (sidebar) {
      await initializeSidebarState(sidebar);
    }
    scanPage(false, { openSidebarOnUnauth: false });
    startObserver();
  }

  function deactivateExtension(reason = "disabled") {
    isExtensionActive = false;
    isProcessing = false;
    clearTimeout(debounceTimer);
    clearTimeout(dotCardHideTimer);
    clearTimeout(floatingCardHideTimer);

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    sidebarState.isOpen = false;
    teardownExtensionUi();
    processedHashes.clear();

    console.log(LOG_PREFIX, LOG_STYLE, `Runtime deactivated: ${reason}`);
  }

  async function syncAuthState() {
    try {
      const response = await sendRuntimeMessage(
        { type: "firebase_get_user" },
        { timeoutMs: 4000, timeoutMessage: "Sign-in check timed out. Please sign in again." }
      );
      authState.user = response?.user || null;
      if (typeof sidebarState !== "undefined") {
        sidebarState.authError = response?.error || "";
      }
    } catch (err) {
      authState.user = null;
      if (typeof sidebarState !== "undefined") {
        sidebarState.authError = err?.message || "Could not verify your sign-in session. Please sign in with Google.";
      }
    }

    authState.checked = true;
    if (typeof sidebarState !== "undefined") {
      sidebarState.user = authState.user;
      sidebarState.authStatus = authState.user ? "signed_in" : "signed_out";
    }
    return authState.user;
  }

  function isSignedIn() {
    return !!authState.user;
  }

  function sendRuntimeMessage(message, options = {}) {
    return new Promise((resolve, reject) => {
      let finished = false;
      let timeoutId = null;

      if (options.timeoutMs) {
        timeoutId = setTimeout(() => {
          if (finished) return;
          finished = true;
          reject(new Error(options.timeoutMessage || "Request timed out"));
        }, options.timeoutMs);
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  // ─── Observer ───────────────────────────────────────────────────────
  function startObserver() {
    if (!isExtensionActive || !document.body) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (!isExtensionActive) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanPage();
      }, settings.debounceDelay || DEBOUNCE_DEFAULT);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ─── Message Listener ──────────────────────────────────────────────
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "trigger_solve") {
        if (!isExtensionActive) {
          sendResponse({ ok: false, disabled: true });
          return true;
        }
        console.log(LOG_PREFIX, LOG_STYLE, "Manual trigger received");
        scanPage(true);
        sendResponse({ ok: true });
      } else if (msg.type === "trigger_region_select") {
        if (!isExtensionActive) {
          sendResponse({ ok: false, disabled: true });
          return true;
        }
        startRegionSelect();
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  // ─── Hotkey Listener ───────────────────────────────────────────────
  function setupHotkeyListener() {
    document.addEventListener("keydown", (e) => {
      if (!isExtensionActive) return;

      const hotkey = settings.activationHotkey || "Alt+Shift+A";
      if (matchesHotkey(e, hotkey)) {
        e.preventDefault();
        console.log(LOG_PREFIX, LOG_STYLE, "Hotkey activated");
        scanPage(true);
      }

      const regionHotkey = settings.regionSelectHotkey || "Alt+Shift+S";
      if (matchesHotkey(e, regionHotkey)) {
        e.preventDefault();
        startRegionSelect();
      }
    });
  }

  function setupInteractionListeners() {
    const scheduleInteractionScan = () => {
      if (!isExtensionActive) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanPage();
      }, 120);
    };

    const shouldIgnoreTarget = (target) => {
      if (!(target instanceof Element)) return true;
      return !!target.closest(
        ".qsa-sidebar-chat, .qsa-sidebar-chat-toggle, .qsa-floating-dot, .qsa-floating-card, .qsa-question-dot, .qsa-question-dot-card, .qsa-url-hash-banner, .qsa-region-overlay"
      );
    };

    document.addEventListener("change", (e) => {
      const target = e.target;
      if (shouldIgnoreTarget(target)) return;
      if (target.matches("input, select, textarea")) {
        scheduleInteractionScan();
      }
    }, true);

    document.addEventListener("input", (e) => {
      const target = e.target;
      if (shouldIgnoreTarget(target)) return;
      if (target.matches('input[type="text"], textarea, [contenteditable="true"]')) {
        scheduleInteractionScan();
      }
    }, true);

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (shouldIgnoreTarget(target)) return;
      if (target.closest('label, [role="radio"], [role="option"], [role="checkbox"]')) {
        scheduleInteractionScan();
      }
    }, true);
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      let shouldRefreshActivation = false;
      let shouldClearDisplays = false;
      let shouldRescan = false;

      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith("qsa_")) continue;

        const settingKey = key.slice(4);
        if (typeof change.newValue === "undefined") {
          settings[settingKey] = DEFAULT_SETTINGS[settingKey];
        } else {
          settings[settingKey] = change.newValue;
        }

        if (settingKey === "enabled" || settingKey === "siteList") {
          shouldRefreshActivation = true;
        } else {
          shouldRescan = true;
        }

        if (["displayMode", "autoClearAnswer", "autoClearDelay"].includes(settingKey)) {
          shouldClearDisplays = true;
        }
      }

      if (shouldRefreshActivation) {
        refreshActivationState();
        return;
      }

      if (!isExtensionActive) return;

      if (shouldClearDisplays) {
        clearDisplays();
      }

      if (shouldRescan) {
        scanPage(false, { openSidebarOnUnauth: false });
      }
    });
  }

  function matchesHotkey(e, hotkeyStr) {
    const parts = hotkeyStr.split("+").map(p => p.trim().toLowerCase());
    const needAlt = parts.includes("alt");
    const needCtrl = parts.includes("ctrl") || parts.includes("control");
    const needShift = parts.includes("shift");
    const needMeta = parts.includes("meta") || parts.includes("cmd");
    const key = parts.filter(p => !["alt", "ctrl", "control", "shift", "meta", "cmd"].includes(p))[0];

    if (needAlt !== e.altKey) return false;
    if (needCtrl !== e.ctrlKey) return false;
    if (needShift !== e.shiftKey) return false;
    if (needMeta !== e.metaKey) return false;
    if (key && e.key.toLowerCase() !== key) return false;
    return true;
  }

  // ─── Page Scanner ──────────────────────────────────────────────────
  async function scanPage(forceTrigger = false, options = {}) {
    if (!isExtensionActive) return;
    if (isProcessing) return;
    if (settings.detectionEnabled === false) return;
    const displayMode = getEffectiveDisplayMode();
    if (!forceTrigger && settings.autoTrigger === false && displayMode !== "floatingDot") return;
    if (!isSignedIn() && displayMode !== "floatingDot") {
      if (options.openSidebarOnUnauth || forceTrigger) {
        openSidebar();
      }
      return;
    }

    isProcessing = true;

    try {
      const questions = detectQuestions();
      console.log(LOG_PREFIX, LOG_STYLE, `Detected ${questions.length} question(s)`,
        questions.map(q => ({ type: q.type, text: q.text.slice(0, 60) })));

      if (questions.length === 0) {
        isProcessing = false;
        return;
      }

      for (const q of questions) {
        const hash = await hashQuestion(q.text, q.options);
        const canAutoSolve = shouldAutoSolveQuestion(q, forceTrigger);

        if (displayMode === "floatingDot") {
          const existingDotState = questionDots.get(hash);
          if (!existingDotState) {
            placeDotOnQuestion(q, hash);
          } else if (!existingDotState.element?.isConnected || existingDotState.element !== q.element) {
            if (existingDotState.repositionDot) {
              window.removeEventListener("scroll", existingDotState.repositionDot);
              window.removeEventListener("resize", existingDotState.repositionDot);
            }
            existingDotState.dot?.remove();
            questionDots.delete(hash);
            placeDotOnQuestion(q, hash);
          } else {
            existingDotState.question = q;
            existingDotState.element = q.element;
            positionQuestionDot(existingDotState.dot, q.element);
            if (dotStateHasCard(hash)) {
              positionQuestionDotCard(existingDotState.dot);
            }
          }
        }
        // Auto-solve mode: trigger all questions automatically
        else if (settings.autoSolve) {
          if (canAutoSolve && (!processedHashes.has(hash) || forceTrigger)) {
            processedHashes.add(hash);
            solveAndDisplay(q, hash);
          }
        }
        // Single question → auto-trigger
        else if (questions.length === 1) {
          if (canAutoSolve && (!processedHashes.has(hash) || forceTrigger)) {
            processedHashes.add(hash);
            await solveAndDisplay(q, hash);
          }
        }
        // Multiple questions: place dots
        else {
          if (forceTrigger && canAutoSolve && (!processedHashes.has(hash) || forceTrigger)) {
            processedHashes.add(hash);
            await solveAndDisplay(q, hash);
          }
        }
      }
    } catch (err) {
      console.error(LOG_PREFIX, LOG_STYLE, "Scan error:", err);
    }

    isProcessing = false;
  }

  function shouldAutoSolveQuestion(question, forceTrigger) {
    if (forceTrigger) return true;
    if (!settings.triggerAfterInteraction) return true;
    return !!question.userInteracted;
  }

  function getEffectiveDisplayMode() {
    return settings.displayMode === "urlHash" ? "urlHash" : "floatingDot";
  }

  // ─── Solve & Display ───────────────────────────────────────────────
  async function solveAndDisplay(question, hash) {
    let imageBase64 = null;
    if (
      question.hasImage &&
      settings.detectImages !== false &&
      settings.includeScreenshot !== false &&
      (settings.screenshotMode || "autoCapture") === "autoCapture"
    ) {
      imageBase64 = await captureQuestionImage(question.element);
    }

    console.log(LOG_PREFIX, LOG_STYLE, "Sending to AI:", question.text.slice(0, 80));

    chrome.runtime.sendMessage({
      type: "solve_question",
      question: question.text,
      options: question.options || [],
      questionType: question.type,
      imageBase64,
      questionHash: hash,
      userAnswer: question.userAnswer || null
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(LOG_PREFIX, LOG_STYLE, "Message error:", chrome.runtime.lastError.message);
        return;
      }
      if (!isExtensionActive) {
        return;
      }
      if (response && response.type !== "error") {
        console.log(LOG_PREFIX, LOG_STYLE, "Answer received:", response.answer);

        const answerData = {
          ...response,
          question: question.text,
          userAnswer: question.userAnswer,
          questionElement: question.element,
          questionType: question.type,
          options: question.options
        };

        // Always try to auto-fill
        const filled = tryAutoFill(question, response);
        if (filled) {
          console.log(LOG_PREFIX, LOG_STYLE, "Auto-filled answer");
        }

        addToSidebar(answerData);
        displayAnswer(answerData, question.element);

        updateQuestionDotState(hash, answerData);
      } else if (response && response.error) {
        console.error(LOG_PREFIX, LOG_STYLE, "AI error:", response.error);
        const errorData = {
          answer: "Error: " + response.error,
          full: "Error: " + response.error,
          explanation: "",
          confidence: "low",
          question: question.text,
          userAnswer: question.userAnswer,
          questionElement: question.element,
          questionType: question.type,
          options: question.options
        };
        addToSidebar(errorData);
        updateQuestionDotState(hash, errorData);
        displayError(response.error);
      }
    });
  }

  // ─── Auto-Fill ─────────────────────────────────────────────────────
  function tryAutoFill(question, response) {
    if (!question.element || !response.answer) return false;

    const answer = response.answer.trim();

    try {
      if (question.type === "mcq_single") {
        return autoFillMCQ(question, answer);
      } else if (question.type === "mcq_multi") {
        return autoFillMCQ(question, answer);
      } else if (question.type === "fill_blank") {
        return autoFillText(question, answer);
      } else if (question.type === "cloze") {
        return autoFillSelect(question, answer);
      }
    } catch (e) {
      console.warn(LOG_PREFIX, LOG_STYLE, "Auto-fill failed:", e);
    }
    return false;
  }

  function autoFillMCQ(question, answer) {
    const el = question.element;
    const inputs = el.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    const answerLower = answer.toLowerCase();

    // Try matching by option letter (A, B, C...) or text
    const letterMatch = answerLower.match(/^\(?([a-z])\)?[.):\s-]*/);
    const answerLetter = letterMatch ? letterMatch[1] : null;
    const labels = "abcdefghijklmnopqrstuvwxyz";

    for (let i = 0; i < inputs.length; i++) {
      const label = findLabelForInput(inputs[i]);
      const isLetterMatch = answerLetter && labels[i] === answerLetter;
      const isTextMatch = label && answerLower.includes(label.toLowerCase().trim());

      if (isLetterMatch || isTextMatch) {
        inputs[i].click();
        inputs[i].checked = true;
        inputs[i].dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    // ARIA-based
    const ariaItems = el.querySelectorAll('[role="radio"], [role="option"]');
    for (const item of ariaItems) {
      const text = cleanText(item);
      if (text && answerLower.includes(text.toLowerCase())) {
        item.click();
        return true;
      }
    }

    return false;
  }

  function autoFillText(question, answer) {
    const el = question.element;
    const input = el.querySelector('input[type="text"], textarea, [contenteditable="true"]');
    if (!input) return false;

    if (input.contentEditable === "true") {
      input.textContent = answer;
    } else {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, answer);
      } else {
        input.value = answer;
      }
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function autoFillSelect(question, answer) {
    const el = question.element;
    const select = el.querySelector("select");
    if (!select) return false;

    const answerLower = answer.toLowerCase();
    for (const opt of select.options) {
      if (opt.textContent.toLowerCase().trim().includes(answerLower) ||
          answerLower.includes(opt.textContent.toLowerCase().trim())) {
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ─── Per-Question Dot ──────────────────────────────────────────────
  function positionQuestionDot(dot, element) {
    if (!dot || !element?.isConnected) return;

    const rect = element.getBoundingClientRect();
    const dotSize = 6;
    const viewportPadding = 8;
    const top = Math.max(
      viewportPadding,
      Math.min(window.innerHeight - dotSize - viewportPadding, rect.top + 6)
    );
    const preferredLeft = rect.left - 16;
    const fallbackRight = rect.right + 10;
    const left = preferredLeft >= viewportPadding
      ? preferredLeft
      : Math.min(window.innerWidth - dotSize - viewportPadding, fallbackRight);

    dot.style.top = `${top}px`;
    dot.style.left = `${Math.max(viewportPadding, left)}px`;
  }

  function placeDotOnQuestion(question, hash) {
    if (!question.element || !question.element.isConnected) return;

    const dot = document.createElement("div");
    dot.className = "qsa-question-dot";
    dot.title = "Click to solve";
    dot.setAttribute("data-qsa-hash", hash);

    // Use fixed positioning based on element's screen coordinates
    Object.assign(dot.style, {
      position: "fixed",
      top: "8px",
      left: "8px",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: getSubtleDotColor(0.18),
      cursor: "pointer",
      zIndex: "2147483640",
      transition: "transform 0.15s ease"
    });

    dot.addEventListener("mouseenter", () => {
      dot.style.transform = "scale(1.5)";

      const dotState = questionDots.get(hash);
      if (!dotState) return;
      dotState.isHovering = true;

      if (getEffectiveDisplayMode() === "floatingDot" && dotState.answerData) {
        showQuestionDotCard(dotState.answerData, dot);
      }
    });

    dot.addEventListener("mouseleave", () => {
      dot.style.transform = "scale(1)";
      const dotState = questionDots.get(hash);
      if (dotState) {
        dotState.isHovering = false;
      }
      scheduleHideQuestionDotCard();
    });

    dot.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log(LOG_PREFIX, LOG_STYLE, "Dot clicked for:", question.text.slice(0, 60));

      if (!isSignedIn()) {
        openSidebar();
        return;
      }

      const dotState = questionDots.get(hash);
      if (dotState?.isSolving) {
        return;
      }

      if (dotState?.answerData && getEffectiveDisplayMode() === "floatingDot") {
        showQuestionDotCard(dotState.answerData, dot);
        return;
      }

      if (dotState) {
        dotState.isSolving = true;
      }

      await solveAndDisplay(question, hash);
    });

    document.body.appendChild(dot);
    const dotState = {
      dot,
      question,
      element: question.element,
      answerData: null,
      isHovering: false,
      isSolving: false,
      repositionDot: null
    };
    questionDots.set(hash, dotState);
    positionQuestionDot(dot, question.element);

    // Reposition on scroll
    const repositionDot = () => {
      if (!question.element.isConnected) {
        window.removeEventListener("scroll", repositionDot);
        window.removeEventListener("resize", repositionDot);
        dot.remove();
        questionDots.delete(hash);
        return;
      }
      positionQuestionDot(dot, question.element);
      if (dotStateHasCard(hash)) {
        positionQuestionDotCard(dot);
      }
    };
    dotState.repositionDot = repositionDot;
    window.addEventListener("scroll", repositionDot, { passive: true });
    window.addEventListener("resize", repositionDot, { passive: true });
  }

  function updateQuestionDotState(hash, answerData) {
    const dotState = questionDots.get(hash);
    if (!dotState) return;

    dotState.answerData = answerData;
    dotState.isSolving = false;
    dotState.dot.style.backgroundColor = getSubtleDotColor(0.18);
    dotState.dot.style.opacity = "1";
    dotState.dot.title = answerData.answer || "Solved";

    if (dotState.isHovering && getEffectiveDisplayMode() === "floatingDot") {
      showQuestionDotCard(answerData, dotState.dot);
    }
  }

  function showQuestionDotCard(data, dot) {
    clearTimeout(dotCardHideTimer);

    let card = document.querySelector(".qsa-question-dot-card");
    if (!card) {
      card = document.createElement("div");
      card.className = "qsa-question-dot-card";
      Object.assign(card.style, {
        position: "fixed",
        width: "260px",
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "180px",
        overflowY: "auto",
        backgroundColor: "rgba(24, 24, 32, 0.96)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "10px",
        padding: "10px 12px",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "12px",
        lineHeight: "1.45",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        zIndex: "2147483646"
      });

      card.addEventListener("mouseenter", () => clearTimeout(dotCardHideTimer));
      card.addEventListener("mouseleave", () => scheduleHideQuestionDotCard());

      document.body.appendChild(card);
    }

    card.innerHTML = `
      <div style="font-weight:600;color:#fff;">${escapeHtml(data.answer || "")}</div>
    `;

    card.style.display = "block";
    positionQuestionDotCard(dot);
  }

  function positionQuestionDotCard(dot) {
    const card = document.querySelector(".qsa-question-dot-card");
    if (!card || !dot) return;

    const rect = dot.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const top = Math.max(8, Math.min(window.innerHeight - cardRect.height - 8, rect.top - 6));
    const leftCandidate = rect.right + 10;
    const left = leftCandidate + cardRect.width + 8 > window.innerWidth
      ? Math.max(8, rect.left - cardRect.width - 10)
      : leftCandidate;

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function scheduleHideQuestionDotCard() {
    clearTimeout(dotCardHideTimer);
    dotCardHideTimer = setTimeout(() => {
      const card = document.querySelector(".qsa-question-dot-card");
      if (card && !card.matches(":hover")) {
        card.style.display = "none";
      }
    }, 160);
  }

  function dotStateHasCard(hash) {
    const dotState = questionDots.get(hash);
    const card = document.querySelector(".qsa-question-dot-card");
    return !!dotState?.isHovering && !!card && card.style.display !== "none";
  }

  // ─── Display Answer ────────────────────────────────────────────────
  // This only handles answer-only display (dot/hash). Sidebar is always fed separately.
  function displayAnswer(data, questionElement) {
    if (!isExtensionActive) return;
    const mode = getEffectiveDisplayMode();

    if (settings.autoSolve) {
      clearDisplays();
      return;
    }

    switch (mode) {
      case "floatingDot":
        document.querySelector(".qsa-floating-dot")?.remove();
        document.querySelector(".qsa-floating-card")?.remove();
        break;
      case "urlHash":
        showUrlHash(data);
        break;
      default:
        showFloatingDot(data);
    }

    if (settings.autoClearAnswer) {
      const delay = (settings.autoClearDelay || 10) * 1000;
      setTimeout(() => clearDisplays(), delay);
    }
  }

  function displayError(errorMsg) {
    if (!isExtensionActive) return;
    const errorData = {
      answer: "Error: " + errorMsg,
      explanation: "",
      confidence: "low"
    };
    displayAnswer(errorData);
  }

  // ─── Floating Dot Display ──────────────────────────────────────────
  function showFloatingDot(data) {
    let dot = document.querySelector(".qsa-floating-dot");
    let card = document.querySelector(".qsa-floating-card");

    if (!dot) {
      dot = document.createElement("div");
      dot.className = "qsa-floating-dot";
      Object.assign(dot.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        top: "auto",
        left: "auto",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: "rgba(140, 140, 140, 0.2)",
        cursor: "grab",
        zIndex: "2147483646",
        transition: "transform 0.15s",
        userSelect: "none",
        touchAction: "none"
      });

      card = document.createElement("div");
      card.className = "qsa-floating-card";
      Object.assign(card.style, {
        position: "fixed",
        bottom: "36px",
        right: "16px",
        top: "auto",
        left: "auto",
        width: "240px",
        maxHeight: "120px",
        overflowY: "auto",
        backgroundColor: "rgba(24, 24, 32, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: "8px",
        padding: "10px 14px",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "13px",
        lineHeight: "1.4",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.06)",
        zIndex: "2147483646",
        display: "none",
        opacity: "0",
        transform: "translateY(4px) scale(0.97)",
        transition: "opacity 0.2s, transform 0.2s"
      });

      let pinned = false;
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0, dotStartX = 0, dotStartY = 0;
      let hasMoved = false;

      function getDotRect() { return dot.getBoundingClientRect(); }

      function positionCard() {
        const r = getDotRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        card.style.bottom = card.style.right = card.style.top = card.style.left = "auto";
        if (r.top > vh / 2) card.style.bottom = (vh - r.top + 8) + "px";
        else card.style.top = (r.bottom + 8) + "px";
        if (r.left > vw / 2) card.style.right = (vw - r.right) + "px";
        else card.style.left = r.left + "px";
      }

      dot.addEventListener("mousedown", (e) => {
        isDragging = true; hasMoved = false;
        dragStartX = e.clientX; dragStartY = e.clientY;
        const r = getDotRect();
        dotStartX = r.left; dotStartY = r.top;
        dot.style.cursor = "grabbing";
        e.preventDefault();
      });

      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
        if (!hasMoved) return;
        dot.style.bottom = "auto"; dot.style.right = "auto";
        dot.style.left = Math.max(0, Math.min(window.innerWidth - 14, dotStartX + dx)) + "px";
        dot.style.top = Math.max(0, Math.min(window.innerHeight - 14, dotStartY + dy)) + "px";
      });

      document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        dot.style.cursor = "grab";
        if (hasMoved) positionCard();
      });

      dot.addEventListener("mouseenter", () => {
        if (!pinned && !isDragging) { positionCard(); showCard(); }
        dot.style.transform = "scale(1.3)";
      });

      dot.addEventListener("mouseleave", () => {
        dot.style.transform = "scale(1)";
        if (!pinned) {
          setTimeout(() => {
            if (!card.matches(":hover") && !pinned) hideCard();
          }, 200);
        }
      });

      card.addEventListener("mouseleave", () => {
        if (!pinned) hideCard();
      });

      dot.addEventListener("click", () => {
        if (hasMoved) return;
        pinned = !pinned;
        if (pinned) { positionCard(); showCard(); }
      });

      function showCard() {
        clearTimeout(floatingCardHideTimer);
        card.style.display = "block";
        requestAnimationFrame(() => { card.style.opacity = "1"; card.style.transform = "translateY(0) scale(1)"; });
      }

      function hideCard() {
        clearTimeout(floatingCardHideTimer);
        card.style.opacity = "0"; card.style.transform = "translateY(8px) scale(0.95)";
        setTimeout(() => { card.style.display = "none"; }, 250);
      }

      dot._qsaPositionCard = positionCard;
      dot._qsaShowCard = showCard;
      dot._qsaHideCard = hideCard;

      document.body.appendChild(dot);
      document.body.appendChild(card);
    }

    dot.style.backgroundColor = getSubtleDotColor(0.32);
    dot.title = data.answer || "Show answer";
    updateCardContent(card, data);
    lastFloatingAnswerKey = `${data.answer || ""}\n${data.explanation || ""}`;
  }

  // Card only shows the answer — full explanations go to sidebar
  function updateCardContent(card, data) {
    card.innerHTML = `<div style="font-weight:600; font-size:13px; color:#e2e8f0;">${escapeHtml(data.answer || "")}</div>`;
  }

  // ─── URL Hash Display ──────────────────────────────────────────────
  function showUrlHash(data) {
    const answer = (data.answer || "").replace(/\s+/g, " ").trim();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#answer=${encodeURIComponent(answer)}`);
    document.querySelector(".qsa-url-hash-banner")?.remove();
  }

  function showUrlHashBanner(hashValue) {
    let banner = document.querySelector(".qsa-url-hash-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "qsa-url-hash-banner";
      Object.assign(banner.style, {
        position: "fixed",
        top: "10px",
        left: "12px",
        right: "12px",
        padding: "10px 12px",
        borderRadius: "10px",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        color: "#e2e8f0",
        fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
        fontSize: "12px",
        lineHeight: "1.4",
        whiteSpace: "normal",
        wordBreak: "break-word",
        zIndex: "2147483646",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)"
      });
      document.body.appendChild(banner);
    }

    banner.innerHTML = "";

    const label = document.createElement("div");
    Object.assign(label.style, {
      fontSize: "10px",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#94a3b8",
      marginBottom: "4px"
    });
    label.textContent = "URL hash answer";

    const value = document.createElement("div");
    Object.assign(value.style, {
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word"
    });
    value.textContent = hashValue;

    banner.appendChild(label);
    banner.appendChild(value);
  }

  // ─── Sidebar Chat (Leo Brave AI Style) ──────────────────────────────
  let sidebarState = {
    user: null,
    chats: [],
    activeChatId: null,
    activeMessages: [],
    view: "chat", // "list" or "chat"
    isOpen: false,
    authStatus: "checking",
    chatStatus: "idle",
    authError: "",
    chatError: ""
  };

  function addToSidebar(data) {
    if (!isExtensionActive) return;
    const sidebar = getOrCreateSidebar();
    if (!sidebar) return;
    ensureActiveChat(sidebar);

    // Add Q&A as messages
    const questionMessage = formatSidebarQuestionMessage(data);
    if (questionMessage) {
      sidebarState.activeMessages.push({ role: "user", content: questionMessage, timestamp: new Date().toISOString() });
    }

    let aiMessage = data.full || data.rawResponse || data.answer || "";
    if (data.confidence) aiMessage += `\n\n[Confidence: ${data.confidence}]`;
    sidebarState.activeMessages.push({ role: "assistant", content: aiMessage, timestamp: new Date().toISOString() });

    renderSidebarContent(sidebar);
    autoSaveChat();
  }

  function formatSidebarQuestionMessage(data) {
    const parts = [];
    if (data.question) {
      parts.push(`Question-\n${data.question.trim()}`);
    }

    if (Array.isArray(data.options) && data.options.length > 0) {
      const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const optionLines = data.options.map((option, index) => `(${labels[index] || index + 1}) ${option}`);
      parts.push(`Options-\n${optionLines.join("\n")}`);
    } else {
      parts.push("Options-\nNone provided");
    }

    if (data.userAnswer) {
      parts.push(`Current answer-\n${data.userAnswer}`);
    }

    return parts.join("\n\n").trim();
  }

  function createSidebarElements() {
    let sidebar = document.querySelector(".qsa-sidebar-chat");
    if (!sidebar) {
      sidebar = document.createElement("div");
      sidebar.className = "qsa-sidebar-chat";
      Object.assign(sidebar.style, {
        position: "fixed",
        top: "0",
        right: "0",
        width: "340px",
        height: "100vh",
        backgroundColor: "rgba(12, 12, 20, 0.98)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        zIndex: "2147483645",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "13px",
        color: "#e2e8f0",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)",
        transition: "transform 0.3s ease",
        transform: "translateX(100%)"
      });
      document.body.appendChild(sidebar);
    }

    let toggle = document.querySelector(".qsa-sidebar-chat-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.className = "qsa-sidebar-chat-toggle";
      document.body.appendChild(toggle);
    }

    Object.assign(toggle.style, {
      position: "fixed",
      top: "50%",
      right: "0",
      transform: "translateY(-50%)",
      width: "22px",
      height: "72px",
      border: "none",
      borderRadius: "8px 0 0 8px",
      backgroundColor: "rgba(12, 12, 20, 0.96)",
      color: "#cbd5e1",
      cursor: "pointer",
      zIndex: "2147483645",
      boxShadow: "-4px 0 18px rgba(0,0,0,0.28)"
    });

    if (toggle.dataset.qsaBound !== "true") {
      toggle.dataset.qsaBound = "true";
      toggle.addEventListener("click", () => {
        sidebarState.isOpen = !sidebarState.isOpen;
        applySidebarOpenState(sidebar, toggle);
        if (sidebarState.isOpen) {
          renderSidebarContent(sidebar);
        }
      });
    }

    return { sidebar, toggle };
  }

  function getOrCreateSidebar() {
    if (!isExtensionActive) return null;
    const { sidebar, toggle } = createSidebarElements();
    renderSidebarContent(sidebar);
    applySidebarOpenState(sidebar, toggle);
    return sidebar;
  }

  function applySidebarOpenState(sidebar = document.querySelector(".qsa-sidebar-chat"), toggle = document.querySelector(".qsa-sidebar-chat-toggle")) {
    if (!sidebar || !toggle) return;

    sidebar.style.transform = sidebarState.isOpen ? "translateX(0)" : "translateX(100%)";
    toggle.style.right = sidebarState.isOpen ? "340px" : "0";
    toggle.textContent = sidebarState.isOpen ? ">" : "<";
    toggle.style.opacity = "1";
  }

  function openSidebar() {
    if (!isExtensionActive) return;
    sidebarState.isOpen = true;
    applySidebarOpenState();
  }

  function closeSidebar() {
    if (!isExtensionActive) return;
    sidebarState.isOpen = false;
    applySidebarOpenState();
  }

  async function initializeSidebarState(sidebar) {
    sidebarState.authStatus = "checking";
    sidebarState.chatStatus = "idle";
    sidebarState.authError = "";
    sidebarState.chatError = "";
    renderSidebarContent(sidebar);

    const user = await syncAuthState();
    if (!user) {
      clearSidebarChats();
      sidebarState.authStatus = "signed_out";
      sidebarState.chatStatus = "idle";
      renderSidebarContent(sidebar);
      applySidebarOpenState();
      return;
    }

    sidebarState.user = user;
    sidebarState.authStatus = "signed_in";
    sidebarState.authError = "";
    restoreLocalChats();
    sidebarState.chatStatus = sidebarState.chats.length > 0 ? "ready" : "loading";
    renderSidebarContent(sidebar);
    hydrateChatsFromFirebase(sidebar);
  }

  function restoreLocalChats() {
    chrome.storage.local.get("qsa_sidebar_chats", (result) => {
      if (sidebarState.authStatus !== "signed_in" || sidebarState.chatStatus !== "loading") {
        return;
      }

      const localChats = result.qsa_sidebar_chats || [];
      sidebarState.chats = localChats;

      if (localChats.length > 0) {
        const activeChat = localChats.find(chat => chat.id === sidebarState.activeChatId) || localChats[0];
        sidebarState.activeChatId = activeChat?.id || null;
        sidebarState.activeMessages = [...(activeChat?.messages || [])];
      } else {
        sidebarState.activeChatId = null;
        sidebarState.activeMessages = [];
      }

      if (sidebarState.authStatus === "signed_in" && sidebarState.chatStatus === "loading") {
        sidebarState.chatStatus = localChats.length > 0 ? "ready" : "loading";
        renderSidebarContent();
      }
    });
  }

  function clearSidebarChats() {
    sidebarState.chats = [];
    sidebarState.activeChatId = null;
    sidebarState.activeMessages = [];
    sidebarState.view = "chat";
    sidebarState.chatError = "";
  }

  function createSidebarHeader(titleText, { showList = false, showNewChat = false } = {}) {
    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: "0"
    });

    const left = document.createElement("div");
    Object.assign(left.style, { display: "flex", alignItems: "center", gap: "8px" });

    if (showList) {
      const listBtn = document.createElement("button");
      Object.assign(listBtn.style, {
        background: "none",
        border: "none",
        color: "#94a3b8",
        cursor: "pointer",
        fontSize: "16px",
        padding: "2px 4px"
      });
      listBtn.textContent = "☰";
      listBtn.title = "Chat list";
      listBtn.addEventListener("click", () => {
        sidebarState.view = sidebarState.view === "list" ? "chat" : "list";
        renderSidebarContent();
      });
      left.appendChild(listBtn);
    }

    const title = document.createElement("span");
    Object.assign(title.style, { fontWeight: "600", fontSize: "14px" });
    title.textContent = titleText;
    left.appendChild(title);
    header.appendChild(left);

    const right = document.createElement("div");
    Object.assign(right.style, { display: "flex", alignItems: "center", gap: "6px" });

    if (showNewChat) {
      const newChatBtn = document.createElement("button");
      Object.assign(newChatBtn.style, {
        background: "none",
        border: "none",
        color: "#6366f1",
        cursor: "pointer",
        fontSize: "18px",
        padding: "2px 4px"
      });
      newChatBtn.textContent = "+";
      newChatBtn.title = "New chat";
      newChatBtn.addEventListener("click", () => createNewChat(document.querySelector(".qsa-sidebar-chat")));
      right.appendChild(newChatBtn);
    }

    const closeBtn = document.createElement("button");
    Object.assign(closeBtn.style, {
      background: "none",
      border: "none",
      color: "#94a3b8",
      cursor: "pointer",
      fontSize: "18px",
      padding: "0 4px"
    });
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => closeSidebar());
    right.appendChild(closeBtn);

    header.appendChild(right);
    return header;
  }

  function renderCenteredSidebarState(sidebar, { title, body, error = "", loading = false, showLogin = false } = {}) {
    sidebar.appendChild(createSidebarHeader("Quiz Solver AI"));

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      flex: "1",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
      textAlign: "center",
      gap: "14px"
    });

    const icon = document.createElement("div");
    Object.assign(icon.style, { fontSize: "32px" });
    icon.textContent = loading ? "…" : "🔒";
    panel.appendChild(icon);

    const heading = document.createElement("div");
    Object.assign(heading.style, { fontWeight: "600", fontSize: "15px", color: "#e2e8f0" });
    heading.textContent = title;
    panel.appendChild(heading);

    const desc = document.createElement("div");
    Object.assign(desc.style, { fontSize: "12px", color: "#64748b", lineHeight: "1.5" });
    desc.textContent = body;
    panel.appendChild(desc);

    const status = document.createElement("div");
    Object.assign(status.style, {
      minHeight: "18px",
      fontSize: "11px",
      color: error ? "#fca5a5" : "#94a3b8"
    });
    status.textContent = error || (loading ? "Please wait…" : "");
    panel.appendChild(status);

    if (showLogin) {
      const loginBtn = document.createElement("button");
      Object.assign(loginBtn.style, {
        padding: "10px 24px",
        background: "rgba(99,102,241,0.8)",
        border: "none",
        borderRadius: "8px",
        color: "#fff",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "500",
        marginTop: "8px"
      });
      loginBtn.textContent = "Sign in with Google";
      loginBtn.addEventListener("click", async () => {
        sidebarState.authError = "";
        loginBtn.textContent = "Signing in...";
        loginBtn.disabled = true;

        try {
          const res = await sendRuntimeMessage(
            { type: "firebase_login" },
            { timeoutMs: 95000, timeoutMessage: "Google sign-in timed out. Check the OAuth redirect URI and Firebase authorized domain, then try again." }
          );

          if (res && res.user) {
            authState.user = res.user;
            authState.checked = true;
            sidebarState.user = res.user;
            sidebarState.authStatus = "signed_in";
            sidebarState.chatStatus = "loading";
            sidebarState.authError = "";
            sidebarState.chatError = "";
            openSidebar();
            restoreLocalChats();
            renderSidebarContent(sidebar);
            hydrateChatsFromFirebase(sidebar);
            scanPage(true);
            return;
          }

          sidebarState.authStatus = "signed_out";
          sidebarState.authError = res?.error || "Sign-in failed. Check the OAuth redirect and Firebase authorized domain.";
          openSidebar();
          renderSidebarContent(sidebar);
        } catch (err) {
          sidebarState.authStatus = "signed_out";
          sidebarState.authError = err?.message || "Google sign-in timed out. Please try again.";
          openSidebar();
          renderSidebarContent(sidebar);
        }
      });
      panel.appendChild(loginBtn);
    }

    sidebar.appendChild(panel);
  }

  function renderSidebarContent(sidebar) {
    sidebar = sidebar || document.querySelector(".qsa-sidebar-chat");
    if (!sidebar) return;
    sidebar.innerHTML = "";

    if (sidebarState.authStatus === "checking") {
      renderCenteredSidebarState(sidebar, {
        title: "Checking sign-in",
        body: "Checking your Google session before loading your Firestore-backed chats.",
        loading: true
      });
      return;
    }

    if (sidebarState.authStatus !== "signed_in" || !sidebarState.user) {
      renderCenteredSidebarState(sidebar, {
        title: "Sign in to continue",
        body: "Google sign-in is required. Your sidebar chats are stored in Firestore and persist across sessions.",
        error: sidebarState.authError,
        showLogin: true
      });
      return;
    }

    sidebar.appendChild(createSidebarHeader(sidebarState.view === "list" ? "Chats" : "Quiz Solver AI", {
      showList: true,
      showNewChat: true
    }));

    if (sidebarState.view === "list") {
      renderChatList(sidebar);
    } else {
      renderChatView(sidebar);
    }

    // Footer: Auth
    renderAuthFooter(sidebar);
  }

  function renderChatList(sidebar) {
    const listArea = document.createElement("div");
    Object.assign(listArea.style, {
      flex: "1",
      overflowY: "auto",
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    });

    if (sidebarState.chats.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, { textAlign: "center", padding: "40px 10px", color: "#64748b", fontSize: "12px" });
      if (sidebarState.chatStatus === "loading") {
        empty.textContent = "Loading chats from Firestore...";
      } else if (sidebarState.chatStatus === "error") {
        empty.textContent = sidebarState.chatError || "Failed to load chats.";
      } else {
        empty.textContent = "No chats yet. Click + to start.";
      }
      listArea.appendChild(empty);
    } else {
      for (const chat of sidebarState.chats) {
        const item = document.createElement("div");
        Object.assign(item.style, {
          padding: "10px 12px",
          borderRadius: "8px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: chat.id === sidebarState.activeChatId ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
          border: chat.id === sidebarState.activeChatId ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
          transition: "background 0.15s"
        });

        item.addEventListener("mouseenter", () => { if (chat.id !== sidebarState.activeChatId) item.style.backgroundColor = "rgba(255,255,255,0.06)"; });
        item.addEventListener("mouseleave", () => { if (chat.id !== sidebarState.activeChatId) item.style.backgroundColor = "rgba(255,255,255,0.03)"; });

        const textDiv = document.createElement("div");
        Object.assign(textDiv.style, { overflow: "hidden" });

        const titleEl = document.createElement("div");
        Object.assign(titleEl.style, { fontSize: "12px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        titleEl.textContent = chat.title;
        textDiv.appendChild(titleEl);

        const meta = document.createElement("div");
        Object.assign(meta.style, { fontSize: "10px", color: "#64748b", marginTop: "2px" });
        const msgCount = (chat.messages || []).length;
        meta.textContent = `${msgCount} messages`;
        textDiv.appendChild(meta);

        item.appendChild(textDiv);

        item.addEventListener("click", () => {
          sidebarState.activeChatId = chat.id;
          sidebarState.activeMessages = [...(chat.messages || [])];
          sidebarState.view = "chat";
          renderSidebarContent(sidebar);
        });

        // Delete button
        const delBtn = document.createElement("button");
        Object.assign(delBtn.style, {
          background: "none", border: "none", color: "#64748b",
          cursor: "pointer", fontSize: "14px", padding: "2px 4px", flexShrink: "0"
        });
        delBtn.textContent = "🗑";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          sidebarState.chats = sidebarState.chats.filter(c => c.id !== chat.id);
          if (sidebarState.activeChatId === chat.id) {
            sidebarState.activeChatId = null;
            sidebarState.activeMessages = [];
          }
          saveChatsToLocal();
          // Also delete from Firebase if signed in and not local
          if (sidebarState.user && !chat.id.startsWith("local_")) {
            chrome.runtime.sendMessage({ type: "firebase_delete_chat", chatId: chat.id });
          }
          renderSidebarContent(sidebar);
        });
        item.appendChild(delBtn);

        listArea.appendChild(item);
      }
    }

    sidebar.appendChild(listArea);
  }

  function renderChatView(sidebar) {
    // Messages area
    const messagesArea = document.createElement("div");
    messagesArea.className = "qsa-sidebar-messages";
    Object.assign(messagesArea.style, {
      flex: "1",
      overflowY: "auto",
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    });

    if (sidebarState.chatStatus === "loading" && sidebarState.activeMessages.length === 0) {
      const loading = document.createElement("div");
      Object.assign(loading.style, { textAlign: "center", padding: "40px 10px", color: "#64748b", fontSize: "12px" });
      loading.textContent = "Loading your chats...";
      messagesArea.appendChild(loading);
    } else if (sidebarState.chatStatus === "error" && sidebarState.activeMessages.length === 0) {
      const error = document.createElement("div");
      Object.assign(error.style, { textAlign: "center", padding: "40px 10px", color: "#fca5a5", fontSize: "12px" });
      error.textContent = sidebarState.chatError || "Failed to load chats.";
      messagesArea.appendChild(error);
    } else if (sidebarState.activeMessages.length === 0) {
      const welcome = document.createElement("div");
      Object.assign(welcome.style, { textAlign: "center", padding: "40px 10px", color: "#64748b", fontSize: "12px" });
      welcome.textContent = "Ask me anything about your quiz!";
      messagesArea.appendChild(welcome);
    } else {
      for (const msg of sidebarState.activeMessages) {
        const bubble = document.createElement("div");
        const isUser = msg.role === "user";

        Object.assign(bubble.style, {
          padding: "10px 14px",
          borderRadius: "12px",
          maxWidth: "90%",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          fontSize: "13px",
          lineHeight: "1.5",
          alignSelf: isUser ? "flex-end" : "flex-start",
          backgroundColor: isUser ? "rgba(99, 102, 241, 0.2)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${isUser ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
          color: "#e2e8f0"
        });

        if (msg.loading) {
          bubble.style.opacity = "0.6";
          bubble.style.fontStyle = "italic";
        }

        bubble.textContent = msg.content;
        messagesArea.appendChild(bubble);
      }
    }

    sidebar.appendChild(messagesArea);

    // Scroll to bottom
    requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; });

    // Input area
    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, {
      padding: "12px 14px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      gap: "8px",
      flexShrink: "0"
    });

    const input = document.createElement("input");
    input.className = "qsa-sidebar-input";
    input.placeholder = "Ask something...";
    Object.assign(input.style, {
      flex: "1",
      padding: "8px 12px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "8px",
      color: "#e2e8f0",
      fontSize: "13px",
      fontFamily: "inherit",
      outline: "none"
    });

    const sendBtn = document.createElement("button");
    Object.assign(sendBtn.style, {
      padding: "8px 14px",
      background: "rgba(99, 102, 241, 0.8)",
      border: "none",
      borderRadius: "8px",
      color: "#fff",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "500",
      fontFamily: "inherit"
    });
    sendBtn.textContent = "Send";

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      ensureActiveChat(sidebar);

      sidebarState.activeMessages.push({ role: "user", content: text, timestamp: new Date().toISOString() });
      sidebarState.activeMessages.push({ role: "assistant", content: "Thinking...", loading: true });
      renderSidebarContent(sidebar);
      input.value = "";

      chrome.runtime.sendMessage({
        type: "chat_message",
        userMessage: text,
        conversationHistory: sidebarState.activeMessages.filter(m => !m.loading)
      }, (response) => {
        sidebarState.activeMessages = sidebarState.activeMessages.filter(m => !m.loading);

        if (response && response.type === "chat_response") {
          sidebarState.activeMessages.push({ role: "assistant", content: response.response, timestamp: new Date().toISOString() });
        } else {
          sidebarState.activeMessages.push({ role: "assistant", content: "Error: " + (response?.error || "Failed"), timestamp: new Date().toISOString() });
        }
        renderSidebarContent(sidebar);
        autoSaveChat();
      });
    }

    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    sidebar.appendChild(inputArea);

    // Focus input
    requestAnimationFrame(() => input.focus());
  }

  function renderAuthFooter(sidebar) {
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "10px 14px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: "0",
      fontSize: "11px"
    });

    // Auth is mandatory, so user is always signed in here
    const userInfo = document.createElement("div");
    Object.assign(userInfo.style, { display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" });

    if (sidebarState.user.photoUrl) {
      const avatar = document.createElement("img");
      avatar.src = sidebarState.user.photoUrl;
      Object.assign(avatar.style, { width: "20px", height: "20px", borderRadius: "50%" });
      userInfo.appendChild(avatar);
    }

    const name = document.createElement("span");
    Object.assign(name.style, { color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    name.textContent = sidebarState.user.displayName || sidebarState.user.email;
    userInfo.appendChild(name);
    footer.appendChild(userInfo);

    const logoutBtn = document.createElement("button");
    Object.assign(logoutBtn.style, {
      background: "none", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "4px", color: "#94a3b8", cursor: "pointer",
      fontSize: "10px", padding: "3px 8px", flexShrink: "0"
    });
    logoutBtn.textContent = "Sign out";
    logoutBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "firebase_logout" }, () => {
        authState.user = null;
        authState.checked = true;
        sidebarState.user = null;
        sidebarState.authStatus = "signed_out";
        sidebarState.chatStatus = "idle";
        sidebarState.authError = "";
        clearSidebarChats();
        openSidebar();
        renderSidebarContent(sidebar);
      });
    });
    footer.appendChild(logoutBtn);

    sidebar.appendChild(footer);
  }

  function hydrateChatsFromFirebase(sidebar) {
    sidebarState.chatStatus = "loading";
    sidebarState.chatError = "";
    renderSidebarContent(sidebar);

    chrome.runtime.sendMessage({ type: "firebase_get_chats" }, (res) => {
      if (res && Array.isArray(res.chats) && res.chats.length > 0) {
        sidebarState.chats = [...res.chats];

        const activeChat = sidebarState.chats.find(c => c.id === sidebarState.activeChatId) || sidebarState.chats[0];
        sidebarState.activeChatId = activeChat?.id || null;
        sidebarState.activeMessages = [...(activeChat?.messages || [])];
        sidebarState.chatStatus = "ready";
        sidebarState.chatError = "";
        saveChatsToLocal();
        renderSidebarContent(sidebar);
        return;
      }

      if (res?.error) {
        sidebarState.chatStatus = "error";
        sidebarState.chatError = res.error;
        renderSidebarContent(sidebar);
        return;
      }

      sidebarState.chatStatus = "ready";
      sidebarState.chatError = "";
      renderSidebarContent(sidebar);
    });
  }

  function ensureActiveChat(sidebar) {
    if (sidebarState.activeChatId || !sidebarState.user) return;
    createNewChat(sidebar, { render: false });
  }

  function createNewChat(sidebar, options = {}) {
    if (!sidebarState.user) {
      openSidebar();
      renderSidebarContent(sidebar);
      return;
    }

    const title = "Chat " + new Date().toLocaleTimeString();
    const chatId = "local_" + Date.now();

    const newChat = {
      id: chatId,
      title: title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    sidebarState.chats.unshift(newChat);
    sidebarState.activeChatId = chatId;
    sidebarState.activeMessages = [];
    sidebarState.view = "chat";
    sidebarState.chatStatus = "ready";
    sidebarState.chatError = "";

    saveChatsToLocal();

    chrome.runtime.sendMessage({ type: "firebase_create_chat", title }, (res) => {
      if (res && res.chat) {
        newChat.id = res.chat.id;
        sidebarState.activeChatId = res.chat.id;
        saveChatsToLocal();
        autoSaveChat();
      }
      if (options.render !== false) {
        renderSidebarContent(sidebar);
      }
    });

    if (options.render !== false) {
      renderSidebarContent(sidebar);
    }
  }

  function autoSaveChat() {
    if (!sidebarState.activeChatId) return;

    const nonLoadingMessages = sidebarState.activeMessages.filter(m => !m.loading);

    // Always save locally
    const chat = sidebarState.chats.find(c => c.id === sidebarState.activeChatId);
    if (chat) {
      chat.messages = [...nonLoadingMessages];
      chat.updatedAt = new Date().toISOString();
      // Auto-title from first user message
      if (!chat.titleSet && nonLoadingMessages.length > 0) {
        const firstUser = nonLoadingMessages.find(m => m.role === "user");
        if (firstUser) {
          chat.title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "..." : "");
          chat.titleSet = true;
        }
      }
    }
    saveChatsToLocal();

    // Also sync to Firebase if logged in
    if (sidebarState.user && !sidebarState.activeChatId.startsWith("local_")) {
      chrome.runtime.sendMessage({
        type: "firebase_save_messages",
        chatId: sidebarState.activeChatId,
        messages: nonLoadingMessages
      });
    }
  }

  function saveChatsToLocal() {
    chrome.storage.local.set({ qsa_sidebar_chats: sidebarState.chats });
  }

  function teardownExtensionUi() {
    clearDisplays();
    clearQuestionDots();
    removeSidebar();
    removeRegionOverlay();
  }

  function clearQuestionDots() {
    for (const dotState of questionDots.values()) {
      if (dotState?.repositionDot) {
        window.removeEventListener("scroll", dotState.repositionDot);
        window.removeEventListener("resize", dotState.repositionDot);
      }
      dotState?.dot?.remove();
    }
    questionDots.clear();
  }

  function removeSidebar() {
    document.querySelector(".qsa-sidebar-chat")?.remove();
    document.querySelector(".qsa-sidebar-chat-toggle")?.remove();
  }

  function removeRegionOverlay() {
    document.querySelector(".qsa-region-overlay")?.remove();
    document.querySelector(".qsa-region-selection")?.remove();
  }

  // ─── Clear Displays ────────────────────────────────────────────────
  function clearDisplays() {
    const dot = document.querySelector(".qsa-floating-dot");
    const card = document.querySelector(".qsa-floating-card");
    const questionCard = document.querySelector(".qsa-question-dot-card");
    const hashBanner = document.querySelector(".qsa-url-hash-banner");
    clearTimeout(floatingCardHideTimer);
    if (dot) dot.remove();
    if (card) card.remove();
    if (questionCard) questionCard.remove();
    if (hashBanner) hashBanner.remove();
    lastFloatingAnswerKey = "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  // ─── Region Screenshot ─────────────────────────────────────────────
  function startRegionSelect() {
    if (!isExtensionActive) return;
    if (!isSignedIn()) {
      openSidebar();
      return;
    }

    if (document.querySelector(".qsa-region-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "qsa-region-overlay";
    Object.assign(overlay.style, {
      position: "fixed", top: "0", left: "0",
      width: "100vw", height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      cursor: "crosshair", zIndex: "2147483647",
      userSelect: "none"
    });

    const selBox = document.createElement("div");
    selBox.className = "qsa-region-selection";
    Object.assign(selBox.style, {
      position: "fixed",
      border: "2px dashed #6366f1",
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      display: "none", zIndex: "2147483647",
      pointerEvents: "none"
    });

    let startX, startY, isDragging = false;

    overlay.addEventListener("mousedown", (e) => {
      startX = e.clientX; startY = e.clientY; isDragging = true;
      selBox.style.display = "block";
      selBox.style.left = startX + "px"; selBox.style.top = startY + "px";
      selBox.style.width = "0"; selBox.style.height = "0";
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      selBox.style.left = Math.min(startX, e.clientX) + "px";
      selBox.style.top = Math.min(startY, e.clientY) + "px";
      selBox.style.width = Math.abs(e.clientX - startX) + "px";
      selBox.style.height = Math.abs(e.clientY - startY) + "px";
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!isDragging) return; isDragging = false;

      const rect = {
        x: Math.min(startX, e.clientX), y: Math.min(startY, e.clientY),
        width: Math.abs(e.clientX - startX), height: Math.abs(e.clientY - startY)
      };
      overlay.remove(); selBox.remove();
      if (rect.width < 20 || rect.height < 20) return;

      try {
        const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
        if (response && response.dataUrl) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL("image/png").split(",")[1];

            chrome.runtime.sendMessage({
              type: "solve_question",
              question: "What is the answer to the question shown in this image?",
              options: [], questionType: "image",
              imageBase64: base64,
              questionHash: "region_" + Date.now(),
              userAnswer: null
            }, (resp) => {
              if (resp && resp.type !== "error") {
                const answerData = {
                  ...resp,
                  question: "What is the answer to the question shown in this image?",
                  userAnswer: null,
                  questionType: "image",
                  options: []
                };

                addToSidebar(answerData);
                displayAnswer(answerData);
              } else if (resp && resp.error) {
                addToSidebar({
                  answer: "Error: " + resp.error,
                  full: "Error: " + resp.error,
                  explanation: "",
                  confidence: "low",
                  question: "What is the answer to the question shown in this image?",
                  userAnswer: null,
                  questionType: "image",
                  options: []
                });
                displayError(resp.error);
              }
            });
          };
          img.src = response.dataUrl;
        }
      } catch { /* silent */ }
    });

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { overlay.remove(); selBox.remove(); }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(selBox);
    overlay.setAttribute("tabindex", "0");
    overlay.focus();
  }

  // ─── Question Detection ────────────────────────────────────────────
  function detectQuestions() {
    const results = [];
    results.push(...detectMCQ());
    results.push(...detectFillBlank());
    if (settings.detectImages !== false) results.push(...detectImageQuestions());
    results.push(...detectShadowDOM(document.body));
    return results;
  }

  function detectMCQ() {
    const results = [];
    const seenContainers = new Set();

    function pushUniqueMcq(result) {
      if (!result?.element || seenContainers.has(result.element)) return;
      seenContainers.add(result.element);
      results.push(result);
    }

    // Radio groups
    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      const name = radio.name || radio.getAttribute("name") || "unnamed";
      if (!radioGroups[name]) radioGroups[name] = [];
      radioGroups[name].push(radio);
    });

    for (const [name, radios] of Object.entries(radioGroups)) {
      const { container, text: questionText } = getQuestionContext(radios[0], radios);
      if (!container) continue;
      const options = extractChoiceOptions(container, radios);
      if (options.length < 2) continue;
      const questionStem = normalizeQuestionStem(questionText, { options });
      if (!questionStem || questionStem.length < 5) continue;

      const selected = radios.find(r => r.checked);
      pushUniqueMcq({
        type: "mcq_single", text: questionStem, options,
        element: container, hasImage: containerHasImage(container),
        userInteracted: !!selected,
        userAnswer: selected ? extractChoiceLabel(selected, container) : null
      });
    }

    // Checkbox groups
    const checkboxGroups = {};
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const container = findQuestionContainer(cb);
      if (!container) return;
      const key = container.dataset.qsaGroup || container.id || generateGroupKey(container);
      container.dataset.qsaGroup = key;
      if (!checkboxGroups[key]) checkboxGroups[key] = { container, inputs: [] };
      checkboxGroups[key].inputs.push(cb);
    });

    for (const { container, inputs } of Object.values(checkboxGroups)) {
      if (inputs.length < 2) continue;
      const context = getQuestionContext(inputs[0], inputs);
      const options = extractChoiceOptions(context.container || container, inputs);
      const questionStem = normalizeQuestionStem(context.text, { options });
      const questionContainer = context.container || container;
      if (!questionStem || questionStem.length < 5) continue;
      const selected = inputs.filter(cb => cb.checked);
      pushUniqueMcq({
        type: "mcq_multi", text: questionStem, options,
        element: questionContainer, hasImage: containerHasImage(questionContainer),
        userInteracted: selected.length > 0,
        userAnswer: selected.length > 0 ? selected.map(cb => extractChoiceLabel(cb, questionContainer)).filter(Boolean).join(", ") : null
      });
    }

    // ARIA-based
    document.querySelectorAll('[role="radiogroup"], [role="listbox"]').forEach(group => {
      const items = group.querySelectorAll('[role="radio"], [role="option"]');
      if (items.length < 2) return;
      const { container, text: questionText } = getQuestionContext(group, Array.from(items));
      const questionContainer = container || group;
      const options = extractChoiceOptions(questionContainer, Array.from(items));
      const questionStem = normalizeQuestionStem(questionText, { options });
      if (!questionStem || questionStem.length < 5) return;

      const selected = Array.from(items).find(item =>
        item.getAttribute("aria-checked") === "true" || item.getAttribute("aria-selected") === "true"
      );
      pushUniqueMcq({
        type: "mcq_single", text: questionStem, options,
        element: questionContainer, hasImage: containerHasImage(questionContainer),
        userInteracted: !!selected,
        userAnswer: selected ? extractChoiceLabel(selected, questionContainer) : null
      });
    });

    // Standalone ARIA choice items without a radiogroup/listbox wrapper.
    const ariaChoiceGroups = new Map();
    document.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]').forEach(item => {
      if (item.closest('[role="radiogroup"], [role="listbox"]')) return;
      const container = findQuestionContainer(item);
      if (!container || seenContainers.has(container)) return;

      if (!ariaChoiceGroups.has(container)) {
        ariaChoiceGroups.set(container, []);
      }
      ariaChoiceGroups.get(container).push(item);
    });

    for (const [container, items] of ariaChoiceGroups.entries()) {
      if (items.length < 2) continue;
      const { text: questionText } = getQuestionContext(items[0], items);
      const options = extractChoiceOptions(container, items);
      const questionStem = normalizeQuestionStem(questionText, { options });
      if (!questionStem || questionStem.length < 5 || options.length < 2) continue;

      const selected = items.filter(item =>
        item.getAttribute("aria-checked") === "true" || item.getAttribute("aria-selected") === "true"
      );
      const isMulti = items.some(item => item.getAttribute("role") === "checkbox");

      pushUniqueMcq({
        type: isMulti ? "mcq_multi" : "mcq_single",
        text: questionStem,
        options,
        element: container,
        hasImage: containerHasImage(container),
        userInteracted: selected.length > 0,
        userAnswer: selected.length > 0 ? selected.map(item => extractChoiceLabel(item, container)).filter(Boolean).join(", ") : null
      });
    }

    return results;
  }

  function detectFillBlank() {
    const results = [];

    document.querySelectorAll(
      'input[type="text"], textarea, [contenteditable="true"]'
    ).forEach(input => {
      if (input.closest('.qsa-sidebar-chat, .qsa-floating-dot, .qsa-floating-card')) return;
      if (input.type === "search" || input.type === "password" || input.type === "email") return;
      if (input.name && /search|login|email|password|username/i.test(input.name)) return;

      const { container, text: questionText } = getQuestionContext(input, [input]);
      if (!container) return;
      if (hasChoiceInputs(container)) return;
      const value = input.value || input.textContent || "";
      const questionStem = normalizeQuestionStem(questionText, { userAnswer: value });
      if (!questionStem || questionStem.length < 5) return;
      results.push({
        type: "fill_blank", text: questionStem, options: [],
        element: container, hasImage: containerHasImage(container),
        userInteracted: value.length > 0, userAnswer: value || null
      });
    });

    document.querySelectorAll('select').forEach(select => {
      if (select.closest('.qsa-sidebar-chat')) return;
      if (select.options.length < 2 || select.options.length > 30) return;

      const { container, text: questionText } = getQuestionContext(select, [select]);
      if (!container) return;
      if (hasChoiceInputs(container)) return;
      const options = Array.from(select.options).filter(o => o.value).map(o => o.textContent.trim());
      const selectedValue = select.selectedIndex > 0 ? select.options[select.selectedIndex].textContent.trim() : "";
      const questionStem = normalizeQuestionStem(questionText, { options, userAnswer: selectedValue });
      if (!questionStem || questionStem.length < 5) return;
      results.push({
        type: "cloze", text: questionStem, options,
        element: container, hasImage: containerHasImage(container),
        userInteracted: select.selectedIndex > 0,
        userAnswer: selectedValue || null
      });
    });

    return results;
  }

  function detectImageQuestions() {
    const results = [];
    document.querySelectorAll('img, canvas').forEach(el => {
      if (el.closest('.qsa-sidebar-chat, .qsa-floating-dot')) return;
      if (el.tagName === "IMG" && (el.width < 50 || el.height < 50)) return;

      const { container, text: questionText } = getQuestionContext(el, [el]);
      if (!container) return;
      if (!questionText || questionText.length < 3) return;
      if (results.some(r => r.element === container)) return;

      results.push({
        type: "image", text: questionText || "What is shown in this image?",
        options: [], element: container, hasImage: true,
        userInteracted: false, userAnswer: null
      });
    });
    return results;
  }

  function detectShadowDOM(root) {
    const results = [];
    if (!root) return results;
    const allEl = root.querySelectorAll("*");
    for (const el of allEl) {
      if (el.shadowRoot) {
        const radios = el.shadowRoot.querySelectorAll('input[type="radio"]');
        if (radios.length >= 2) {
          const container = radios[0].closest("form, fieldset, div, section") || el.shadowRoot;
          const questionText = cleanText(container).slice(0, 500);
          if (questionText.length >= 5) {
            const options = Array.from(radios).map(r => (findLabelForInput(r, el.shadowRoot) || "").trim()).filter(Boolean);
            results.push({
              type: "mcq_single", text: questionText, options,
              element: container, hasImage: false,
              userInteracted: Array.from(radios).some(r => r.checked), userAnswer: null
            });
          }
        }
        results.push(...detectShadowDOM(el.shadowRoot));
      }
    }
    return results;
  }

  // ─── DOM Helpers ───────────────────────────────────────────────────
  function findQuestionContainer(el) {
    const selectors = [
      '[role="listitem"]',
      '.Qr7Oae', '.geS5n', '.o3Dpx', '.M7eMe',
      '[class*="question"]', '[class*="quiz"]', '[class*="problem"]',
      '[class*="exercise"]', '[class*="prompt"]', '[class*="item"]',
      '[data-question]', '[data-quiz]',
      'fieldset',
      '[role="group"]', '[role="form"]',
      'li', 'article', 'section'
    ];
    for (const selector of selectors) {
      const match = el.closest(selector);
      if (match && match !== document.body && !isOverbroadQuestionContainer(match, el)) {
        return match;
      }
    }

    const fallbackForm = el.closest("form");
    if (fallbackForm && fallbackForm !== document.body && !isOverbroadQuestionContainer(fallbackForm, el)) {
      return fallbackForm;
    }

    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 6) {
      if (parent.children.length > 1 && !isOverbroadQuestionContainer(parent, el)) return parent;
      parent = parent.parentElement;
      depth++;
    }
    return el.parentElement;
  }

  function isOverbroadQuestionContainer(container, sourceEl) {
    if (!container || container === sourceEl) return false;

    const textLength = extractQuestionText(container, [sourceEl]).length;
    const interactiveCount = container.querySelectorAll(
      'input, textarea, select, [contenteditable="true"], [role="radio"], [role="checkbox"], [role="option"], [role="textbox"]'
    ).length;
    const nestedQuestionCount = container.querySelectorAll(
      '[role="listitem"], .Qr7Oae, fieldset, [data-question], [role="radiogroup"], [role="listbox"]'
    ).length;

    if (container.matches("form") && nestedQuestionCount > 1) return true;
    if (nestedQuestionCount > 3) return true;
    if (interactiveCount > 12) return true;
    if (textLength > 1200) return true;

    return false;
  }

  function getQuestionContext(sourceEl, excludeEls = []) {
    const initialContainer = findQuestionContainer(sourceEl);
    if (!initialContainer) {
      return { container: null, text: "" };
    }

    const sourceValue = getElementCurrentValue(sourceEl);
    let bestContainer = initialContainer;
    let bestText = "";
    let bestScore = -Infinity;
    let current = initialContainer;
    let depth = 0;

    while (current && current !== document.body && depth < 6) {
      const candidateText = extractQuestionText(current, excludeEls);
      const candidateScore = scoreQuestionContext(current, candidateText, sourceValue);

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestContainer = current;
        bestText = candidateText;
      }

      current = current.parentElement;
      depth++;
    }

    return {
      container: bestContainer,
      text: bestText
    };
  }

  function scoreQuestionContext(container, text, sourceValue = "") {
    if (!text) return -Infinity;

    const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedValue = String(sourceValue || "").toLowerCase().replace(/\s+/g, " ").trim();
    const length = normalizedText.length;
    const interactiveCount = container.querySelectorAll(
      'input, textarea, select, [contenteditable="true"], [role="radio"], [role="checkbox"], [role="option"], [role="textbox"]'
    ).length;

    let score = Math.min(length, 220);
    if (length < 12) score -= 180;
    if (length > 700) score -= Math.min(900, (length - 700) * 1.5);
    if (/[?]/.test(text)) score += 40;
    if (/\b(select|choose|enter|fill|which|what|how|why|when|where|correct|answer|question|option)\b/i.test(text)) {
      score += 24;
    }
    if (container.matches('[role="listitem"], .Qr7Oae, fieldset, [class*="question"], [class*="quiz"], [class*="problem"], [class*="prompt"], [data-question], [data-quiz], [role="group"], [role="form"]')) {
      score += 40;
    }
    if (container.matches("form")) score -= 220;
    if (container.querySelector("label, legend, h1, h2, h3, h4, h5, h6, p")) {
      score += 20;
    }
    if (interactiveCount > 10) {
      score -= Math.min(400, interactiveCount * 18);
    }

    if (normalizedValue) {
      if (normalizedText === normalizedValue) score -= 600;
      if (normalizedText.startsWith(normalizedValue) && length <= normalizedValue.length + 12) score -= 300;
    }

    return score;
  }

  function extractQuestionText(container, excludeEls = []) {
    if (!container) return "";
    const clone = container.cloneNode(true);
    for (const excludedEl of excludeEls) {
      if (!(excludedEl instanceof Element) || !container.contains(excludedEl)) continue;
      const cloneMatch = getClonedElementMatch(container, clone, excludedEl);
      const removable = cloneMatch?.closest(
        'label, [role="radio"], [role="checkbox"], [role="option"], [role="listitem"], [class*="option"], [class*="choice"], [class*="answer"]'
      ) || cloneMatch;
      if (removable && removable !== clone) {
        removable.remove();
      }
    }
    clone.querySelectorAll('input, textarea, select, button, script, style, [class*="qsa-"], [contenteditable="true"], [role="textbox"]').forEach(el => el.remove());
    return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getClonedElementMatch(originalRoot, clonedRoot, targetEl) {
    const path = [];
    let current = targetEl;

    while (current && current !== originalRoot) {
      const parent = current.parentElement;
      if (!parent) return null;
      path.unshift(Array.from(parent.children).indexOf(current));
      current = parent;
    }

    if (current !== originalRoot) return null;

    let cloneCursor = clonedRoot;
    for (const childIndex of path) {
      cloneCursor = cloneCursor.children[childIndex];
      if (!cloneCursor) return null;
    }

    return cloneCursor;
  }

  function normalizeQuestionStem(questionText, { options = [], userAnswer = "" } = {}) {
    let stem = String(questionText || "").replace(/\s+/g, " ").trim();
    if (!stem) return "";

    stem = stripQuestionTailAfterPrompt(stem, { options, userAnswer });
    stem = stripEmbeddedUserAnswer(stem, userAnswer);
    stem = stripOptionTail(stem, options);
    stem = stem.replace(/\s*\*+\s*$/, "").trim();
    stem = stem.replace(/\bYour answer\b\s*$/i, "").trim();

    return stem;
  }

  function stripQuestionTailAfterPrompt(text, { options = [], userAnswer = "" } = {}) {
    const normalizedOptions = (options || [])
      .map(option => String(option || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const normalizedAnswer = String(userAnswer || "").replace(/\s+/g, " ").trim();

    const lastQuestionMark = text.lastIndexOf("?");
    if (lastQuestionMark >= 0 && lastQuestionMark < text.length - 1) {
      const tail = text.slice(lastQuestionMark + 1).trim();
      const compactTail = tail.replace(/\s+/g, "");
      const looksLikeOptionTail =
        normalizedOptions.length > 0 ||
        !!normalizedAnswer ||
        /^(\*+)?[A-Za-z0-9,./()\- ]{1,120}$/.test(tail) ||
        /^[A-Za-z0-9]{6,}$/.test(compactTail);

      if (looksLikeOptionTail) {
        return text.slice(0, lastQuestionMark + 1).trim();
      }
    }

    const requiredMarkerIndex = text.search(/\s\*+\s*/);
    if (requiredMarkerIndex > 8) {
      const tail = text.slice(requiredMarkerIndex).replace(/^\s*\*+\s*/, "").trim();
      const compactTail = tail.replace(/\s+/g, "");
      const looksLikeRequiredTail =
        normalizedOptions.length > 0 ||
        !!normalizedAnswer ||
        /^your answer$/i.test(tail) ||
        /^([A-Za-z0-9,./()\- ]{1,120})$/.test(tail) ||
        /^[A-Za-z0-9]{4,}$/.test(compactTail);

      if (looksLikeRequiredTail) {
        return text.slice(0, requiredMarkerIndex).trim();
      }
    }

    return text;
  }

  function stripEmbeddedUserAnswer(text, userAnswer) {
    const answer = String(userAnswer || "").replace(/\s+/g, " ").trim();
    if (!answer) return text;

    const escapedAnswer = escapeRegExp(answer);
    return text
      .replace(new RegExp(`\\bYour answer\\b\\s*(?:\\*+\\s*)?${escapedAnswer}\\s*$`, "i"), "")
      .replace(new RegExp(`(?:\\*+\\s*)?${escapedAnswer}\\s*$`, "i"), "")
      .trim();
  }

  function stripOptionTail(text, options) {
    const normalizedOptions = (options || [])
      .map(option => String(option || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (normalizedOptions.length < 2) return text;

    const lowerText = text.toLowerCase();
    const hits = normalizedOptions
      .map(option => ({ option, index: lowerText.indexOf(option.toLowerCase()) }))
      .filter(hit => hit.index >= 0);

    if (hits.length < 2) return text;

    const firstOptionIndex = Math.min(...hits.map(hit => hit.index));
    const head = text.slice(0, firstOptionIndex).trim();
    const tail = text.slice(firstOptionIndex).toLowerCase();
    const optionsInTail = normalizedOptions.filter(option => tail.includes(option.toLowerCase())).length;

    if (head.length >= 8 && optionsInTail >= Math.min(2, normalizedOptions.length)) {
      return head.replace(/\s*[:\-]+$/, "").trim();
    }

    return text;
  }

  function getElementCurrentValue(el) {
    if (!el) return "";
    if (typeof el.value === "string" && el.value.trim()) {
      return el.value.trim();
    }
    if (el.tagName === "SELECT" && el.selectedIndex >= 0) {
      return el.options?.[el.selectedIndex]?.textContent?.trim() || "";
    }
    if (el.contentEditable === "true" || el.getAttribute("role") === "textbox") {
      return cleanText(el);
    }
    return cleanText(el);
  }

  function findLabelForInput(input, root) {
    const rootEl = root || document;
    if (input.id) {
      const label = rootEl.querySelector(`label[for="${input.id}"]`);
      if (label) return cleanText(label);
    }
    const parentLabel = input.closest("label");
    if (parentLabel) return cleanText(parentLabel);

    const sibling = input.nextSibling;
    if (sibling && sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) return sibling.textContent.trim();
    const nextEl = input.nextElementSibling;
    if (nextEl && ["SPAN", "DIV", "P"].includes(nextEl.tagName)) return cleanText(nextEl);
    return "";
  }

  function extractChoiceOptions(container, choiceEls = []) {
    const choices = choiceEls.length > 0
      ? Array.from(choiceEls)
      : Array.from(container?.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"]') || []);

    const labels = choices
      .map(choice => extractChoiceLabel(choice, container))
      .filter(Boolean);

    return dedupeStrings(labels);
  }

  function extractChoiceLabel(choiceEl, container) {
    if (!choiceEl) return "";

    const ariaLabel = choiceEl.getAttribute?.("aria-label");
    if (ariaLabel && !/^option$/i.test(ariaLabel.trim())) {
      return ariaLabel.replace(/\s+/g, " ").trim();
    }

    if (choiceEl.matches?.('input[type="radio"], input[type="checkbox"]')) {
      const inputLabel = findLabelForInput(choiceEl, container || document);
      if (inputLabel) return inputLabel;
    }

    const labelLike = choiceEl.closest?.(
      'label, [role="listitem"], [class*="option"], [class*="choice"], [class*="answer"], .docssharedWizToggleLabeledContainer'
    );
    if (labelLike) {
      const text = cleanText(labelLike);
      if (text) return text;
    }

    const descendants = choiceEl.querySelectorAll?.('span, div, p');
    if (descendants?.length) {
      for (const node of descendants) {
        const text = cleanText(node);
        if (text && text.length < 160) {
          return text;
        }
      }
    }

    return cleanText(choiceEl);
  }

  function dedupeStrings(values) {
    const seen = new Set();
    const output = [];

    for (const value of values) {
      const normalized = String(value || "").replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
    }

    return output;
  }

  function hasChoiceInputs(container) {
    if (!container) return false;
    return container.querySelector(
      'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"], [role="radiogroup"], [role="listbox"]'
    ) !== null;
  }

  function containerHasImage(container) {
    if (!container) return false;
    return container.querySelector("img, canvas, svg[class*='image']") !== null;
  }

  function cleanText(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function generateGroupKey(el) {
    return "g_" + Math.random().toString(36).slice(2, 9);
  }

  function escapeHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getConfidenceColor(confidence) {
    if (confidence === "high") return "rgba(34, 197, 94, 0.9)";
    if (confidence === "medium") return "rgba(245, 158, 11, 0.9)";
    if (confidence === "low") return "rgba(239, 68, 68, 0.9)";
    return "rgba(99, 102, 241, 0.9)";
  }

  function getSubtleDotColor(alpha = 0.24) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  async function hashQuestion(text, options = []) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    const optionStr = (options || []).map(o => o.toLowerCase().replace(/\s+/g, " ").trim()).sort().join("|");
    const raw = normalized + "::" + optionStr;
    const data = new TextEncoder().encode(raw);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function captureQuestionImage(element) {
    if (!element) return null;
    try {
      const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
      if (!response || !response.dataUrl) return null;

      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return null;

      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(rect.width * dpr));
          canvas.height = Math.max(1, Math.round(rect.height * dpr));
          const ctx = canvas.getContext("2d");

          ctx.drawImage(
            img,
            rect.x * dpr, rect.y * dpr,
            rect.width * dpr, rect.height * dpr,
            0, 0, canvas.width, canvas.height
          );

          resolve(canvas.toDataURL("image/png").split(",")[1]);
        };
        img.onerror = () => resolve(null);
        img.src = response.dataUrl;
      });
    } catch { /* skip */ }
    return null;
  }

  // ─── Inject Styles ─────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    .qsa-question-dot {
      opacity: 0.7;
      transition: all 0.2s ease !important;
    }
    .qsa-question-dot:hover {
      opacity: 1 !important;
    }
    .qsa-dot-solved {
      background-color: rgba(34, 197, 94, 0.5) !important;
      transform: scale(1) !important;
    }
    .qsa-sidebar-chat * {
      box-sizing: border-box;
    }
    .qsa-sidebar-chat ::-webkit-scrollbar {
      width: 4px;
    }
    .qsa-sidebar-chat ::-webkit-scrollbar-track {
      background: transparent;
    }
    .qsa-sidebar-chat ::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
    }
    .qsa-floating-card::-webkit-scrollbar {
      width: 4px;
    }
    .qsa-floating-card::-webkit-scrollbar-track {
      background: transparent;
    }
    .qsa-floating-card::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
    }
    .qsa-sidebar-input:focus {
      border-color: rgba(99, 102, 241, 0.5) !important;
    }
  `;
  document.head.appendChild(style);

  // ─── Boot ──────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
