export function mount(data, settings) {
  let field = document.querySelector(".qsa-hidden-field");

  if (!field) {
    field = document.createElement("input");
    field.className = "qsa-hidden-field";
    field.type = "text";
    field.readOnly = true;
    Object.assign(field.style, {
      position: "fixed", bottom: "0", left: "0",
      width: "1px", height: "1px", opacity: "0.01",
      border: "none", outline: "none",
      background: "transparent", color: "transparent",
      fontSize: "1px", zIndex: "2147483646",
      pointerEvents: "none"
    });
    field.setAttribute("tabindex", "-1");
    field.setAttribute("aria-hidden", "true");
    document.body.appendChild(field);
  }

  let value = data.answer || "";
  if (settings.showExplanation !== false && data.explanation) value += " | " + data.explanation;
  if (settings.showConfidence !== false && data.confidence) value += " [" + data.confidence + "]";
  field.value = value;
}

export function unmount() {
  const field = document.querySelector(".qsa-hidden-field");
  if (field) field.remove();
}

export function update(data, settings) {
  mount(data, settings);
}
