import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkGithub from 'remark-github';

// Chargé à la demande (React.lazy) : le rendu Markdown ne pèse sur la page
// qu'à l'ouverture d'un changelog.

type WithNode = { node?: unknown };

function withoutNode<T extends WithNode>(props: T): Omit<T, 'node'> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

// Titres décalés : les notes vivent sous le titre du panneau (h2) et de la version (h3).
const components: Components = {
  h1: (props) => <h4 className="md-h1" {...withoutNode(props)} />,
  h2: (props) => <h4 className="md-h2" {...withoutNode(props)} />,
  h3: (props) => <h5 className="md-h3" {...withoutNode(props)} />,
  h4: (props) => <h6 className="md-h4" {...withoutNode(props)} />,
  h5: (props) => <h6 className="md-h4" {...withoutNode(props)} />,
  h6: (props) => <h6 className="md-h4" {...withoutNode(props)} />,
  a: (props) => <a {...withoutNode(props)} target="_blank" rel="noopener noreferrer" />,
  img: (props) => <img {...withoutNode(props)} loading="lazy" decoding="async" />,
  table: (props) => (
    <div className="md-table">
      <table {...withoutNode(props)} />
    </div>
  ),
};

interface MarkdownProps {
  source: string;
  /** "owner/repo" : résout #123, @mention et SHA comme sur GitHub. */
  repository: string;
}

export default function Markdown({ source, repository }: MarkdownProps) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkGithub, { repository, mentionStrong: false }]]}
        // HTML des notes (<details>, <img>…) interprété puis assaini (schéma GitHub).
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
