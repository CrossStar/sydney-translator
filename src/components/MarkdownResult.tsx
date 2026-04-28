import ReactMarkdown from 'react-markdown';

interface MarkdownResultProps {
  output: string;
  onCopy: () => void;
}

export function MarkdownResult({ output }: MarkdownResultProps) {
  return (
    <div className="markdown-result">
      <ReactMarkdown>{output}</ReactMarkdown>
    </div>
  );
}
