export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ message: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { provider, model, system, messages, max_tokens, temperature } = await req.json();
    
    // Determine which provider to use and call the appropriate API
    let response;
    
    switch (provider) {
      case 'anthropic':
        response = await callAnthropic(model, system, messages, max_tokens, temperature);
        break;
      case 'openai':
        response = await callOpenAI(model, system, messages, max_tokens, temperature);
        break;
      default:
        return new Response(
          JSON.stringify({ message: 'Unsupported provider' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('LLM API Error:', error);
    return new Response(
      JSON.stringify({ message: error.message || 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function callAnthropic(model, system, messages, max_tokens, temperature) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-haiku-20240307',
      system: system,
      messages: messages,
      max_tokens: max_tokens || 1024,
      temperature: temperature || 0.5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function callOpenAI(model, system, messages, max_tokens, temperature) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Convert our message format to OpenAI format
  const openAIMessages = [
    { role: 'system', content: system },
    ...messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }))
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: openAIMessages,
      max_tokens: max_tokens || 1024,
      temperature: temperature || 0.5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  
  // Convert OpenAI response format to match Anthropic format for consistency
  return {
    id: data.id,
    content: [
      {
        type: 'text',
        text: data.choices[0].message.content
      }
    ]
  };
}
