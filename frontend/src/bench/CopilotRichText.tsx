import type { ReactNode } from 'react';

/**
 * Lightweight, SAFE renderer (React nodes only, never `dangerouslySetInnerHTML`) for Co-Pilot
 * responses: bold (**x**), inline code (`x`), lists, headings, and automatic highlighting of
 * metrics (p/q values, numbers with units, and decimals) in monospace font.
 */
const INLINE_PATTERN = new RegExp(
  [
    '(\\*\\*[^*\\n]+\\*\\*)', // 1: bold
    '(`[^`\\n]+`)', // 2: inline code
    '((?<![A-Za-z0-9_])[pq](?:_[A-Za-z0-9]+)?\\s*[=<>≥≤]\\s*[+\\-−]?\\d[\\d.,]*(?:e[+\\-]?\\d+)?)', // 3: p/q
    '([+\\-−]?\\d+(?:[.,]\\d+)?(?:e[+\\-]?\\d+)?\\s?(?:°C|kPa|W\\/m²|m\\/s|mm|%|σ|ms|months|fraction)(?:\\/decade)?)', // 4: number + unit
    '((?<![A-Za-z0-9_])[+\\-−]?\\d+[.,]\\d+(?:e[+\\-]?\\d+)?)', // 5: decimal
  ].join('|'),
  'gi',
);

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const key = `${keyPrefix}-${index++}`;
    if (match[1]) {
      nodes.push(<strong key={key}>{match[1].slice(2, -2)}</strong>);
    } else if (match[2]) {
      nodes.push(
        <code key={key} className="cp-code">
          {match[2].slice(1, -1)}
        </code>,
      );
    } else if (match[3]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-p">
          {match[3]}
        </span>,
      );
    } else if (match[4]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-unit">
          {match[4]}
        </span>,
      );
    } else if (match[5]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-num">
          {match[5]}
        </span>,
      );
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

type ListBlock = { kind: 'list'; ordered: boolean; items: string[] };
type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | ListBlock;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
    } else if (heading) {
      flushParagraph();
      blocks.push({ kind: 'h', text: heading[1] ?? '' });
    } else if (bullet || ordered) {
      flushParagraph();
      const isOrdered = !bullet;
      const item = (bullet ?? ordered)?.[1] ?? '';
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'list' && last.ordered === isOrdered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

export function CopilotRichText({ text }: { readonly text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="cp-rich">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        if (block.kind === 'h') {
          return (
            <div key={key} className="cp-heading">
              {renderInline(block.text, key)}
            </div>
          );
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={key} className="cp-list">
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className="cp-paragraph">
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}
