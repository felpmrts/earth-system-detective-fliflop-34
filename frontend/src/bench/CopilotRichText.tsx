import { Fragment, type ReactNode } from 'react';
import { renderLatexFormula } from './latexRenderer';

/**
 * Lightweight, SAFE renderer (React nodes only, never `dangerouslySetInnerHTML`) for Co-Pilot
 * responses: bold (**x**), italic (*x*), inline code (`x`), LaTeX math ($...$, $$...$$,
 * \(...\), \[...\]), headings, horizontal dividers (---), blockquotes, tables, lists,
 * line breaks, and automatic highlighting of statistical metrics.
 */
const INLINE_PATTERN = new RegExp(
  [
    '(`[^`\\n]+`)', // 1: inline code (highest priority so math/asterisks inside backticks stay literal)
    '(\\$\\$[\\s\\S]+?\\$\\$|\\\\\\[[\\s\\S]+?\\\\\\])', // 2: inline display math $$...$$ or \[...\]
    '(\\\\\\([^\\n]+?\\\\\\)|(?<!\\\\)\\$(?!\\s)(?:[^$\\n\\\\]|\\\\.)+?(?<!\\s)\\$(?!\\d))', // 3: inline math \(...\) or $...$
    '(\\*\\*[^*\\n]+\\*\\*)', // 4: bold
    '((?<![*\\w])\\*(?!\\s)[^*\\n]+?(?<!\\s)\\*(?![*\\w]))', // 5: italic
    '((?<![A-Za-z0-9_])[pq](?:_[A-Za-z0-9]+)?\\s*[=<>≥≤]\\s*[+\\-−]?\\d[\\d.,]*(?:e[+\\-]?\\d+)?)', // 6: p/q
    '([+\\-−]?\\d+(?:[.,]\\d+)?(?:e[+\\-]?\\d+)?\\s?(?:°C|kPa|W\\/m²|m\\/s|mm|%|σ|ms|months|fraction)(?:\\/decade)?)', // 7: number + unit
    '((?<![A-Za-z0-9_])[+\\-−]?\\d+[.,]\\d+(?:e[+\\-]?\\d+)?)', // 8: decimal
  ].join('|'),
  'gi',
);

const NESTED_INLINE_PATTERN = new RegExp(
  [
    '(`[^`\\n]+`)', // 1: inline code
    '(\\\\\\([^\\n]+?\\\\\\)|(?<!\\\\)\\$(?!\\s)(?:[^$\\n\\\\]|\\\\.)+?(?<!\\s)\\$(?!\\d))', // 2: inline math
    '((?<![A-Za-z0-9_])[pq](?:_[A-Za-z0-9]+)?\\s*[=<>≥≤]\\s*[+\\-−]?\\d[\\d.,]*(?:e[+\\-]?\\d+)?)', // 3: p/q
    '([+\\-−]?\\d+(?:[.,]\\d+)?(?:e[+\\-]?\\d+)?\\s?(?:°C|kPa|W\\/m²|m\\/s|mm|%|σ|ms|months|fraction)(?:\\/decade)?)', // 4: number + unit
    '((?<![A-Za-z0-9_])[+\\-−]?\\d+[.,]\\d+(?:e[+\\-]?\\d+)?)', // 5: decimal
  ].join('|'),
  'gi',
);

function unwrapMathDelim(raw: string): { tex: string; display: boolean } {
  if (raw.startsWith('$$') && raw.endsWith('$$')) return { tex: raw.slice(2, -2), display: true };
  if (raw.startsWith('\\[') && raw.endsWith('\\]')) return { tex: raw.slice(2, -2), display: true };
  if (raw.startsWith('\\(') && raw.endsWith('\\)')) return { tex: raw.slice(2, -2), display: false };
  return { tex: raw.slice(1, -1), display: false };
}

function isLikelyCurrencyPair(inner: string): boolean {
  // Protects "$50 ... $60" from being treated as LaTeX math
  const trimmed = inner.trim();
  return /^\d[\d.,]*$/.test(trimmed) || /^\d[\d.,]*\s+(?:a|to|e|and|or|vs\.?|por|-)$/i.test(trimmed);
}

function renderSimpleInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(NESTED_INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const key = `${keyPrefix}-n${index++}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="cp-code">
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      const { tex } = unwrapMathDelim(match[2]);
      if (match[2].startsWith('$') && isLikelyCurrencyPair(tex)) {
        nodes.push(match[2]);
      } else {
        nodes.push(renderLatexFormula(tex, key, false));
      }
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

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const key = `${keyPrefix}-${index++}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="cp-code">
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      const { tex, display } = unwrapMathDelim(match[2]);
      nodes.push(renderLatexFormula(tex, key, display));
    } else if (match[3]) {
      const { tex } = unwrapMathDelim(match[3]);
      if (match[3].startsWith('$') && isLikelyCurrencyPair(tex)) {
        nodes.push(match[3]);
      } else {
        nodes.push(renderLatexFormula(tex, key, false));
      }
    } else if (match[4]) {
      nodes.push(<strong key={key}>{renderSimpleInline(match[4].slice(2, -2), key)}</strong>);
    } else if (match[5]) {
      nodes.push(<em key={key}>{renderSimpleInline(match[5].slice(1, -1), key)}</em>);
    } else if (match[6]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-p">
          {match[6]}
        </span>,
      );
    } else if (match[7]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-unit">
          {match[7]}
        </span>,
      );
    } else if (match[8]) {
      nodes.push(
        <span key={key} className="cp-stat cp-stat-num">
          {match[8]}
        </span>,
      );
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

type ListBlock = { kind: 'list'; ordered: boolean; items: string[] };
type TableBlock = { kind: 'table'; headers: string[]; rows: string[][] };
type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'hr' }
  | { kind: 'math'; tex: string }
  | { kind: 'code'; code: string }
  | { kind: 'quote'; lines: string[] }
  | TableBlock
  | ListBlock;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function normalizeEscapedNewlines(raw: string): string {
  const crlfNormalized = raw.replace(/\r\n/g, '\n');
  if (!crlfNormalized.includes('\n') && crlfNormalized.includes('\\n')) {
    return crlfNormalized.replace(
      /\\n(?!(?:a(?:bla|tural)|e(?:q|g|wline)?|i\b|mid|o(?:rm|tin)|leq|geq|rightarrow|subseteq|supseteq|u\b))/g,
      '\n',
    );
  }
  return crlfNormalized;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', lines: paragraph });
      paragraph = [];
    }
  };

  const lines = normalizeEscapedNewlines(text).split('\n');
  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx] ?? '';
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    // Fenced code blocks
    if (line.startsWith('```')) {
      flushParagraph();
      const codeLines: string[] = [];
      idx += 1;
      while (idx < lines.length && !(lines[idx] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[idx] ?? '');
        idx += 1;
      }
      blocks.push({ kind: 'code', code: codeLines.join('\n') });
      continue;
    }

    // Standalone display math $$...$$ or \[...\] (single-line or multi-line)
    if (line.startsWith('$$') || line.startsWith('\\[')) {
      flushParagraph();
      const closeDelim = line.startsWith('$$') ? '$$' : '\\]';
      const afterOpen = line.slice(2).trim();
      if (afterOpen.endsWith(closeDelim) && afterOpen.length >= closeDelim.length) {
        blocks.push({ kind: 'math', tex: afterOpen.slice(0, -closeDelim.length).trim() });
        continue;
      }
      const mathLines: string[] = afterOpen ? [afterOpen] : [];
      idx += 1;
      while (idx < lines.length) {
        const cur = (lines[idx] ?? '').trim();
        if (cur.endsWith(closeDelim)) {
          const beforeClose = cur.slice(0, -closeDelim.length).trim();
          if (beforeClose) mathLines.push(beforeClose);
          break;
        }
        mathLines.push(cur);
        idx += 1;
      }
      blocks.push({ kind: 'math', tex: mathLines.join('\n') });
      continue;
    }

    // Horizontal divider ---, ***, ___
    if (/^(?:---+|\*\*\*+|___+)$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'hr' });
      continue;
    }

    // Headings # .. ######
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'h', level: (heading[1] ?? '#').length, text: heading[2] ?? '' });
      continue;
    }

    // Markdown table: | h1 | h2 | followed by | --- | --- |
    const nextLine = lines[idx + 1];
    if (line.includes('|') && nextLine !== undefined && isTableSeparator(nextLine)) {
      flushParagraph();
      const headers = splitTableRow(line);
      idx += 2;
      const rows: string[][] = [];
      while (idx < lines.length) {
        const rowLine = lines[idx] ?? '';
        if (!rowLine.trim().includes('|') || isTableSeparator(rowLine)) break;
        rows.push(splitTableRow(rowLine));
        idx += 1;
      }
      idx -= 1;
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // Blockquotes > ...
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      const quoteLine = quote[1] ?? '';
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'quote') last.lines.push(quoteLine);
      else blocks.push({ kind: 'quote', lines: [quoteLine] });
      continue;
    }

    // Bullet or ordered lists (including indented lines from rawLine)
    const bullet = /^[-*•+]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = !bullet;
      const item = (bullet ?? ordered)?.[1] ?? '';
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'list' && last.ordered === isOrdered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [item] });
      continue;
    }

    // Split paragraph cleanly before standalone bold section headers (e.g., "**1. O que acontece:**")
    if (paragraph.length > 0 && /^\*\*[^*\n]+:\*\*$/.test(line)) {
      flushParagraph();
    }
    paragraph.push(line);
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
        if (block.kind === 'hr') {
          return <hr key={key} className="cp-divider" />;
        }
        if (block.kind === 'math') {
          return renderLatexFormula(block.tex, key, true);
        }
        if (block.kind === 'code') {
          return (
            <pre key={key} className="cp-pre">
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.kind === 'h') {
          return (
            <div key={key} className={`cp-heading cp-heading-l${block.level}`}>
              {renderInline(block.text, key)}
            </div>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote key={key} className="cp-quote">
              {block.lines.map((qLine, j) => (
                <Fragment key={`${key}-${j}`}>
                  {j > 0 ? <br /> : null}
                  {renderInline(qLine, `${key}-q${j}`)}
                </Fragment>
              ))}
            </blockquote>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={key} className="cp-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr>
                    {block.headers.map((h, hi) => (
                      <th key={`${key}-h${hi}`}>{renderInline(h, `${key}-h${hi}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={`${key}-r${ri}`}>
                      {block.headers.map((_, ci) => (
                        <td key={`${key}-r${ri}-c${ci}`}>
                          {renderInline(row[ci] ?? '', `${key}-r${ri}-c${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
            {block.lines.map((pLine, j) => (
              <Fragment key={`${key}-${j}`}>
                {j > 0 ? <br /> : null}
                {renderInline(pLine, `${key}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
