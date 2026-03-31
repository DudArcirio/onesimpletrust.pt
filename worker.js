// Cloudflare Worker — Anthropic API Proxy for One Simple Trust
// Deploy this at: https://workers.cloudflare.com
// Set the secret: wrangler secret put ANTHROPIC_API_KEY

const ALLOWED_ORIGINS = [
  'https://dudarcirio.github.io',
  'https://onesimpletrust.pt',
  'https://www.onesimpletrust.pt',
  'http://localhost',
  'http://127.0.0.1'
];

const ALLOWED_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929'
];

const MAX_TOKENS_LIMIT = 1024;

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Check origin
    const origin = request.headers.get('Origin') || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    if (!isAllowed && origin !== '') {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const body = await request.json();

      // Validate and cap the request
      if (!ALLOWED_MODELS.includes(body.model)) {
        body.model = 'claude-haiku-4-5-20251001';
      }
      if (!body.max_tokens || body.max_tokens > MAX_TOKENS_LIMIT) {
        body.max_tokens = MAX_TOKENS_LIMIT;
      }

      // Forward to Anthropic
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await anthropicResponse.text();

      return new Response(data, {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}
