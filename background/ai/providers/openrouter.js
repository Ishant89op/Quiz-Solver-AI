import { PROVIDER_ENDPOINTS } from "../../../shared/constants.js";

export async function call(config, prompt, imageBase64 = null) {
  const { apiKey, model, temperature, systemPrompt } = config;

  if (!apiKey) throw new Error("OpenRouter API key is required");

  const messages = [
    { role: "system", content: systemPrompt }
  ];

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${imageBase64}`,
            detail: "auto"
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
    model: model || "meta-llama/llama-3.3-70b-instruct:free",
    messages,
    temperature: temperature || 0.3,
    max_tokens: 1024
  };

  const response = await fetch(PROVIDER_ENDPOINTS.openrouter, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "chrome-extension://quiz-solver-ai",
      "X-Title": "Quiz Solver AI"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message.content;
  }

  throw new Error("No choices in OpenRouter response");
}
