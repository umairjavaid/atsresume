// Ensure you have your Anthropic API key stored securely in environment variables
// Example: ANTHROPIC_API_KEY=your_api_key_here in a .env.local file
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // Use environment variable
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  if (!ANTHROPIC_API_KEY) {
      console.error("Anthropic API key not found.");
      return res.status(500).json({ message: "Server configuration error: API key missing." });
  }

  try {
    // Forward the request body received from the frontend to the Anthropic API
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01' // Specify the required version
        // Add any other necessary headers specified by Anthropic documentation
      },
      body: JSON.stringify(req.body), // Pass the frontend request body directly
    });

    const data = await response.json();

    if (!response.ok) {
      // Forward Anthropic's error message if possible
      console.error("Anthropic API Error:", data);
      return res.status(response.status).json({ message: data.error?.message || 'Error calling Anthropic API' });
    }

    // Send the successful response from Anthropic back to the frontend
    res.status(200).json(data);

  } catch (error) {
    console.error("Error in /api/anthropic:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
