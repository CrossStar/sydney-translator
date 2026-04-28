import { requestChatCompletion } from './openai-client';
import { buildTranslationPrompt } from './prompt';

interface TranslationConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface TranslationInput {
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
}

interface ChatCompletionPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

export async function translateMarkdown(
  config: TranslationConfig,
  input: TranslationInput
): Promise<string> {
  if (config.baseUrl.trim() === '') {
    throw new Error('Base URL is required.');
  }

  if (config.apiKey.trim() === '') {
    throw new Error('API Key is required.');
  }

  if (config.model.trim() === '') {
    throw new Error('Model is required.');
  }

  if (input.text.trim() === '') {
    throw new Error('Text to translate is required.');
  }

  let response: Response;
  try {
    response = await requestChatCompletion(
      config.baseUrl,
      config.apiKey,
      config.model,
      buildTranslationPrompt(input.sourceLanguage, input.targetLanguage, input.text)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Translation request failed: ${msg}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed. Check API Key permissions.');
    }
    if (response.status === 404) {
      throw new Error('Endpoint not found. Check Base URL compatibility.');
    }
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(`Request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  let payload: ChatCompletionPayload;
  try {
    payload = (await response.json()) as ChatCompletionPayload;
  } catch {
    throw new Error('Provider response is not OpenAI-compatible.');
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('Provider response is not OpenAI-compatible.');
  }

  return content;
}
