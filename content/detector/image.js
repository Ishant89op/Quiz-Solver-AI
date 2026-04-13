export function detectImageQuestions(root = document) {
  const results = [];

  root.querySelectorAll("img, canvas").forEach(el => {
    if (el.closest('[class*="qsa-"]')) return;
    if (el.tagName === "IMG" && (el.width < 50 || el.height < 50)) return;
    if (el.tagName === "IMG" && isDecorativeImage(el)) return;

    const container = findContainer(el);
    if (!container) return;

    const questionText = extractText(container);

    const alreadyFound = results.some(r => r.element === container);
    if (alreadyFound) return;

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

function isDecorativeImage(img) {
  const src = (img.src || "").toLowerCase();
  const alt = (img.alt || "").toLowerCase();
  if (alt === "" && img.getAttribute("role") === "presentation") return true;
  if (/logo|icon|avatar|badge|arrow|chevron|spinner/.test(src)) return true;
  if (/logo|icon|avatar|decoration/.test(alt)) return true;
  return false;
}

function findContainer(el) {
  const selectors = [
    '[class*="question"]', '[class*="quiz"]', '[class*="problem"]',
    '[class*="exercise"]', 'figure',
    'fieldset', 'form', '[role="group"]', 'li', 'article', 'section'
  ];
  for (const sel of selectors) {
    const match = el.closest(sel);
    if (match && match !== document.body) return match;
  }
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 4) {
    if (parent.children.length > 1) return parent;
    parent = parent.parentElement;
    depth++;
  }
  return el.parentElement;
}

function extractText(container) {
  if (!container) return "";
  const clone = container.cloneNode(true);
  clone.querySelectorAll("img, canvas, script, style").forEach(e => e.remove());
  return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}
