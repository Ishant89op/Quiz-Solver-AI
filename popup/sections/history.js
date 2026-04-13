export async function initHistorySection(settings) {
  const section = document.getElementById("section-history");

  let html = `<div class="qsa-group">`;
  html += `<div class="qsa-group-title">Answer History</div>`;
  html += `<div class="qsa-btn-group" style="margin-bottom:12px;">`;
  html += `<button class="qsa-btn qsa-btn-sm qsa-btn-outline" id="qsa-refresh-history">Refresh</button>`;
  html += `<button class="qsa-btn qsa-btn-sm qsa-btn-outline" id="qsa-export-history">Export JSON</button>`;
  html += `<button class="qsa-btn qsa-btn-sm qsa-btn-danger" id="qsa-clear-history">Clear</button>`;
  html += `</div>`;
  html += `<div class="qsa-history-list" id="qsa-history-list"></div>`;
  html += `</div>`;

  section.innerHTML = html;

  await loadHistory();

  document.getElementById("qsa-refresh-history").addEventListener("click", loadHistory);
  document.getElementById("qsa-export-history").addEventListener("click", exportHistory);
  document.getElementById("qsa-clear-history").addEventListener("click", clearHistory);
}

async function loadHistory() {
  const listEl = document.getElementById("qsa-history-list");

  try {
    const response = await chrome.runtime.sendMessage({ type: "get_history" });
    const history = response?.history || [];

    if (history.length === 0) {
      listEl.innerHTML = `<div class="qsa-history-empty">No answers recorded yet</div>`;
      return;
    }

    const reversed = [...history].reverse();
    let html = "";

    for (const entry of reversed) {
      const time = formatTime(entry.timestamp);
      const confColor = getConfColor(entry.confidence);

      html += `<div class="qsa-history-item" style="border-left-color:${confColor};">`;
      html += `<div class="qsa-history-question">${escapeHtml((entry.question || "").slice(0, 80))}</div>`;
      html += `<div class="qsa-history-answer">${escapeHtml(entry.answer || "")}</div>`;

      if (entry.userAnswer) {
        const match = (entry.answer || "").toLowerCase().includes((entry.userAnswer || "").toLowerCase());
        html += `<div style="font-size:11px;color:${match ? "#22c55e" : "#ef4444"};">Your answer: ${escapeHtml(entry.userAnswer)}</div>`;
      }

      html += `<div class="qsa-history-meta">${time} - ${entry.provider || ""} / ${entry.model || ""}</div>`;
      html += `</div>`;
    }

    listEl.innerHTML = html;
  } catch {
    listEl.innerHTML = `<div class="qsa-history-empty">Failed to load history</div>`;
  }
}

async function exportHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "export_history" });
    const data = response?.data || [];
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-solver-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silent fail
  }
}

async function clearHistory() {
  try {
    await chrome.runtime.sendMessage({ type: "clear_history" });
    document.getElementById("qsa-history-list").innerHTML = `<div class="qsa-history-empty">History cleared</div>`;
  } catch {
    // silent fail
  }
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function getConfColor(c) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  if (c === "low") return "#ef4444";
  return "#6366f1";
}

function escapeHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
