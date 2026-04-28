export async function requestChatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<Response> {
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  const base = baseUrl.replace(/\/+$/, '');
  const url = base.endsWith('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
  return tauriFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }]
    })
  });
}
