import { PROVIDER_ENDPOINTS } from "../../../shared/constants.js";

export async function call(config, prompt, imageBase64 = null) {
  const { apiKey, model, temperature, systemPrompt } = config;

  if (!apiKey) throw new Error("Claude API key is required");

  const messages = [];

  if (imageBase64) {
    const mediaType = imageBase64.startsWith("/9j/") ? "image/jpeg" : "image/png";
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: imageBase64
          }
        },
        { type: "text", text: prompt }
      ]
    });
  } else {
    messages.push({
      role: "user",
      content: prompt
    });
  }

  const body = {
    model: model || "claude-sonnet-4-5",
    max_tokens: 1024,
    temperature: temperature || 0.3,
    system: systemPrompt,
    messages
  };

  const response = await fetch(PROVIDER_ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2024-10-22",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.content && data.content.length > 0) {
    return data.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");
  }

  throw new Error("No content in Claude response");
}
