import { PROVIDER_ENDPOINTS } from "../../../shared/constants.js";

export async function call(config, prompt, imageBase64 = null) {
  const { apiKey, model, temperature, systemPrompt } = config;

  if (!apiKey) throw new Error("Groq API key is required");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  const body = {
    model: model || "llama-3.3-70b-versatile",
    messages,
    temperature: temperature || 0.3,
    max_tokens: 1024
  };

  const response = await fetch(PROVIDER_ENDPOINTS.groq, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message.content;
  }

  throw new Error("No choices in Groq response");
}
