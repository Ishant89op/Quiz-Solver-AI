export function detectShadowDOM(root) {
  const results = [];

  if (!root) return results;

  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    if (el.shadowRoot) {
      const shadowQuestions = scanShadowRoot(el.shadowRoot);
      results.push(...shadowQuestions);

      const nested = detectShadowDOM(el.shadowRoot);
      results.push(...nested);
    }
  }

  return results;
}

function scanShadowRoot(shadowRoot) {
  const results = [];

  const radios = shadowRoot.querySelectorAll('input[type="radio"]');
  if (radios.length >= 2) {
    const container = radios[0].closest("form, fieldset, div, section") || shadowRoot.host;
    const text = extractText(container || shadowRoot.host);
    if (text && text.length >= 5) {
      const options = Array.from(radios).map(r => {
        return getLabelInShadow(r, shadowRoot);
      }).filter(Boolean);

      results.push({
        type: "mcq_single",
        text,
        options,
        element: shadowRoot.host,
        hasImage: false,
        userInteracted: Array.from(radios).some(r => r.checked),
        userAnswer: null
      });
    }
  }

  const checkboxes = shadowRoot.querySelectorAll('input[type="checkbox"]');
  if (checkboxes.length >= 2) {
    const container = checkboxes[0].closest("form, fieldset, div, section") || shadowRoot.host;
    const text = extractText(container || shadowRoot.host);
    if (text && text.length >= 5) {
      const options = Array.from(checkboxes).map(cb => {
        return getLabelInShadow(cb, shadowRoot);
      }).filter(Boolean);

      results.push({
        type: "mcq_multi",
        text,
        options,
        element: shadowRoot.host,
        hasImage: false,
        userInteracted: Array.from(checkboxes).some(cb => cb.checked),
        userAnswer: null
      });
    }
  }

  const textInputs = shadowRoot.querySelectorAll('input[type="text"], textarea');
  textInputs.forEach(input => {
    const container = input.closest("form, fieldset, div, section") || shadowRoot.host;
    const text = extractText(container || shadowRoot.host);
    if (text && text.length >= 5) {
      results.push({
        type: "fill_blank",
        text,
        options: [],
        element: shadowRoot.host,
        hasImage: false,
        userInteracted: (input.value || "").length > 0,
        userAnswer: input.value || null
      });
    }
  });

  return results;
}

function getLabelInShadow(input, shadowRoot) {
  if (input.id) {
    const label = shadowRoot.querySelector(`label[for="${input.id}"]`);
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

function extractText(el) {
  if (!el) return "";
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function clean(el) {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}
