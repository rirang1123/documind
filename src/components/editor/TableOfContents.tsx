import { useMemo } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface Props {
  content: string;
  visible: boolean;
  onToggle: () => void;
}

export default function TableOfContents({ content, visible, onToggle }: Props) {
  const headings = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content || '', 'text/html');
    const elements = doc.querySelectorAll('h1, h2, h3, h4');
    const items: TocItem[] = [];
    elements.forEach((el, index) => {
      items.push({
        id: `heading-${index}`,
        text: el.textContent || '',
        level: parseInt(el.tagName[1]),
      });
    });
    return items;
  }, [content]);

  if (!visible) return null;

  if (headings.length === 0) {
    return (
      <div className="w-56 border-l border-border p-4 overflow-y-auto bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">목차</h3>
          <button onClick={onToggle} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <p className="text-xs text-muted-foreground">제목(H1~H4)이 없습니다.</p>
      </div>
    );
  }

  const scrollToHeading = (index: number) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;
    const headingEls = editor.querySelectorAll('h1, h2, h3, h4');
    headingEls[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-56 border-l border-border p-4 overflow-y-auto bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">목차</h3>
        <button onClick={onToggle} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <nav className="space-y-1">
        {headings.map((item, idx) => (
          <button
            key={idx}
            onClick={() => scrollToHeading(idx)}
            className="block w-full text-left text-xs hover:text-primary transition-colors truncate text-muted-foreground hover:bg-accent rounded px-1 py-0.5"
            style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
