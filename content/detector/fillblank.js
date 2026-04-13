export function detectFillBlank(root = document) {
  const results = [];

  const inputs = root.querySelectorAll(
    'input[type="text"], textarea, [contenteditable="true"]'
  );

  inputs.forEach(input => {
    if (isExcluded(input)) return;

    const container = findContainer(input);
    if (!container) return;

    const questionText = extractText(container);
    if (!questionText || questionText.length < 5) return;

    const value = input.value || input.textContent || "";

    results.push({
      type: "fill_blank",
      text: questionText,
      options: [],
      element: container,
      hasImage: hasImage(container),
      userInteracted: value.length > 0,
      userAnswer: value || null
    });
  });

  const selects = root.querySelectorAll("select");
  selects.forEach(select => {
    if (select.options.length < 2 || select.options.length > 30) return;

    const container = findContainer(select);
    if (!container) return;

    const questionText = extractText(container);
    if (!questionText || questionText.length < 5) return;

    const options = Array.from(select.options)
      .filter(o => o.value)
      .map(o => o.textContent.trim());

    results.push({
      type: "cloze",
      text: questionText,
      options,
      element: container,
      hasImage: hasImage(container),
      userInteracted: select.selectedIndex > 0,
      userAnswer: select.selectedIndex > 0 ? select.options[select.selectedIndex].textContent.trim() : null
    });
  });

  return results;
}

function isExcluded(input) {
  if (input.closest('[class*="qsa-"]')) return true;
  const type = input.type || "";
  if (["search", "password", "email", "hidden"].includes(type)) return true;
  const name = (input.name || "").toLowerCase();
  if (/search|login|email|password|username|captcha/.test(name)) return true;
  return false;
}

function findContainer(el) {
  const selectors = [
    '[class*="question"]', '[class*="quiz"]', '[class*="problem"]',
    '[class*="exercise"]', '[class*="prompt"]',
    'fieldset', 'form', '[role="group"]', 'li', 'article', 'section'
  ];
  for (const sel of selectors) {
    const match = el.closest(sel);
    if (match && match !== document.body) return match;
  }
  return el.parentElement;
}

function extractText(container) {
  if (!container) return "";
  const clone = container.cloneNode(true);
  clone.querySelectorAll("input, textarea, select, button, script, style").forEach(e => e.remove());
  return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function hasImage(container) {
  return !!container.querySelector("img, canvas");
}
