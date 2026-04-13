export function mount(data) {
  const answer = (data.answer || "").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
  window.location.hash = `answer-${answer}`;
}

export function unmount() {
  if (window.location.hash.startsWith("#answer-")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export function update(data) {
  mount(data);
}
