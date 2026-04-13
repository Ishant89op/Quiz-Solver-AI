(function () {
  const DEBOUNCE_DEFAULT = 1000;
  const processedHashes = new Set();
  let settings = {};
  let debounceTimer = null;
  let observer = null;
  let isProcessing = false;

  const LOG_PREFIX = "%c[Quiz Solver AI]";
  const LOG_STYLE = "color: #6366f1; font-weight: bold;";

  async function init() {
    console.log(LOG_PREFIX, LOG_STYLE, "Initializing...");

    try {
      const stored = await chrome.storage.local.get(null);
      settings = extractSettings(stored);
    } catch (e) {
      console.warn(LOG_PREFIX, LOG_STYLE, "Failed to load settings:", e);
      settings = {};
    }

    if (settings.enabled === false) {
      console.log(LOG_PREFIX, LOG_STYLE, "Extension is disabled.");
      return;
    }

    const currentHost = window.location.hostname;
    if (settings.siteList && settings.siteList.length > 0) {
      const blocked = settings.siteList.find(s => s.host === currentHost && !s.enabled);
      if (blocked) {
        console.log(LOG_PREFIX, LOG_STYLE, "Site is blocked:", currentHost);
        return;
      }
    }

    console.log(LOG_PREFIX, LOG_STYLE, "Active on", currentHost, "| Provider:", settings.provider || "default", "| Display:", settings.displayMode || "floatingDot");

    scanPage();
    startObserver();
    setupMessageListener();
    setupHotkeyListener();
  }

  function extractSettings(stored) {
    const s = {};
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("qsa_")) {
        s[key.slice(4)] = value;
      }
    }
    return s;
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
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

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "trigger_solve") {
        console.log(LOG_PREFIX, LOG_STYLE, "Manual trigger received");
        scanPage(true);
        sendResponse({ ok: true });
      } else if (msg.type === "trigger_region_select") {
        startRegionSelect();
        sendResponse({ ok: true });
      } else if (msg.type === "answer_push") {
        displayAnswer(msg.data);
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  function setupHotkeyListener() {
    document.addEventListener("keydown", (e) => {
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

  async function scanPage(forceTrigger = false) {
    if (isProcessing) return;
    if (!forceTrigger && settings.autoTrigger === false) return;
    if (settings.detectionEnabled === false) return;

    isProcessing = true;

    try {
      const questions = detectQuestions();
      console.log(LOG_PREFIX, LOG_STYLE, `Detected ${questions.length} question(s)`, questions.map(q => ({ type: q.type, text: q.text.slice(0, 60) })));

      if (questions.length === 0) {
        isProcessing = false;
        return;
      }

      for (const q of questions) {
        const hash = await hashQuestion(q.text, q.options);

        if (processedHashes.has(hash) && !forceTrigger) continue;
        processedHashes.add(hash);

        if (settings.triggerAfterInteraction && !q.userInteracted && !forceTrigger) continue;

        let imageBase64 = null;
        if (q.hasImage && settings.detectImages !== false && settings.includeScreenshot !== false) {
          imageBase64 = await captureQuestionImage(q.element);
        }

        console.log(LOG_PREFIX, LOG_STYLE, "Sending to AI:", q.text.slice(0, 80));

        chrome.runtime.sendMessage({
          type: "solve_question",
          question: q.text,
          options: q.options || [],
          questionType: q.type,
          imageBase64,
          questionHash: hash,
          userAnswer: q.userAnswer || null
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(LOG_PREFIX, LOG_STYLE, "Message error:", chrome.runtime.lastError.message);
            return;
          }
          if (response && response.type !== "error") {
            console.log(LOG_PREFIX, LOG_STYLE, "Answer received:", response.answer);
            displayAnswer({
              ...response,
              question: q.text,
              userAnswer: q.userAnswer
            });
          } else if (response && response.error) {
            console.error(LOG_PREFIX, LOG_STYLE, "AI error:", response.error);
            displayError(response.error);
          }
        });
      }
    } catch (err) {
      console.error(LOG_PREFIX, LOG_STYLE, "Scan error:", err);
    }

    isProcessing = false;
  }

  function detectQuestions() {
    const results = [];

    const mcqResults = detectMCQ();
    results.push(...mcqResults);

    const fillResults = detectFillBlank();
    results.push(...fillResults);

    if (settings.detectImages !== false) {
      const imgResults = detectImageQuestions();
      results.push(...imgResults);
    }

    const shadowResults = detectShadowDOM(document.body);
    results.push(...shadowResults);

    return results;
  }

  function detectMCQ() {
    const results = [];

    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      const name = radio.name || radio.getAttribute("name") || "unnamed";
      if (!radioGroups[name]) radioGroups[name] = [];
      radioGroups[name].push(radio);
    });

    for (const [name, radios] of Object.entries(radioGroups)) {
      const container = findQuestionContainer(radios[0]);
      if (!container) continue;

      const questionText = extractQuestionText(container, radios);
      if (!questionText || questionText.length < 5) continue;

      const options = radios.map(r => {
        const label = findLabelForInput(r);
        return label ? label.trim() : "";
      }).filter(Boolean);

      if (options.length < 2) continue;

      const selected = radios.find(r => r.checked);
      const userAnswer = selected ? (findLabelForInput(selected) || "").trim() : null;

      results.push({
        type: "mcq_single",
        text: questionText,
        options,
        element: container,
        hasImage: containerHasImage(container),
        userInteracted: !!selected,
        userAnswer
      });
    }

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

      const questionText = extractQuestionText(container, inputs);
      if (!questionText || questionText.length < 5) continue;

      const options = inputs.map(cb => {
        const label = findLabelForInput(cb);
        return label ? label.trim() : "";
      }).filter(Boolean);

      const selected = inputs.filter(cb => cb.checked);
      const userAnswer = selected.length > 0
        ? selected.map(cb => (findLabelForInput(cb) || "").trim()).join(", ")
        : null;

      results.push({
        type: "mcq_multi",
        text: questionText,
        options,
        element: container,
        hasImage: containerHasImage(container),
        userInteracted: selected.length > 0,
        userAnswer
      });
    }

    document.querySelectorAll('[role="radiogroup"], [role="listbox"]').forEach(group => {
      const questionText = extractQuestionText(group);
      if (!questionText || questionText.length < 5) return;

      const items = group.querySelectorAll('[role="radio"], [role="option"]');
      if (items.length < 2) return;

      const options = Array.from(items).map(item => cleanText(item)).filter(Boolean);
      const selected = Array.from(items).find(item =>
        item.getAttribute("aria-checked") === "true" || item.getAttribute("aria-selected") === "true"
      );

      results.push({
        type: "mcq_single",
        text: questionText,
        options,
        element: group,
        hasImage: containerHasImage(group),
        userInteracted: !!selected,
        userAnswer: selected ? cleanText(selected) : null
      });
    });

    return results;
  }

  function detectFillBlank() {
    const results = [];

    const inputs = document.querySelectorAll(
      'input[type="text"]:not([qsa-scanned]), textarea:not([qsa-scanned]), [contenteditable="true"]:not([qsa-scanned])'
    );

    inputs.forEach(input => {
      if (input.closest('.qsa-sidebar, .qsa-floating-dot, .qsa-tooltip, .qsa-hidden-field')) return;
      if (input.type === "search" || input.type === "password" || input.type === "email") return;
      if (input.name && /search|login|email|password|username/i.test(input.name)) return;

      const container = findQuestionContainer(input);
      if (!container) return;

      const questionText = extractQuestionText(container, [input]);
      if (!questionText || questionText.length < 5) return;

      input.setAttribute("qsa-scanned", "true");

      const value = input.value || input.textContent || "";

      results.push({
        type: "fill_blank",
        text: questionText,
        options: [],
        element: container,
        hasImage: containerHasImage(container),
        userInteracted: value.length > 0,
        userAnswer: value || null
      });
    });

    const selects = document.querySelectorAll('select:not([qsa-scanned])');
    selects.forEach(select => {
      if (select.closest('.qsa-sidebar, .qsa-floating-dot')) return;
      if (select.options.length < 2 || select.options.length > 30) return;

      const container = findQuestionContainer(select);
      if (!container) return;

      const questionText = extractQuestionText(container, [select]);
      if (!questionText || questionText.length < 5) return;

      select.setAttribute("qsa-scanned", "true");

      const options = Array.from(select.options)
        .filter(o => o.value)
        .map(o => o.textContent.trim());

      results.push({
        type: "cloze",
        text: questionText,
        options,
        element: container,
        hasImage: containerHasImage(container),
        userInteracted: select.selectedIndex > 0,
        userAnswer: select.selectedIndex > 0 ? select.options[select.selectedIndex].textContent.trim() : null
      });
    });

    return results;
  }

  function detectImageQuestions() {
    const results = [];

    document.querySelectorAll('img:not([qsa-scanned]), canvas:not([qsa-scanned])').forEach(el => {
      if (el.closest('.qsa-sidebar, .qsa-floating-dot')) return;
      if (el.tagName === "IMG" && (el.width < 50 || el.height < 50)) return;

      const container = findQuestionContainer(el);
      if (!container) return;

      const questionText = extractQuestionText(container, [el]);
      if (!questionText || questionText.length < 3) return;

      const alreadyCaptured = results.some(r => r.element === container);
      if (alreadyCaptured) return;

      el.setAttribute("qsa-scanned", "true");

      results.push({
        type: "image",
        text: questionText || "What is shown in this image?",
        options: [],
        element: container,
        hasImage: true,
        userInteracted: false,
        userAnswer: null
      });
    });

    return results;
  }

  function detectShadowDOM(root) {
    const results = [];

    if (!root) return results;

    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowQuestions = detectQuestionsInRoot(el.shadowRoot);
        results.push(...shadowQuestions);

        const nested = detectShadowDOM(el.shadowRoot);
        results.push(...nested);
      }
    }

    return results;
  }

  function detectQuestionsInRoot(root) {
    const results = [];

    const radios = root.querySelectorAll('input[type="radio"]');
    if (radios.length >= 2) {
      const container = radios[0].closest("form, fieldset, div, section") || root;
      const questionText = cleanText(container).slice(0, 500);
      if (questionText.length >= 5) {
        const options = Array.from(radios).map(r => {
          const label = findLabelForInput(r, root);
          return label ? label.trim() : "";
        }).filter(Boolean);

        results.push({
          type: "mcq_single",
          text: questionText,
          options,
          element: container,
          hasImage: false,
          userInteracted: Array.from(radios).some(r => r.checked),
          userAnswer: null
        });
      }
    }

    return results;
  }

  function findQuestionContainer(el) {
    const selectors = [
      '[class*="question"]', '[class*="quiz"]', '[class*="problem"]',
      '[class*="exercise"]', '[class*="prompt"]', '[class*="item"]',
      '[data-question]', '[data-quiz]',
      'fieldset', 'form',
      '[role="group"]', '[role="form"]',
      'li', 'article', 'section'
    ];

    for (const selector of selectors) {
      const match = el.closest(selector);
      if (match && match !== document.body) return match;
    }

    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 6) {
      if (parent.children.length > 1) return parent;
      parent = parent.parentElement;
      depth++;
    }

    return el.parentElement;
  }

  function extractQuestionText(container, excludeEls = []) {
    if (!container) return "";

    const clone = container.cloneNode(true);

    clone.querySelectorAll('input, textarea, select, button, script, style, [class*="qsa-"]').forEach(el => el.remove());

    let text = (clone.innerText || clone.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > 1000) text = text.slice(0, 1000);

    return text;
  }

  function findLabelForInput(input, root) {
    const rootEl = root || document;

    if (input.id) {
      const label = rootEl.querySelector(`label[for="${input.id}"]`);
      if (label) return cleanText(label);
    }

    const parentLabel = input.closest("label");
    if (parentLabel) {
      const text = cleanText(parentLabel);
      return text;
    }

    const parent = input.parentElement;
    if (parent) {
      const sibling = input.nextSibling;
      if (sibling && sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
        return sibling.textContent.trim();
      }
      const nextEl = input.nextElementSibling;
      if (nextEl && (nextEl.tagName === "SPAN" || nextEl.tagName === "DIV" || nextEl.tagName === "P")) {
        return cleanText(nextEl);
      }
    }

    return "";
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

  async function hashQuestion(text, options = []) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    const optionStr = (options || []).map(o => o.toLowerCase().replace(/\s+/g, " ").trim()).sort().join("|");
    const raw = normalized + "::" + optionStr;
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(buffer));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function captureQuestionImage(element) {
    if (!element) return null;

    try {
      const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
      if (response && response.dataUrl) {
        const base64 = response.dataUrl.split(",")[1];
        return base64;
      }
    } catch {
      // fallback: skip image
    }

    return null;
  }

  function startRegionSelect() {
    if (document.querySelector(".qsa-region-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "qsa-region-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      cursor: "crosshair",
      zIndex: "2147483647",
      userSelect: "none"
    });

    const selBox = document.createElement("div");
    selBox.className = "qsa-region-selection";
    Object.assign(selBox.style, {
      position: "fixed",
      border: "2px dashed #6366f1",
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      display: "none",
      zIndex: "2147483647",
      pointerEvents: "none"
    });

    let startX, startY, isDragging = false;

    overlay.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      selBox.style.display = "block";
      selBox.style.left = startX + "px";
      selBox.style.top = startY + "px";
      selBox.style.width = "0";
      selBox.style.height = "0";
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selBox.style.left = x + "px";
      selBox.style.top = y + "px";
      selBox.style.width = w + "px";
      selBox.style.height = h + "px";
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const rect = {
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        width: Math.abs(e.clientX - startX),
        height: Math.abs(e.clientY - startY)
      };

      overlay.remove();
      selBox.remove();

      if (rect.width < 20 || rect.height < 20) return;

      try {
        const response = await chrome.runtime.sendMessage({ type: "capture_tab" });
        if (response && response.dataUrl) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img,
              rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr,
              0, 0, canvas.width, canvas.height
            );
            const base64 = canvas.toDataURL("image/png").split(",")[1];

            chrome.runtime.sendMessage({
              type: "solve_question",
              question: "What is the answer to the question shown in this image?",
              options: [],
              questionType: "image",
              imageBase64: base64,
              questionHash: "region_" + Date.now(),
              userAnswer: null
            }, (resp) => {
              if (resp && resp.type !== "error") {
                displayAnswer(resp);
              } else if (resp && resp.error) {
                displayError(resp.error);
              }
            });
          };
          img.src = response.dataUrl;
        }
      } catch {
        // silent fail
      }
    });

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        selBox.remove();
      }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(selBox);
    overlay.focus();
    overlay.setAttribute("tabindex", "0");
  }

  function displayAnswer(data) {
    const mode = settings.displayMode || "floatingDot";

    switch (mode) {
      case "floatingDot":
        showFloatingDot(data);
        break;
      case "urlHash":
        showUrlHash(data);
        break;
      case "consoleLog":
        showConsoleLog(data);
        break;
      case "sidebar":
        showSidebar(data);
        break;
      case "tooltip":
        showTooltip(data);
        break;
      case "hiddenField":
        showHiddenField(data);
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
    const mode = settings.displayMode || "floatingDot";
    const errorData = {
      answer: "Error: " + errorMsg,
      explanation: "",
      confidence: "low"
    };

    if (mode === "consoleLog") {
      console.groupCollapsed("%cQuiz Solver AI - Error", "color: #ef4444; font-weight: bold;");
      console.log(errorMsg);
      console.groupEnd();
    } else {
      displayAnswer(errorData);
    }
  }

  function getConfidenceColor(confidence) {
    switch (confidence) {
      case "high": return "#22c55e";
      case "medium": return "#f59e0b";
      case "low": return "#ef4444";
      default: return "#6366f1";
    }
  }

  function showFloatingDot(data) {
    let dot = document.querySelector(".qsa-floating-dot");
    let card = document.querySelector(".qsa-floating-card");

    if (!dot) {
      dot = document.createElement("div");
      dot.className = "qsa-floating-dot";
      const accent = settings.accentColor || "#6366f1";
      const opacity = settings.overlayOpacity || 0.92;
      Object.assign(dot.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        top: "auto",
        left: "auto",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        backgroundColor: getConfidenceColor(data.confidence),
        cursor: "grab",
        zIndex: "2147483646",
        transition: "background-color 0.3s, box-shadow 0.3s, transform 0.15s",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        userSelect: "none",
        touchAction: "none"
      });

      card = document.createElement("div");
      card.className = "qsa-floating-card";
      Object.assign(card.style, {
        position: "fixed",
        bottom: "40px",
        right: "16px",
        top: "auto",
        left: "auto",
        width: "280px",
        maxHeight: "320px",
        overflowY: "auto",
        backgroundColor: `rgba(24, 24, 32, ${opacity})`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: "12px",
        padding: "16px",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "13px",
        lineHeight: "1.5",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.08)",
        zIndex: "2147483646",
        display: "none",
        opacity: "0",
        transform: "translateY(8px) scale(0.95)",
        transition: "opacity 0.25s, transform 0.25s"
      });

      let pinned = false;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let dotStartX = 0;
      let dotStartY = 0;
      let hasMoved = false;

      function getDotRect() {
        return dot.getBoundingClientRect();
      }

      function positionCard() {
        const r = getDotRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        card.style.bottom = "auto";
        card.style.right = "auto";
        card.style.top = "auto";
        card.style.left = "auto";

        if (r.top > vh / 2) {
          card.style.bottom = (vh - r.top + 8) + "px";
        } else {
          card.style.top = (r.bottom + 8) + "px";
        }

        if (r.left > vw / 2) {
          card.style.right = (vw - r.right) + "px";
        } else {
          card.style.left = r.left + "px";
        }
      }

      dot.addEventListener("mousedown", (e) => {
        isDragging = true;
        hasMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const r = getDotRect();
        dotStartX = r.left;
        dotStartY = r.top;
        dot.style.cursor = "grabbing";
        dot.style.transition = "background-color 0.3s, box-shadow 0.3s";
        e.preventDefault();
      });

      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
        if (!hasMoved) return;

        const newX = Math.max(0, Math.min(window.innerWidth - 12, dotStartX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 12, dotStartY + dy));

        dot.style.bottom = "auto";
        dot.style.right = "auto";
        dot.style.left = newX + "px";
        dot.style.top = newY + "px";
      });

      document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        dot.style.cursor = "grab";
        dot.style.transition = "background-color 0.3s, box-shadow 0.3s, transform 0.15s";

        if (hasMoved) {
          positionCard();
        }
      });

      dot.addEventListener("mouseenter", () => {
        if (!pinned && !isDragging) {
          positionCard();
          showCard();
        }
      });

      dot.addEventListener("mouseleave", () => {
        if (!pinned) {
          setTimeout(() => {
            if (!card.matches(":hover") && !pinned) hideCard();
          }, 200);
        }
      });

      card.addEventListener("mouseleave", () => {
        if (!pinned) hideCard();
      });

      dot.addEventListener("click", (e) => {
        if (hasMoved) return;
        pinned = !pinned;
        if (pinned) {
          positionCard();
          showCard();
          dot.style.boxShadow = `0 0 0 3px ${accent}, 0 2px 8px rgba(0,0,0,0.3)`;
        } else {
          dot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        }
      });

      dot.setAttribute("tabindex", "0");
      dot.setAttribute("role", "button");
      dot.setAttribute("aria-label", "Quiz answer indicator - drag to move");

      dot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          hasMoved = false;
          dot.click();
        }
      });

      function showCard() {
        card.style.display = "block";
        requestAnimationFrame(() => {
          card.style.opacity = "1";
          card.style.transform = "translateY(0) scale(1)";
        });
      }

      function hideCard() {
        card.style.opacity = "0";
        card.style.transform = "translateY(8px) scale(0.95)";
        setTimeout(() => { card.style.display = "none"; }, 250);
      }

      document.body.appendChild(dot);
      document.body.appendChild(card);
    }

    dot.style.backgroundColor = getConfidenceColor(data.confidence);
    updateCardContent(card, data);
  }

  function updateCardContent(card, data) {
    const showExplanation = settings.showExplanation !== false;
    const showConfidence = settings.showConfidence !== false;

    let html = "";

    html += `<div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#fff;">`;
    html += escapeHtml(data.answer);
    html += `</div>`;

    if (data.userAnswer) {
      const isCorrect = data.answer && data.userAnswer &&
        data.answer.toLowerCase().includes(data.userAnswer.toLowerCase());
      const diffColor = isCorrect ? "#22c55e" : "#ef4444";
      html += `<div style="font-size:12px; margin-bottom:8px; padding:6px 8px; border-radius:6px; background:rgba(255,255,255,0.05);">`;
      html += `<span style="color:#94a3b8;">You chose:</span> <span style="color:${diffColor};">${escapeHtml(data.userAnswer)}</span>`;
      html += `</div>`;
    }

    if (showExplanation && data.explanation) {
      html += `<div style="font-size:12px; color:#94a3b8; margin-bottom:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">`;
      html += escapeHtml(data.explanation);
      html += `</div>`;
    }

    if (showConfidence && data.confidence) {
      const color = getConfidenceColor(data.confidence);
      html += `<div style="display:inline-block; font-size:11px; font-weight:500; padding:2px 8px; border-radius:4px; background:${color}22; color:${color}; border:1px solid ${color}44;">`;
      html += data.confidence.toUpperCase();
      html += `</div>`;
    }

    if (data.fromCache) {
      html += ` <span style="font-size:10px; color:#64748b; margin-left:4px;">(cached)</span>`;
    }

    card.innerHTML = html;
  }

  function showUrlHash(data) {
    const answer = (data.answer || "").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
    window.location.hash = `answer-${answer}`;
  }

  function showConsoleLog(data) {
    const color = getConfidenceColor(data.confidence);
    console.groupCollapsed(
      "%cQuiz Solver AI",
      `color: ${color}; font-weight: bold; font-size: 12px; padding: 2px 6px; background: #1a1a2e; border-radius: 3px;`
    );
    console.log("%cAnswer: " + data.answer, "color: #e2e8f0; font-weight: bold; font-size: 13px;");
    if (data.explanation) {
      console.log("%cExplanation: " + data.explanation, "color: #94a3b8; font-size: 12px;");
    }
    if (data.userAnswer) {
      console.log("%cYour answer: " + data.userAnswer, "color: #f59e0b; font-size: 12px;");
    }
    console.log("%cConfidence: " + (data.confidence || "unknown"), `color: ${color}; font-size: 12px;`);
    console.groupEnd();
  }

  function showSidebar(data) {
    let sidebar = document.querySelector(".qsa-sidebar");

    if (!sidebar) {
      sidebar = document.createElement("div");
      sidebar.className = "qsa-sidebar";
      const opacity = settings.overlayOpacity || 0.92;
      Object.assign(sidebar.style, {
        position: "fixed",
        top: "0",
        right: "-240px",
        width: "220px",
        height: "100vh",
        backgroundColor: `rgba(15, 15, 25, ${opacity})`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "12px",
        zIndex: "2147483646",
        transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
        padding: "0"
      });

      const header = document.createElement("div");
      Object.assign(header.style, {
        padding: "12px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      });

      const title = document.createElement("span");
      title.textContent = "Answers";
      title.style.fontWeight = "600";
      title.style.fontSize = "13px";

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "x";
      Object.assign(closeBtn.style, {
        background: "none",
        border: "none",
        color: "#64748b",
        cursor: "pointer",
        fontSize: "14px",
        padding: "2px 6px"
      });
      closeBtn.addEventListener("click", () => {
        sidebar.style.right = "-240px";
      });

      header.appendChild(title);
      header.appendChild(closeBtn);
      sidebar.appendChild(header);

      const content = document.createElement("div");
      content.className = "qsa-sidebar-content";
      content.style.padding = "8px";
      sidebar.appendChild(content);

      const toggle = document.createElement("div");
      toggle.className = "qsa-sidebar-toggle";
      Object.assign(toggle.style, {
        position: "fixed",
        top: "50%",
        right: "0",
        width: "16px",
        height: "40px",
        backgroundColor: "rgba(15, 15, 25, 0.8)",
        borderRadius: "4px 0 0 4px",
        cursor: "pointer",
        zIndex: "2147483646",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#64748b",
        fontSize: "10px",
        transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
      });
      toggle.textContent = "<";
      toggle.setAttribute("tabindex", "0");
      toggle.setAttribute("role", "button");
      toggle.setAttribute("aria-label", "Toggle answer sidebar");

      let isOpen = false;
      toggle.addEventListener("click", () => {
        isOpen = !isOpen;
        sidebar.style.right = isOpen ? "0" : "-240px";
        toggle.style.right = isOpen ? "220px" : "0";
        toggle.textContent = isOpen ? ">" : "<";
      });

      toggle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle.click();
        }
      });

      document.body.appendChild(sidebar);
      document.body.appendChild(toggle);
    }

    const content = sidebar.querySelector(".qsa-sidebar-content");
    const entry = document.createElement("div");
    Object.assign(entry.style, {
      padding: "10px",
      marginBottom: "6px",
      borderRadius: "8px",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderLeft: `3px solid ${getConfidenceColor(data.confidence)}`
    });

    let entryHtml = `<div style="font-weight:600; font-size:12px; color:#fff; margin-bottom:4px;">${escapeHtml(data.answer)}</div>`;

    if (data.question) {
      entryHtml += `<div style="font-size:11px; color:#64748b; margin-bottom:4px;">${escapeHtml(data.question.slice(0, 100))}</div>`;
    }

    if (data.userAnswer) {
      entryHtml += `<div style="font-size:11px; color:#f59e0b;">Chose: ${escapeHtml(data.userAnswer)}</div>`;
    }

    if (settings.showExplanation !== false && data.explanation) {
      entryHtml += `<div style="font-size:11px; color:#94a3b8; margin-top:4px;">${escapeHtml(data.explanation)}</div>`;
    }

    const now = new Date();
    entryHtml += `<div style="font-size:10px; color:#475569; margin-top:4px;">${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}</div>`;

    entry.innerHTML = entryHtml;
    content.insertBefore(entry, content.firstChild);

    const toggle = document.querySelector(".qsa-sidebar-toggle");
    if (toggle && sidebar.style.right !== "0px") {
      toggle.click();
    }
  }

  function showTooltip(data) {
    removeTooltip();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      showFloatingDot(data);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const tooltip = document.createElement("div");
    tooltip.className = "qsa-tooltip";
    const opacity = settings.overlayOpacity || 0.92;
    Object.assign(tooltip.style, {
      position: "fixed",
      left: Math.max(8, rect.left + rect.width / 2 - 140) + "px",
      top: Math.max(8, rect.top - 8) + "px",
      transform: "translateY(-100%)",
      width: "280px",
      backgroundColor: `rgba(24, 24, 32, ${opacity})`,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderRadius: "10px",
      padding: "12px 14px",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      fontSize: "13px",
      lineHeight: "1.5",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      border: "1px solid rgba(255,255,255,0.08)",
      zIndex: "2147483647",
      animation: "qsa-fadeIn 0.2s ease-out"
    });

    tooltip.setAttribute("tabindex", "0");
    tooltip.setAttribute("role", "tooltip");

    let html = `<div style="font-weight:600; margin-bottom:6px;">${escapeHtml(data.answer)}</div>`;

    if (settings.showExplanation !== false && data.explanation) {
      html += `<div style="font-size:12px; color:#94a3b8;">${escapeHtml(data.explanation)}</div>`;
    }

    if (settings.showConfidence !== false) {
      const color = getConfidenceColor(data.confidence);
      html += `<div style="margin-top:6px;"><span style="font-size:11px; padding:2px 6px; border-radius:3px; background:${color}22; color:${color};">${(data.confidence || "").toUpperCase()}</span></div>`;
    }

    const arrow = document.createElement("div");
    Object.assign(arrow.style, {
      position: "absolute",
      bottom: "-6px",
      left: "50%",
      transform: "translateX(-50%) rotate(45deg)",
      width: "12px",
      height: "12px",
      backgroundColor: `rgba(24, 24, 32, ${opacity})`,
      border: "1px solid rgba(255,255,255,0.08)",
      borderTop: "none",
      borderLeft: "none"
    });

    tooltip.innerHTML = html;
    tooltip.appendChild(arrow);
    document.body.appendChild(tooltip);

    tooltip.addEventListener("keydown", (e) => {
      if (e.key === "Escape") removeTooltip();
    });

    document.addEventListener("click", function removeOnClick(e) {
      if (!tooltip.contains(e.target)) {
        removeTooltip();
        document.removeEventListener("click", removeOnClick);
      }
    });
  }

  function removeTooltip() {
    const existing = document.querySelector(".qsa-tooltip");
    if (existing) existing.remove();
  }

  function showHiddenField(data) {
    let field = document.querySelector(".qsa-hidden-field");

    if (!field) {
      field = document.createElement("input");
      field.className = "qsa-hidden-field";
      field.type = "text";
      field.readOnly = true;
      Object.assign(field.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        width: "1px",
        height: "1px",
        opacity: "0.01",
        border: "none",
        outline: "none",
        background: "transparent",
        color: "transparent",
        fontSize: "1px",
        zIndex: "2147483646",
        pointerEvents: "none"
      });

      field.setAttribute("tabindex", "-1");
      field.setAttribute("aria-hidden", "true");
      document.body.appendChild(field);

      document.addEventListener("keydown", (e) => {
        const hotkey = settings.activationHotkey || "Alt+Shift+A";
        if (matchesHotkey(e, hotkey)) {
          field.style.opacity = "0.01";
          field.style.pointerEvents = "auto";
          field.focus();
          field.select();
        }
      });
    }

    let value = data.answer || "";
    if (settings.showExplanation !== false && data.explanation) {
      value += " | " + data.explanation;
    }
    if (settings.showConfidence !== false && data.confidence) {
      value += " [" + data.confidence + "]";
    }
    field.value = value;
  }

  function clearDisplays() {
    const dot = document.querySelector(".qsa-floating-dot");
    const card = document.querySelector(".qsa-floating-card");
    const tooltip = document.querySelector(".qsa-tooltip");
    const field = document.querySelector(".qsa-hidden-field");

    if (dot) dot.remove();
    if (card) card.remove();
    if (tooltip) tooltip.remove();
    if (field) field.remove();

    window.location.hash = "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const style = document.createElement("style");
  style.textContent = `
    @keyframes qsa-fadeIn {
      from { opacity: 0; transform: translateY(-100%) scale(0.95); }
      to { opacity: 1; transform: translateY(-100%) scale(1); }
    }
    .qsa-floating-dot:hover {
      transform: scale(1.3);
    }
    .qsa-sidebar::-webkit-scrollbar {
      width: 4px;
    }
    .qsa-sidebar::-webkit-scrollbar-track {
      background: transparent;
    }
    .qsa-sidebar::-webkit-scrollbar-thumb {
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
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
