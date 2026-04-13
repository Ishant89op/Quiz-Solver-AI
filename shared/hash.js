export async function hashQuestion(questionText, options = []) {
  const normalized = questionText
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const optionStr = options
    .map(o => o.toLowerCase().replace(/\s+/g, " ").trim())
    .sort()
    .join("|");

  const raw = `${normalized}::${optionStr}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function quickHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
