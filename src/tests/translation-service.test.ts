import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translateMarkdown } from '../lib/translation-service';
import { requestChatCompletion } from '../lib/openai-client';

vi.mock('../lib/openai-client', () => ({
  requestChatCompletion: vi.fn()
}));

const mockedRequestChatCompletion = vi.mocked(requestChatCompletion);

const VALID_CONFIG = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'key',
  model: 'gpt-4.1-mini'
};

const VALID_INPUT = {
  sourceLanguage: 'auto',
  targetLanguage: 'English',
  text: '# 标题'
};

beforeEach(() => {
  mockedRequestChatCompletion.mockReset();
});

describe('translateMarkdown', () => {
  it('returns translated content from a compatible payload', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '# Title' } }] })
    } as Response);

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).resolves.toBe('# Title');
  });

  it('sends request wiring and prompt text through the OpenAI client', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '# Title' } }] })
    } as Response);

    await translateMarkdown(VALID_CONFIG, VALID_INPUT);

    expect(mockedRequestChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockedRequestChatCompletion).toHaveBeenCalledWith(
      'https://example.com/v1',
      'key',
      'gpt-4.1-mini',
      [
        'Translate the following Markdown from auto to English.',
        'Preserve Markdown syntax and structure.',
        'Translate only prose content.',
        'Do not modify code blocks, links, heading levels, or list structure.',
        '',
        '# 标题'
      ].join('\n')
    );
  });

  it('classifies 401 responses as auth errors', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => ''
    } as Response);

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).rejects.toThrow(
      'Authentication failed. Check API Key permissions.'
    );
  });

  it('maps 404 responses to endpoint compatibility errors', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => ''
    } as Response);

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).rejects.toThrow(
      'Endpoint not found. Check Base URL compatibility.'
    );
  });

  it('maps invalid payloads to provider compatibility errors', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: null } }] })
    } as Response);

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).rejects.toThrow(
      'Provider response is not OpenAI-compatible.'
    );
  });

  it('maps JSON parse failures to provider compatibility errors', async () => {
    mockedRequestChatCompletion.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      }
    } as unknown as Response);

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).rejects.toThrow(
      'Provider response is not OpenAI-compatible.'
    );
  });

  it('maps transport rejections to a stable transport error', async () => {
    mockedRequestChatCompletion.mockRejectedValue(new Error('socket hang up'));

    await expect(translateMarkdown(VALID_CONFIG, VALID_INPUT)).rejects.toThrow(
      'Translation request failed: socket hang up'
    );
  });

  it('rejects missing or blank preflight fields', async () => {
    await expect(
      translateMarkdown({ baseUrl: '   ', apiKey: 'key', model: 'gpt-4.1-mini' }, VALID_INPUT)
    ).rejects.toThrow('Base URL is required.');

    await expect(
      translateMarkdown({ baseUrl: 'https://example.com/v1', apiKey: ' ', model: 'gpt-4.1-mini' }, VALID_INPUT)
    ).rejects.toThrow('API Key is required.');

    await expect(
      translateMarkdown({ baseUrl: 'https://example.com/v1', apiKey: 'key', model: '\n' }, VALID_INPUT)
    ).rejects.toThrow('Model is required.');

    await expect(
      translateMarkdown(VALID_CONFIG, { sourceLanguage: 'auto', targetLanguage: 'English', text: '\t' })
    ).rejects.toThrow('Text to translate is required.');

    expect(mockedRequestChatCompletion).not.toHaveBeenCalled();
  });
});
