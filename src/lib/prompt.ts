export function buildTranslationPrompt(
  sourceLanguage: string,
  targetLanguage: string,
  text: string
): string {
  return [
    `Translate the following Markdown from ${sourceLanguage} to ${targetLanguage}.`,
    'Preserve Markdown syntax and structure.',
    'Translate only prose content.',
    'Do not modify code blocks, links, heading levels, or list structure.',
    '',
    text
  ].join('\n');
}
