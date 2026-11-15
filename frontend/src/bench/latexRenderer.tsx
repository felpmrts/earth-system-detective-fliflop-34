import { Fragment, type ReactNode } from 'react';

const GREEK_AND_SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  pm: '±',
  mp: '∓',
  times: '×',
  cdot: '·',
  div: '÷',
  ast: '*',
  star: '⋆',
  circ: '∘',
  deg: '°',
  infty: '∞',
  approx: '≈',
  cong: '≅',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  propto: '∝',
  neq: '≠',
  ne: '≠',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  ll: '≪',
  gg: '≫',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  implies: '⟹',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⟺',
  mapsto: '↦',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  sum: '∑',
  prod: '∏',
  int: '∫',
  iint: '∬',
  dots: '…',
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  quad: '  ',
  qquad: '    ',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  mid: '|',
  parallel: '∥',
  perp: '⊥',
  neg: '¬',
  land: '∧',
  lor: '∨',
  checkmark: '✓',
  prime: '′',
};

const TEXT_WRAPPER_MACROS = new Set([
  'text',
  'textrm',
  'textup',
  'textsf',
  'texttt',
  'mathrm',
  'mathbf',
  'textbf',
  'mathit',
  'mathsf',
  'mathbb',
  'mathcal',
  'operatorname',
  'operatorname*',
]);

const FUNCTION_NAME_MACROS = new Set([
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'max',
  'min',
  'arg',
  'lim',
  'sup',
  'inf',
  'med',
  'median',
  'mean',
  'var',
  'cov',
  'corr',
  'det',
  'sgn',
  'abs',
]);

const COMBINING_ACCENTS: Record<string, string> = {
  bar: '\u0304',
  hat: '\u0302',
  widehat: '\u0302',
  tilde: '\u0303',
  widetilde: '\u0303',
  dot: '\u0307',
  ddot: '\u0308',
  vec: '\u20D7',
};

function skipSpaces(input: string, pos: number): number {
  let i = pos;
  while (i < input.length && /\s/.test(input.charAt(i))) i += 1;
  return i;
}

/** Reads either a `{...}` group or a single token (`\cmd` or 1 char). */
function readGroupOrToken(input: string, start: number): { content: string; next: number } {
  const pos = skipSpaces(input, start);
  if (pos >= input.length) return { content: '', next: pos };

  if (input.charAt(pos) === '{') {
    let depth = 1;
    let i = pos + 1;
    while (i < input.length && depth > 0) {
      if (input.charAt(i) === '\\') {
        i += 2;
        continue;
      }
      if (input.charAt(i) === '{') depth += 1;
      else if (input.charAt(i) === '}') depth -= 1;
      i += 1;
    }
    const end = depth === 0 ? i - 1 : input.length;
    return { content: input.slice(pos + 1, end), next: i };
  }

  if (input.charAt(pos) === '\\') {
    const m = /^\\([A-Za-z]+\*?|\S)/.exec(input.slice(pos));
    if (m) return { content: m[0], next: pos + m[0].length };
  }

  return { content: input.charAt(pos), next: pos + 1 };
}

function readOptionalBracket(input: string, start: number): { content: string | null; next: number } {
  const pos = skipSpaces(input, start);
  if (pos >= input.length || input.charAt(pos) !== '[') return { content: null, next: start };
  let i = pos + 1;
  while (i < input.length && input.charAt(i) !== ']') {
    if (input.charAt(i) === '\\') i += 2;
    else i += 1;
  }
  if (i >= input.length) return { content: null, next: start };
  return { content: input.slice(pos + 1, i), next: i + 1 };
}

