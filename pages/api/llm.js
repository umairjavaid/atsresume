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
        // Default to OpenAI if provider not specified
        response = await callOpenAI(model, system, messages, max_tokens, temperature);
    }
    
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('LLM API Error:', error);
    
    // Specific error handling for Anthropic overloaded errors
    const errorMessage = error.message || 'Failed to process request';
    const statusCode = error.status || 500;
    const errorType = 
      errorMessage.includes('overloaded_error') ? 'SERVICE_OVERLOADED' :
      errorMessage.includes('rate_limit') ? 'RATE_LIMITED' : 
      'API_ERROR';
    
    return new Response(
      JSON.stringify({ 
        message: errorMessage,
        details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : 'No stack trace available',
        name: error.name,
        type: errorType
      }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function callAnthropic(model, system, messages, max_tokens, temperature) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }
  
  // Convert our message format to Anthropic format, excluding system messages
  const anthropicMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  })).filter(msg => msg.role !== 'system');
  
  // System message should be passed as a top-level parameter, not in the messages array
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-haiku-20240307',
        messages: anthropicMessages,
        system: system, // Pass system as a top-level parameter
        max_tokens: max_tokens || 1024,
        temperature: temperature || 0.5,
      }),
    });

    // Get the response body as text first to log the raw response if there's an error
    const responseText = await response.text();
    
    if (!response.ok) {
      // Parse error details if possible
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { raw: responseText };
      }
      
      const error = new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }
    
    // Parse the successful response text as JSON
    const data = JSON.parse(responseText);
    
    return {
      id: data.id,
      model: data.model,
      content: data.content[0].text,
      _raw: data // Include the raw response for debugging
    };
  } catch (error) {
    console.error("Error calling Anthropic:", error);
    throw error;
  }
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

  try {
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

    // Get the response body as text first to log the raw response if there's an error
    const responseText = await response.text();

    if (!response.ok) {
      try {
        // Try to parse as JSON for structured error info
        const errorData = JSON.parse(responseText);
        console.error("OpenAI API error:", response.status, errorData);
        const error = new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`);
        error.status = response.status;
        error.data = errorData;
        throw error;
      } catch (parseError) {
        // If parsing fails, use the raw text
        console.error("OpenAI API error (non-JSON):", response.status, responseText);
        const error = new Error(`OpenAI API error: ${response.status} ${responseText.substring(0, 200)}`);
        error.status = response.status;
        throw error;
      }
    }

    // Parse the successful response text as JSON
    const data = JSON.parse(responseText);

    // Convert OpenAI response format to match Anthropic format for consistency
    return {
      id: data.id,
      model: data.model,
      content: data.choices[0].message.content,
      _raw: data // Include the raw response for debugging
    };
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}
