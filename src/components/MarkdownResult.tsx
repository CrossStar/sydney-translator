import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownResultProps {
  output: string;
  view: 'raw' | 'rendered';
}

export function MarkdownResult({ output, view }: MarkdownResultProps) {
  if (view === 'rendered') {
    return (
      <div className="markdown-result">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {output}
        </ReactMarkdown>
      </div>
    );
  }

  return <pre className="markdown-raw">{output}</pre>;
}
