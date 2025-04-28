import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // --- IMPORTANT: Securely get API key from environment variables ---
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  // Allow overriding the external API URL via environment variable
  const externalApiUrl = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';

  if (!anthropicApiKey) {
      console.error("ANTHROPIC_API_KEY environment variable is not set.");
      return res.status(500).json({ error: "API key not configured on server." });
  }

  // --- Get data from the frontend request ---
  // Adjust parameters as needed based on the LLM API you intend to support primarily
  const { model, messages, max_tokens = 2048, temperature = 0.5 } = req.body;

  if (!model || !messages) {
    return res.status(400).json({ error: "Missing 'model' or 'messages' in request body." });
  }

  console.log(`[API Proxy] Calling ${externalApiUrl} with model ${model}`);
  // console.log("[API Proxy] Messages:", JSON.stringify(messages, null, 2)); // Uncomment for deep debugging

  try {
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey, // Header for Anthropic
        'anthropic-version': '2023-06-01', // Header for Anthropic
        // Add other potential headers if needed, e.g., 'Authorization': `Bearer ${apiKey}` for OpenAI
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: max_tokens,
        temperature: temperature,
        // stream: false, // Ensure streaming is off if you expect a full response object
      }),
    });

    // Try to parse the response as JSON regardless of status code, as APIs often return error details in JSON
    const responseData = await response.json();
    console.log("[API Proxy] Response Status:", response.status);

    if (!response.ok) {
      console.error("[API Proxy] Error from external API:", responseData);
      // Forward the status code and error message from the external API
      return res.status(response.status).json(responseData);
    }

    // --- Send successful response back to frontend ---
    // console.log("[API Proxy] Success Response Data:", responseData); // Uncomment for deep debugging
    return res.status(200).json(responseData);

  } catch (error) {
    console.error("[API Proxy] Error calling external API:", error);
    // Ensure error is an instance of Error before accessing message
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: "Failed to call external LLM API.", details: errorMessage });
  }
}
