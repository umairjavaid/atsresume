// DEPRECATED: This API route is in simulation mode and no longer used. Please use /api/llm.
import { NextResponse } from 'next/server';

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

/*
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      resume,
      job_description,
      instruction,
      provider
    } = req.body;

    // Always return simulation mode response for now
    // This ensures the app works even if external APIs aren't available
    return res.status(200).json({
      resumeData: resume,
      message: 'Simulation mode: No changes made to resume'
    });
    
    // The rest of the implementation is commented out until needed
    /*
    // API key validation
    if (!api_key && provider !== 'simulate') {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Actual LLM API calls would go here
    * /
  } catch (error) {
    console.error('LLM proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
*/

async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, systemPrompt, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 4000,
      temperature: 0.2
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.content[0].text;
}

async function callGemini(apiKey, systemPrompt, userPrompt) {
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  const url = `${baseUrl}?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.candidates[0].content.parts[0].text;
}

async function callBedrock(apiKey, systemPrompt, userPrompt) {
  // This is a placeholder. For real implementation, you'd need AWS SDK with proper credentials
  return `For AWS Bedrock integration, you would need to set up AWS credentials server-side. 
  This is a placeholder that would need to be implemented with proper AWS SDK integration.`;
}

function extractJsonFromResponse(text) {
  // Try to extract JSON code block from markdown
  const jsonMatch = text.match(/```json([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      console.error('Failed to parse JSON from response:', error);
    }
  }
  return null;
}

