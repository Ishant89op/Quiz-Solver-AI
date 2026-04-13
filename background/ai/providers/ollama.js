import { PROVIDER_ENDPOINTS } from "../../../shared/constants.js";

export async function call(config, prompt, imageBase64 = null) {
  const { model, systemPrompt } = config;

  if (!model) throw new Error("Ollama model name is required");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  if (imageBase64) {
    messages[messages.length - 1].images = [imageBase64];
  }

  const body = {
    model: model,
    messages,
    stream: false,
    options: {
      temperature: config.temperature || 0.3
    }
  };

  const response = await fetch(PROVIDER_ENDPOINTS.ollama, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.message && data.message.content) {
    return data.message.content;
  }

  throw new Error("No content in Ollama response");
}
