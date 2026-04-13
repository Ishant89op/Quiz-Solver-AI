(function () {
  const DEBOUNCE_DEFAULT = 1000;
  const processedHashes = new Set();
  const questionDots = new Map();
  let settings = {};
  let debounceTimer = null;
  let observer = null;
  let isProcessing = false;

  const LOG_PREFIX = "%c[Quiz Solver AI]";
  const LOG_STYLE = "color: #6366f1; font-weight: bold;";

  // ─── Init ───────────────────────────────────────────────────────────
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

    console.log(LOG_PREFIX, LOG_STYLE, "Active on", currentHost,
      "| Provider:", settings.provider || "default",
      "| Display:", settings.displayMode || "floatingDot",
      "| AutoSolve:", settings.autoSolve || false);

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

  // ─── Observer ───────────────────────────────────────────────────────
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

  // ─── Message Listener ──────────────────────────────────────────────
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "trigger_solve") {
        console.log(LOG_PREFIX, LOG_STYLE, "Manual trigger received");
        scanPage(true);
        sendResponse({ ok: true });
      } else if (msg.type === "trigger_region_select") {
        startRegionSelect();
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  // ─── Hotkey Listener ───────────────────────────────────────────────
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

  // ─── Page Scanner ──────────────────────────────────────────────────
  async function scanPage(forceTrigger = false) {
    if (isProcessing) return;
    if (!forceTrigger && settings.autoTrigger === false) return;
    if (settings.detectionEnabled === false) return;

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

        // Auto-solve mode: trigger all questions automatically
        if (settings.autoSolve) {
          if (!processedHashes.has(hash) || forceTrigger) {
            processedHashes.add(hash);
            solveAndDisplay(q, hash);
          }
        }
        // Single question → auto-trigger
        else if (questions.length === 1) {
          if (!processedHashes.has(hash) || forceTrigger) {
            processedHashes.add(hash);
            await solveAndDisplay(q, hash);
          }
        }
        // Multiple questions: place dots
        else {
          if (!questionDots.has(hash)) {
            placeDotOnQuestion(q, hash);
          }
        }
      }
    } catch (err) {
      console.error(LOG_PREFIX, LOG_STYLE, "Scan error:", err);
    }

    isProcessing = false;
  }

  // ─── Solve & Display ───────────────────────────────────────────────
  async function solveAndDisplay(question, hash) {
    let imageBase64 = null;
    if (question.hasImage && settings.detectImages !== false && settings.includeScreenshot !== false) {
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

        // Auto-solve: try to auto-fill first
        if (settings.autoSolve) {
          const filled = tryAutoFill(question, response);
          if (filled) {
            console.log(LOG_PREFIX, LOG_STYLE, "Auto-filled answer");
          }
        }

        // Always display via selected mode
        displayAnswer(answerData, question.element);

        // Update the dot for this question if it exists
        const dotInfo = questionDots.get(hash);
        if (dotInfo && dotInfo.dot) {
          dotInfo.dot.classList.add("qsa-dot-solved");
          dotInfo.dot.title = "Answer: " + (response.answer || "").slice(0, 60);
        }
      } else if (response && response.error) {
        console.error(LOG_PREFIX, LOG_STYLE, "AI error:", response.error);
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
    const letterMatch = answerLower.match(/^([a-z])[.):\s]/);
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
  function placeDotOnQuestion(question, hash) {
    if (!question.element || !question.element.isConnected) return;

    const dot = document.createElement("div");
    dot.className = "qsa-question-dot";
    dot.title = "Click to solve";
    dot.setAttribute("data-qsa-hash", hash);

    // Use fixed positioning based on element's screen coordinates
    const rect = question.element.getBoundingClientRect();

    Object.assign(dot.style, {
      position: "fixed",
      top: (rect.top + 6) + "px",
      left: (rect.left - 16) + "px",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: "rgba(99, 102, 241, 0.45)",
      cursor: "pointer",
      zIndex: "2147483640",
      transition: "all 0.2s ease",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
    });

    dot.addEventListener("mouseenter", () => {
      dot.style.transform = "scale(1.8)";
      dot.style.backgroundColor = "rgba(99, 102, 241, 0.8)";
    });

    dot.addEventListener("mouseleave", () => {
      if (!dot.classList.contains("qsa-dot-solved")) {
        dot.style.transform = "scale(1)";
        dot.style.backgroundColor = "rgba(99, 102, 241, 0.45)";
      }
    });

    dot.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      dot.style.transform = "scale(2.2)";
      setTimeout(() => { dot.style.transform = "scale(1)"; }, 300);

      console.log(LOG_PREFIX, LOG_STYLE, "Dot clicked for:", question.text.slice(0, 60));
      await solveAndDisplay(question, hash);
    });

    document.body.appendChild(dot);
    questionDots.set(hash, { dot, question, element: question.element });

    // Reposition on scroll
    const repositionDot = () => {
      if (!question.element.isConnected) { dot.remove(); return; }
      const r = question.element.getBoundingClientRect();
      dot.style.top = (r.top + 6) + "px";
      dot.style.left = (r.left - 16) + "px";
    };
    window.addEventListener("scroll", repositionDot, { passive: true });
    window.addEventListener("resize", repositionDot, { passive: true });
  }

  // ─── Display Answer ────────────────────────────────────────────────
  function displayAnswer(data, questionElement) {
    const mode = settings.displayMode || "floatingDot";

    if (mode === "none") return; // Auto-fill only, no visual output

    switch (mode) {
      case "floatingDot":
        showFloatingDot(data);
        break;
      case "urlHash":
        showUrlHash(data);
        break;
      case "sidebar":
        addToSidebar(data);
        break;
      default:
        showFloatingDot(data);
    }

    if (settings.autoClearAnswer && mode !== "sidebar") {
      const delay = (settings.autoClearDelay || 10) * 1000;
      setTimeout(() => clearDisplays(), delay);
    }
  }

  function displayError(errorMsg) {
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
      const opacity = settings.overlayOpacity || 0.92;
      Object.assign(dot.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        top: "auto",
        left: "auto",
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        backgroundColor: "rgba(99, 102, 241, 0.5)",
        cursor: "grab",
        zIndex: "2147483646",
        transition: "background-color 0.3s, box-shadow 0.3s, transform 0.15s",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
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
        width: "300px",
        maxHeight: "350px",
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
        dot.style.backgroundColor = "rgba(99, 102, 241, 0.75)";
      });

      dot.addEventListener("mouseleave", () => {
        dot.style.backgroundColor = "rgba(99, 102, 241, 0.5)";
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
        if (pinned) { positionCard(); showCard(); dot.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.4), 0 2px 8px rgba(0,0,0,0.2)"; }
        else { dot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"; }
      });

      function showCard() {
        card.style.display = "block";
        requestAnimationFrame(() => { card.style.opacity = "1"; card.style.transform = "translateY(0) scale(1)"; });
      }

      function hideCard() {
        card.style.opacity = "0"; card.style.transform = "translateY(8px) scale(0.95)";
        setTimeout(() => { card.style.display = "none"; }, 250);
      }

      document.body.appendChild(dot);
      document.body.appendChild(card);
    }

    updateCardContent(card, data);
  }

  function updateCardContent(card, data) {
    const showExplanation = settings.showExplanation !== false;
    const showConfidence = settings.showConfidence !== false;

    let html = "";

    if (data.question) {
      html += `<div style="font-size:11px; color:#94a3b8; margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">`;
      html += escapeHtml(data.question.slice(0, 80));
      html += `</div>`;
    }

    html += `<div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#fff;">`;
    html += escapeHtml(data.answer || "");
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
      const confColors = { high: "#22c55e", medium: "#f59e0b", low: "#ef4444" };
      const color = confColors[data.confidence] || "#6366f1";
      html += `<div style="display:inline-block; font-size:11px; font-weight:500; padding:2px 8px; border-radius:4px; background:${color}22; color:${color}; border:1px solid ${color}44;">`;
      html += data.confidence;
      html += `</div>`;
    }

    card.innerHTML = html;
  }

  // ─── URL Hash Display ──────────────────────────────────────────────
  function showUrlHash(data) {
    const answer = (data.answer || "").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
    window.location.hash = `answer-${answer}`;
  }

  // ─── Sidebar Chat (Leo Brave AI Style) ──────────────────────────────
  let sidebarState = {
    user: null,
    chats: [],
    activeChatId: null,
    activeMessages: [],
    view: "chat" // "list" or "chat"
  };

  function addToSidebar(data) {
    const sidebar = getOrCreateSidebar();

    // Add Q&A as messages
    if (data.question) {
      sidebarState.activeMessages.push({ role: "user", content: data.question, timestamp: new Date().toISOString() });
    }

    let aiMessage = data.answer || "";
    if (data.explanation) aiMessage += "\n\n" + data.explanation;
    if (data.confidence) aiMessage += "\n\n[Confidence: " + data.confidence + "]";
    sidebarState.activeMessages.push({ role: "assistant", content: aiMessage, timestamp: new Date().toISOString() });

    renderSidebarContent(sidebar);
    autoSaveChat();
  }

  function getOrCreateSidebar() {
    let sidebar = document.querySelector(".qsa-sidebar-chat");
    if (sidebar) return sidebar;

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
      transition: "transform 0.3s ease"
    });

    document.body.appendChild(sidebar);

    // Load chats from local storage first (works without sign-in)
    loadChats(sidebar);

    return sidebar;
  }

  function renderSidebarContent(sidebar) {
    sidebar.innerHTML = "";

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: "0"
    });

    const headerLeft = document.createElement("div");
    Object.assign(headerLeft.style, { display: "flex", alignItems: "center", gap: "8px" });

    // Chat list toggle button
    const listBtn = document.createElement("button");
    Object.assign(listBtn.style, {
      background: "none", border: "none", color: "#94a3b8",
      cursor: "pointer", fontSize: "16px", padding: "2px 4px"
    });
    listBtn.textContent = "☰";
    listBtn.title = "Chat list";
    listBtn.addEventListener("click", () => {
      sidebarState.view = sidebarState.view === "list" ? "chat" : "list";
      renderSidebarContent(sidebar);
    });
    headerLeft.appendChild(listBtn);

    const title = document.createElement("span");
    Object.assign(title.style, { fontWeight: "600", fontSize: "14px" });
    title.textContent = sidebarState.view === "list" ? "Chats" : "Quiz Solver AI";
    headerLeft.appendChild(title);
    header.appendChild(headerLeft);

    const headerRight = document.createElement("div");
    Object.assign(headerRight.style, { display: "flex", alignItems: "center", gap: "6px" });

    // New chat button
    const newChatBtn = document.createElement("button");
    Object.assign(newChatBtn.style, {
      background: "none", border: "none", color: "#6366f1",
      cursor: "pointer", fontSize: "18px", padding: "2px 4px"
    });
    newChatBtn.textContent = "+";
    newChatBtn.title = "New chat";
    newChatBtn.addEventListener("click", () => createNewChat(sidebar));
    headerRight.appendChild(newChatBtn);

    // Close button
    const closeBtn = document.createElement("button");
    Object.assign(closeBtn.style, {
      background: "none", border: "none", color: "#94a3b8",
      cursor: "pointer", fontSize: "18px", padding: "0 4px"
    });
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
      sidebar.style.transform = "translateX(100%)";
      setTimeout(() => sidebar.remove(), 300);
    });
    headerRight.appendChild(closeBtn);
    header.appendChild(headerRight);
    sidebar.appendChild(header);

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
      empty.textContent = sidebarState.user ? "No chats yet. Click + to start." : "Sign in to save chat history.";
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

    if (sidebarState.activeMessages.length === 0) {
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

    if (sidebarState.user) {
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
          sidebarState.user = null;
          renderSidebarContent(sidebar);
        });
      });
      footer.appendChild(logoutBtn);
    } else {
      // Show local mode info
      const localInfo = document.createElement("span");
      Object.assign(localInfo.style, { color: "#64748b" });
      localInfo.textContent = `Local mode · ${sidebarState.chats.length} chat${sidebarState.chats.length !== 1 ? "s" : ""}`;
      footer.appendChild(localInfo);

      const syncBtn = document.createElement("button");
      Object.assign(syncBtn.style, {
        background: "none", border: "1px solid rgba(99,102,241,0.3)",
        borderRadius: "4px", color: "#6366f1", cursor: "pointer",
        fontSize: "10px", padding: "3px 8px", flexShrink: "0"
      });
      syncBtn.textContent = "☁ Sync";
      syncBtn.title = "Sign in to sync chats to cloud";
      syncBtn.addEventListener("click", () => {
        syncBtn.textContent = "...";
        syncBtn.disabled = true;
        chrome.runtime.sendMessage({ type: "firebase_login" }, (res) => {
          if (res && res.user) {
            sidebarState.user = res.user;
          }
          renderSidebarContent(sidebar);
        });
      });
      footer.appendChild(syncBtn);
    }

    sidebar.appendChild(footer);
  }

  function loadChats(sidebar) {
    // Always load from chrome.storage.local first
    chrome.storage.local.get("qsa_sidebar_chats", (result) => {
      const localChats = result.qsa_sidebar_chats || [];
      sidebarState.chats = localChats;

      // Auto-select most recent chat or create first one
      if (localChats.length > 0 && !sidebarState.activeChatId) {
        sidebarState.activeChatId = localChats[0].id;
        sidebarState.activeMessages = [...(localChats[0].messages || [])];
      } else if (localChats.length === 0) {
        // Create a default first chat
        const firstChat = {
          id: "local_" + Date.now(),
          title: "Chat " + new Date().toLocaleTimeString(),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        sidebarState.chats = [firstChat];
        sidebarState.activeChatId = firstChat.id;
        sidebarState.activeMessages = [];
        saveChatsToLocal();
      }

      renderSidebarContent(sidebar);

      // Also check Firebase user (non-blocking)
      chrome.runtime.sendMessage({ type: "firebase_get_user" }, (res) => {
        if (res && res.user) {
          sidebarState.user = res.user;
          renderSidebarContent(sidebar);
        }
      });
    });
  }

  function createNewChat(sidebar) {
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

    saveChatsToLocal();

    // Also save to Firebase if logged in
    if (sidebarState.user) {
      chrome.runtime.sendMessage({ type: "firebase_create_chat", title }, (res) => {
        if (res && res.chat) {
          // Update local ID to Firebase ID
          newChat.id = res.chat.id;
          sidebarState.activeChatId = res.chat.id;
          saveChatsToLocal();
        }
      });
    }

    renderSidebarContent(sidebar);
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

  // ─── Clear Displays ────────────────────────────────────────────────
  function clearDisplays() {
    const dot = document.querySelector(".qsa-floating-dot");
    const card = document.querySelector(".qsa-floating-card");
    if (dot) dot.remove();
    if (card) card.remove();
    window.location.hash = "";
  }

  // ─── Region Screenshot ─────────────────────────────────────────────
  function startRegionSelect() {
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
              if (resp && resp.type !== "error") displayAnswer(resp);
              else if (resp && resp.error) displayError(resp.error);
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

    // Radio groups
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

      const options = radios.map(r => (findLabelForInput(r) || "").trim()).filter(Boolean);
      if (options.length < 2) continue;

      const selected = radios.find(r => r.checked);
      results.push({
        type: "mcq_single", text: questionText, options,
        element: container, hasImage: containerHasImage(container),
        userInteracted: !!selected,
        userAnswer: selected ? (findLabelForInput(selected) || "").trim() : null
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
      const questionText = extractQuestionText(container, inputs);
      if (!questionText || questionText.length < 5) continue;

      const options = inputs.map(cb => (findLabelForInput(cb) || "").trim()).filter(Boolean);
      const selected = inputs.filter(cb => cb.checked);
      results.push({
        type: "mcq_multi", text: questionText, options,
        element: container, hasImage: containerHasImage(container),
        userInteracted: selected.length > 0,
        userAnswer: selected.length > 0 ? selected.map(cb => (findLabelForInput(cb) || "").trim()).join(", ") : null
      });
    }

    // ARIA-based
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
        type: "mcq_single", text: questionText, options,
        element: group, hasImage: containerHasImage(group),
        userInteracted: !!selected,
        userAnswer: selected ? cleanText(selected) : null
      });
    });

    return results;
  }

  function detectFillBlank() {
    const results = [];

    document.querySelectorAll(
      'input[type="text"]:not([qsa-scanned]), textarea:not([qsa-scanned]), [contenteditable="true"]:not([qsa-scanned])'
    ).forEach(input => {
      if (input.closest('.qsa-sidebar-chat, .qsa-floating-dot, .qsa-floating-card')) return;
      if (input.type === "search" || input.type === "password" || input.type === "email") return;
      if (input.name && /search|login|email|password|username/i.test(input.name)) return;

      const container = findQuestionContainer(input);
      if (!container) return;
      const questionText = extractQuestionText(container, [input]);
      if (!questionText || questionText.length < 5) return;

      input.setAttribute("qsa-scanned", "true");
      const value = input.value || input.textContent || "";
      results.push({
        type: "fill_blank", text: questionText, options: [],
        element: container, hasImage: containerHasImage(container),
        userInteracted: value.length > 0, userAnswer: value || null
      });
    });

    document.querySelectorAll('select:not([qsa-scanned])').forEach(select => {
      if (select.closest('.qsa-sidebar-chat')) return;
      if (select.options.length < 2 || select.options.length > 30) return;

      const container = findQuestionContainer(select);
      if (!container) return;
      const questionText = extractQuestionText(container, [select]);
      if (!questionText || questionText.length < 5) return;

      select.setAttribute("qsa-scanned", "true");
      const options = Array.from(select.options).filter(o => o.value).map(o => o.textContent.trim());
      results.push({
        type: "cloze", text: questionText, options,
        element: container, hasImage: containerHasImage(container),
        userInteracted: select.selectedIndex > 0,
        userAnswer: select.selectedIndex > 0 ? select.options[select.selectedIndex].textContent.trim() : null
      });
    });

    return results;
  }

  function detectImageQuestions() {
    const results = [];
    document.querySelectorAll('img:not([qsa-scanned]), canvas:not([qsa-scanned])').forEach(el => {
      if (el.closest('.qsa-sidebar-chat, .qsa-floating-dot')) return;
      if (el.tagName === "IMG" && (el.width < 50 || el.height < 50)) return;

      const container = findQuestionContainer(el);
      if (!container) return;
      const questionText = extractQuestionText(container, [el]);
      if (!questionText || questionText.length < 3) return;
      if (results.some(r => r.element === container)) return;

      el.setAttribute("qsa-scanned", "true");
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
    let text = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
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
    if (parentLabel) return cleanText(parentLabel);

    const sibling = input.nextSibling;
    if (sibling && sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) return sibling.textContent.trim();
    const nextEl = input.nextElementSibling;
    if (nextEl && ["SPAN", "DIV", "P"].includes(nextEl.tagName)) return cleanText(nextEl);
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

  function escapeHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
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
      if (response && response.dataUrl) return response.dataUrl.split(",")[1];
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
