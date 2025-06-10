// DEPRECATED: This API route is a direct Anthropic proxy. /api/llm provides a more generic interface. Please use /api/llm.
// Ensure you have your Anthropic API key stored securely in environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/*
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("Anthropic API key not found.");
    return res.status(500).json({ 
      message: "Server configuration error: API key missing.", 
      envVarCheck: {
        exists: !!process.env.ANTHROPIC_API_KEY,
        keys: Object.keys(process.env).filter(k => k.includes('ANTHROPIC')),
      } 
    });
  }

  try {
    // Log the request (except for sensitive data)
    console.log("Calling Anthropic API with body structure:", {
      hasModel: !!req.body.model,
      hasMessages: Array.isArray(req.body.messages),
      messageCount: req.body.messages?.length,
    });

    // Forward the request to the Anthropic API
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body),
    });

    // Handle API response
    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", response.status, data);
      return res.status(response.status).json({
        message: `API error: ${response.status}`,
        error: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error processing Anthropic API request:", error);
    return res.status(500).json({ message: error.message || "Failed to process request" });
  }
}
*/
