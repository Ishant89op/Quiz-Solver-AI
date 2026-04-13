export async function call(config, prompt, imageBase64 = null) {
  const { apiKey, model, temperature, systemPrompt, customEndpoint } = config;

  if (!customEndpoint) throw new Error("Custom endpoint URL is required");

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
    model: model || "default",
    messages,
    temperature: temperature || 0.3,
    max_tokens: 1024
  };

  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const url = customEndpoint.endsWith("/chat/completions")
    ? customEndpoint
    : `${customEndpoint.replace(/\/+$/, "")}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Custom API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message.content;
  }

  throw new Error("No choices in custom endpoint response");
}
