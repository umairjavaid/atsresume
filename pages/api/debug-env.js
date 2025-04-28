export default function handler(req, res) {
  // Check for API keys (masking them for security)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  return res.status(200).json({
    anthropicKeyExists: !!anthropicKey,
    anthropicKeyFirstChars: anthropicKey ? `${anthropicKey.substring(0, 4)}...` : null,
    openaiKeyExists: !!openaiKey,
    openaiKeyFirstChars: openaiKey ? `${openaiKey.substring(0, 4)}...` : null,
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('ANTHROPIC') || key.includes('OPENAI')
    )
  });
}