function parseTexExpression(input: string, keyPrefix: string, plainTextMode = false): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let tokenIdx = 0;
  const nextKey = () => `${keyPrefix}-${tokenIdx++}`;

  while (i < input.length) {
    const ch = input.charAt(i);

    if (ch === '\\') {
      const rest = input.slice(i);
      // Escaped single-char symbols like \%, \{, \}, \_, \$, \|, \, , \; , \: , \! , \  , \\
      const symEscape = /^\\([%{}#$&_|\s,:;!\\])/.exec(rest);
      if (symEscape) {
        const esc = symEscape[1] ?? '';
        i += symEscape[0].length;
        if (esc === ',') nodes.push('\u2009');
        else if (esc === ';' || esc === ':') nodes.push('\u2005');
        else if (esc === '!') {
          // negative thin space omitted cleanly
        } else if (esc === '\\') nodes.push(<br key={nextKey()} />);
        else if (/\s/.test(esc)) nodes.push(' ');
        else nodes.push(esc);
        continue;
      }

      const cmdMatch = /^\\([A-Za-z]+\*?)/.exec(rest);
      if (cmdMatch) {
        const cmd = cmdMatch[1] ?? '';
        i += cmdMatch[0].length;

        if (cmd === 'left' || cmd === 'right' || cmd === 'big' || cmd === 'Big' || cmd === 'bigg' || cmd === 'Bigg') {
          const delim = readGroupOrToken(input, i);
          i = delim.next;
          const rawDelim = delim.content.trim();
          if (rawDelim === '.' || !rawDelim) continue;
          if (rawDelim === '\\{' || rawDelim === '\\}') nodes.push(rawDelim.slice(1));
          else if (rawDelim === '\\|' || rawDelim === '|') nodes.push(rawDelim === '\\|' ? '∥' : '|');
          else if (rawDelim === '\\langle') nodes.push('⟨');
          else if (rawDelim === '\\rangle') nodes.push('⟩');
          else nodes.push(rawDelim);
          continue;
        }

        if (cmd === 'begin' || cmd === 'end') {
          const env = readGroupOrToken(input, i);
          i = env.next;
          continue;
        }

        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac' || cmd === 'cfrac') {
          const num = readGroupOrToken(input, i);
          const den = readGroupOrToken(input, num.next);
          i = den.next;
          const k = nextKey();
          nodes.push(
            <span key={k} className="cp-math-frac">
              <span className="cp-math-num">{parseTexExpression(num.content, `${k}n`)}</span>
              <span className="cp-math-den">{parseTexExpression(den.content, `${k}d`)}</span>
            </span>,
          );
          continue;
        }

        if (cmd === 'sqrt') {
          const opt = readOptionalBracket(input, i);
          const rad = readGroupOrToken(input, opt.next);
          i = rad.next;
          const k = nextKey();
          nodes.push(
            <span key={k} className="cp-math-sqrt">
              {opt.content ? <sup className="cp-math-root-idx">{parseTexExpression(opt.content, `${k}o`)}</sup> : null}
              <span className="cp-math-sqrt-sign">√</span>
              <span className="cp-math-radicand">{parseTexExpression(rad.content, `${k}r`)}</span>
            </span>,
          );
          continue;
        }

        if (cmd === 'overline' || cmd === 'bar' || cmd === 'hat' || cmd === 'widehat' || cmd === 'tilde' || cmd === 'widetilde' || cmd === 'dot' || cmd === 'ddot' || cmd === 'vec') {
          const inner = readGroupOrToken(input, i);
          i = inner.next;
          const k = nextKey();
          const trimmed = inner.content.trim();
          if (trimmed.length === 1 && COMBINING_ACCENTS[cmd]) {
            nodes.push(`${trimmed}${COMBINING_ACCENTS[cmd]}`);
          } else if (cmd === 'overline' || cmd === 'bar') {
            nodes.push(
              <span key={k} className="cp-math-overline">
                {parseTexExpression(inner.content, `${k}b`)}
              </span>,
            );
          } else {
            const mark = COMBINING_ACCENTS[cmd] ?? '';
            nodes.push(
              <span key={k} className="cp-math-accent">
                {parseTexExpression(inner.content, `${k}a`)}
                {mark}
              </span>,
            );
          }
          continue;
        }

        if (TEXT_WRAPPER_MACROS.has(cmd)) {
          const inner = readGroupOrToken(input, i);
          i = inner.next;
          const k = nextKey();
          nodes.push(
            <span key={k} className={cmd === 'mathbf' || cmd === 'textbf' ? 'cp-math-bold' : 'cp-math-text'}>
              {parseTexExpression(inner.content, `${k}t`, true)}
            </span>,
          );
          continue;
        }

        if (FUNCTION_NAME_MACROS.has(cmd)) {
          nodes.push(
            <span key={nextKey()} className="cp-math-fn">
              {cmd}
            </span>,
          );
          continue;
        }

        if (cmd in GREEK_AND_SYMBOLS) {
          nodes.push(GREEK_AND_SYMBOLS[cmd]);
          continue;
        }

        // Graceful fallback for unrecognized macros: render word without backslash
        nodes.push(cmd);
        continue;
      }

      i += 1;
      continue;
    }

    if (ch === '{') {
      const grp = readGroupOrToken(input, i);
      i = grp.next;
      nodes.push(<Fragment key={nextKey()}>{parseTexExpression(grp.content, `${keyPrefix}-g${tokenIdx}`, plainTextMode)}</Fragment>);
      continue;
    }

    if (ch === '}' || ch === '&') {
      i += 1;
      continue;
    }

    if (ch === '^' || ch === '_') {
      const isSup = ch === '^';
      const arg = readGroupOrToken(input, i + 1);
      i = arg.next;
      const trimmed = arg.content.trim();
      if (isSup && (trimmed === '\\circ' || trimmed === '°')) {
        nodes.push('°');
      } else {
        const k = nextKey();
        const Tag = isSup ? 'sup' : 'sub';
        nodes.push(
          <Tag key={k} className={isSup ? 'cp-math-sup' : 'cp-math-sub'}>
            {parseTexExpression(arg.content, `${k}s`, trimmed.length > 1)}
          </Tag>,
        );
      }
      continue;
    }

    if (plainTextMode) {
      let j = i + 1;
      while (j < input.length && !'\\{}_^'.includes(input.charAt(j))) j += 1;
      nodes.push(input.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '-' && !/\d/.test(input.charAt(i - 1))) {
      nodes.push('−');
      i += 1;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z]/.test(input.charAt(j))) j += 1;
      const word = input.slice(i, j);
      nodes.push(
        <span key={nextKey()} className={word.length === 1 ? 'cp-math-var' : 'cp-math-ident'}>
          {word}
        </span>,
      );
      i = j;
      continue;
    }

    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /\s/.test(input.charAt(j))) j += 1;
      nodes.push(' ');
      i = j;
      continue;
    }

    nodes.push(ch);
    i += 1;
  }

  return nodes;
}

/**
 * Safely renders LaTeX formulas (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) strictly
 * as React nodes (never `dangerouslySetInnerHTML`), keeping DOM `.textContent` clean.
 */
export function renderLatexFormula(rawTex: string, keyPrefix: string, display = false): ReactNode {
  const cleaned = rawTex
    .replace(/\\begin\{(?:aligned|align\*?|gather\*?|cases|matrix|pmatrix|bmatrix)\}/g, '')
    .replace(/\\end\{(?:aligned|align\*?|gather\*?|cases|matrix|pmatrix|bmatrix)\}/g, '')
    .trim();

  if (!display) {
    return (
      <span key={keyPrefix} className="cp-math-inline">
        {parseTexExpression(cleaned, keyPrefix)}
      </span>
    );
  }

  const rows = cleaned
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean);

  return (
    <div key={keyPrefix} className="cp-math-block" role="math" aria-label={cleaned}>
      {rows.length > 0
        ? rows.map((row, idx) => (
            <div key={`${keyPrefix}-r${idx}`} className="cp-math-row">
              {parseTexExpression(row, `${keyPrefix}-r${idx}`)}
            </div>
          ))
        : parseTexExpression(cleaned, keyPrefix)}
    </div>
  );
}
