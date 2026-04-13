export function detectMCQ(root = document) {
  const results = [];

  const radioGroups = {};
  root.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.name || "unnamed";
    if (!radioGroups[name]) radioGroups[name] = [];
    radioGroups[name].push(radio);
  });

  for (const [name, radios] of Object.entries(radioGroups)) {
    const container = findContainer(radios[0]);
    if (!container) continue;

    const questionText = extractText(container, radios);
    if (!questionText || questionText.length < 5) continue;

    const options = radios.map(r => getLabelText(r)).filter(Boolean);
    if (options.length < 2) continue;

    const selected = radios.find(r => r.checked);

    results.push({
      type: "mcq_single",
      text: questionText,
      options,
      element: container,
      hasImage: hasImage(container),
      userInteracted: !!selected,
      userAnswer: selected ? getLabelText(selected) : null
    });
  }

  const checkboxGroups = {};
  root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const container = findContainer(cb);
    if (!container) return;
    const key = container.id || Math.random().toString(36).slice(2);
    if (!checkboxGroups[key]) checkboxGroups[key] = { container, inputs: [] };
    checkboxGroups[key].inputs.push(cb);
  });

  for (const { container, inputs } of Object.values(checkboxGroups)) {
    if (inputs.length < 2) continue;

    const questionText = extractText(container, inputs);
    if (!questionText || questionText.length < 5) continue;

    const options = inputs.map(cb => getLabelText(cb)).filter(Boolean);
    const selected = inputs.filter(cb => cb.checked);

    results.push({
      type: "mcq_multi",
      text: questionText,
      options,
      element: container,
      hasImage: hasImage(container),
      userInteracted: selected.length > 0,
      userAnswer: selected.length > 0 ? selected.map(cb => getLabelText(cb)).join(", ") : null
    });
  }

  root.querySelectorAll('[role="radiogroup"], [role="listbox"]').forEach(group => {
    const text = extractText(group);
    if (!text || text.length < 5) return;

    const items = group.querySelectorAll('[role="radio"], [role="option"]');
    if (items.length < 2) return;

    const options = Array.from(items).map(i => clean(i)).filter(Boolean);
    const selected = Array.from(items).find(i =>
      i.getAttribute("aria-checked") === "true" || i.getAttribute("aria-selected") === "true"
    );

    results.push({
      type: "mcq_single",
      text,
      options,
      element: group,
      hasImage: hasImage(group),
      userInteracted: !!selected,
      userAnswer: selected ? clean(selected) : null
    });
  });

  return results;
}

function findContainer(el) {
  const selectors = [
    '[class*="question"]', '[class*="quiz"]', '[class*="problem"]',
    'fieldset', 'form', '[role="group"]', 'li', 'article', 'section'
  ];
  for (const sel of selectors) {
    const match = el.closest(sel);
    if (match && match !== document.body) return match;
  }
  return el.parentElement;
}

function extractText(container, excludeEls = []) {
  if (!container) return "";
  const clone = container.cloneNode(true);
  clone.querySelectorAll("input, textarea, select, button, script, style").forEach(e => e.remove());
  return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function getLabelText(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return clean(label);
  }
  const parent = input.closest("label");
  if (parent) return clean(parent);
  const sibling = input.nextSibling;
  if (sibling && sibling.nodeType === Node.TEXT_NODE) return sibling.textContent.trim();
  const next = input.nextElementSibling;
  if (next) return clean(next);
  return "";
}

function clean(el) {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

function hasImage(container) {
  return !!container.querySelector("img, canvas");
}
