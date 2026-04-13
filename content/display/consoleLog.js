export function mount(data) {
  const color = getColor(data.confidence);

  console.groupCollapsed(
    "%cQuiz Solver AI",
    `color:${color};font-weight:bold;font-size:12px;padding:2px 6px;background:#1a1a2e;border-radius:3px;`
  );
  console.log("%cAnswer: " + data.answer, "color:#e2e8f0;font-weight:bold;font-size:13px;");
  if (data.explanation) {
    console.log("%cExplanation: " + data.explanation, "color:#94a3b8;font-size:12px;");
  }
  if (data.userAnswer) {
    console.log("%cYour answer: " + data.userAnswer, "color:#f59e0b;font-size:12px;");
  }
  console.log("%cConfidence: " + (data.confidence || "unknown"), `color:${color};font-size:12px;`);
  if (data.fromCache) {
    console.log("%c(from cache)", "color:#64748b;font-size:11px;");
  }
  console.groupEnd();
}

export function unmount() {}

export function update(data) {
  mount(data);
}

function getColor(c) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  if (c === "low") return "#ef4444";
  return "#6366f1";
}
