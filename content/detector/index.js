import { detectMCQ } from "./mcq.js";
import { detectFillBlank } from "./fillblank.js";
import { detectImageQuestions } from "./image.js";
import { detectShadowDOM } from "./shadowdom.js";

export function detectAll(root = document, options = {}) {
  const results = [];

  const mcq = detectMCQ(root);
  results.push(...mcq);

  const fill = detectFillBlank(root);
  results.push(...fill);

  if (options.detectImages !== false) {
    const img = detectImageQuestions(root);
    results.push(...img);
  }

  const shadow = detectShadowDOM(root.body || root);
  results.push(...shadow);

  return deduplicateByElement(results);
}

function deduplicateByElement(results) {
  const seen = new Set();
  return results.filter(r => {
    if (!r.element) return true;
    if (seen.has(r.element)) return false;
    seen.add(r.element);
    return true;
  });
}
