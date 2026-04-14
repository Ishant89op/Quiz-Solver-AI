import { PROVIDER_ENDPOINTS } from "../../../shared/constants.js";

export async function call(config, prompt, imageBase64 = null) {
  const { apiKey, model, temperature, systemPrompt } = config;

  if (!apiKey) throw new Error("Gemini API key is required");

  const modelId = model || "gemini-2.5-flash";
  const endpoint = `${PROVIDER_ENDPOINTS.gemini}/${modelId}:generateContent?key=${apiKey}`;

  const parts = [{ text: prompt }];

  if (imageBase64) {
    const mimeType = imageBase64.startsWith("/9j/") ? "image/jpeg" : "image/png";
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: imageBase64
      }
    });
  }

  const body = {
    ...(systemPrompt ? {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    } : {}),
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      temperature: temperature || 0.3,
      maxOutputTokens: 1024
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.candidates && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts) {
      return candidate.content.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join("");
    }
  }

  throw new Error("No candidates in Gemini response");
}
