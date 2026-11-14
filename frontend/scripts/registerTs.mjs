import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

if (isMainThread) {
  register(import.meta.url);
}

/**
 * Loader ESM leve sem dependências externas para executar scripts `.ts` no Node 20+.
 * Preserva strings literais/comentários e remove apenas anotações/declarações de tipo TS.
 */
function stripTypeScript(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  const isIdentStart = ch => /[A-Za-z_$]/.test(ch);
  const isIdent = ch => /[A-Za-z0-9_$]/.test(ch);

  function skipString(quote) {
    let chunk = quote;
    i += 1;
    while (i < n) {
      const ch = src[i];
      chunk += ch;
      if (ch === '\\') {
        i += 1;
        if (i < n) {
          chunk += src[i];
          i += 1;
        }
        continue;
      }
      if (quote === '`' && ch === '$' && src[i + 1] === '{') {
        i += 1;
        chunk += '{';
        i += 1;
        let depth = 1;
        while (i < n && depth > 0) {
          if (src[i] === '{') depth += 1;
          else if (src[i] === '}') depth -= 1;
          chunk += src[i];
          i += 1;
        }
        continue;
      }
      i += 1;
      if (ch === quote) break;
    }
    return chunk;
  }

  // Passo 1: protege literais e comentários por placeholders para não corromper texto/regexes.
  const holes = [];
  const keepHole = text => {
    const token = `\u0000H${holes.length}\u0000`;
    holes.push(text);
    return token;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += keepHole(skipString(ch));
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i += 1;
      out += keepHole(src.slice(start, i));
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      out += keepHole(src.slice(start, i));
      continue;
    }
    // Regex literal simples (ex.: /\/([A-Z0-9_]+)_grid\.json$/)
    if (ch === '/') {
      const prev = out.replace(/[\s]+$/, '').slice(-1);
      if ('(=,[!&|?:;{}~^%*/+\n'.includes(prev) || prev === '') {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) {
            j += 1;
            while (j < n && /[a-z]/i.test(src[j])) j += 1;
            closed = true;
            break;
          }
          j += 1;
        }
        if (closed) {
          out += keepHole(src.slice(i, j));
          i = j;
          continue;
        }
      }
    }
    out += ch;
    i += 1;
  }

  // Remove `import type ...;` e especificadores `type X` em imports mistos
  out = out.replace(/^[ \t]*import\s+type\s+[\s\S]*?from\s+[^;]+;?[ \t]*\r?\n?/gm, '');
  out = out.replace(/,\s*type\s+[A-Za-z_$][A-Za-z0-9_$]*(\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*)?/g, '');
  out = out.replace(/\{\s*type\s+[A-Za-z_$][A-Za-z0-9_$]*(\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*)?\s*,/g, '{');

  // Remove declarações top-level de interface e type (com chaves ou ponto-e-vírgula balanceados)
  function stripTopLevelTypes(code) {
    let res = '';
    let pos = 0;
    const len = code.length;
    while (pos < len) {
      const slice = code.slice(pos);
      const m = /^(?:[ \t]*(?:export\s+)?(?:interface|type)\s+[A-Za-z_$][A-Za-z0-9_$]*(?:<[^>{=;]+>)?\s*(?:extends\s+[^{=;]+)?(?==|\{))/.exec(slice);
      if (m && (pos === 0 || code[pos - 1] === '\n')) {
        let cur = pos + m[0].length;
        if (code[cur] === '{') {
          let b = 0;
          while (cur < len) {
            if (code[cur] === '{') b += 1;
            else if (code[cur] === '}') {
              b -= 1;
              if (b === 0) {
                cur += 1;
                break;
              }
            }
            cur += 1;
          }
        } else {
          // `type Foo = ...;` podendo conter blocos `{ ... }`
          let b = 0;
          let p = 0;
          let a = 0;
          while (cur < len) {
            const c = code[cur];
            if (c === '{') b += 1;
            else if (c === '}') b -= 1;
            else if (c === '(') p += 1;
            else if (c === ')') p -= 1;
            else if (c === '<') a += 1;
            else if (c === '>') a = Math.max(0, a - 1);
            else if (c === ';' && b === 0 && p === 0 && a === 0) {
              cur += 1;
              break;
            }
            cur += 1;
          }
        }
        pos = cur;
        continue;
      }
      res += code[pos];
      pos += 1;
    }
    return res;
  }

  out = stripTopLevelTypes(out);

  // Remove modificadores `readonly ` em propriedades de classe
  out = out.replace(/(^[ \t]*)(?:readonly\s+)+(?=[A-Za-z_$])/gm, '$1');

  // Lê uma expressão de tipo balanceada parando antes de delimitadores JS (`=`, `,`, `)`, `{`, `;`, etc.)
  function consumeType(code, start) {
    let cur = start;
    const len = code.length;
    let p = 0;
    let b = 0;
    let sq = 0;
    let ang = 0;
    while (cur < len) {
      const c = code[cur];
      if (c === '(') p += 1;
      else if (c === ')') {
        if (p === 0 && b === 0 && sq === 0 && ang === 0) break;
        p -= 1;
      } else if (c === '{') {
        // `{` no nível 0 após `): RetType {` indica abertura do corpo da função;
        // já `{ ... }` logo no início do tipo (ex.: `{ readonly a: number }`) é um tipo objeto!
        if (p === 0 && b === 0 && sq === 0 && ang === 0) {
          const prevNonSpace = code.slice(start, cur).trim();
          if (prevNonSpace.length > 0 && !prevNonSpace.endsWith('|') && !prevNonSpace.endsWith('&')) {
            break;
          }
        }
        b += 1;
      } else if (c === '}') {
        if (p === 0 && b === 0 && sq === 0 && ang === 0) break;
        b -= 1;
      } else if (c === '[') sq += 1;
      else if (c === ']') {
        if (p === 0 && b === 0 && sq === 0 && ang === 0) break;
        sq -= 1;
      } else if (c === '<') ang += 1;
      else if (c === '>') {
        if (ang > 0) ang -= 1;
        else if (code[cur - 1] === '=') {
          // `=>` na assinatura de arrow return `(args): Ret =>` ou em tipo função `(x: T) => U`
        }
      } else if (p === 0 && b === 0 && sq === 0 && ang === 0) {
        if (c === '=' && code[cur + 1] !== '>') break;
        if (c === ',' || c === ';') break;
        if (c === '\n') {
          const next = code.slice(cur + 1).trimStart();
          if (!next.startsWith('|') && !next.startsWith('&')) break;
        }
        if (c === 'a' && code.slice(cur, cur + 3).match(/^as\b/) && /\s/.test(code[cur - 1] || '')) break;
      }
      cur += 1;
    }
    return cur;
  }

  // Varre declarações tipadas, parâmetros, retornos de função, `as Type`, `new Ctor<T>()`
  function stripInlineTypes(code) {
    let res = '';
    let pos = 0;
    const len = code.length;
    let inParams = 0;
    let braceStack = []; // 'block' | 'object'
    let pendingFnReturn = false;

    while (pos < len) {
      const ch = code[pos];

      // Preserva placeholders
      if (ch === '\u0000') {
        const endH = code.indexOf('\u0000', pos + 1);
        const hToken = code.slice(pos, endH + 1);
        res += hToken;
        pos = endH + 1;
        continue;
      }

      // Generic calls: `new Set<string>(...)`, `new Map<K, V>(...)`, `fn<T>(...)`
      if (ch === '<' && pos > 0 && isIdent(code[pos - 1])) {
        const tail = code.slice(pos);
        const gm = /^<[^;\n=]+?>(?=\s*\()/.exec(tail);
        if (gm) {
          pos += gm[0].length;
          continue;
        }
      }

      // Acompanhamento de blocos vs objetos literais simples para não apagar `key: val`
      if (ch === '(') {
        res += ch;
        inParams += 1;
        pos += 1;
        continue;
      }
      if (ch === ')') {
        res += ch;
        if (inParams > 0) inParams -= 1;
        // Checa `: RetType` antes de `{` ou `=>`
        const afterParen = code.slice(pos + 1);
        const retMatch = /^\s*:\s*/.exec(afterParen);
        if (retMatch) {
          const typeEnd = consumeType(code, pos + 1 + retMatch[0].length);
          const afterType = code.slice(typeEnd).trimStart();
          if (afterType.startsWith('{') || afterType.startsWith('=>')) {
            pos = typeEnd;
            continue;
          }
        }
        pos += 1;
        continue;
      }

      // `const x: Type = ...` / `let x: Type = ...` / `export const x: Type = ...`
      if (
        (code.startsWith('const ', pos) || code.startsWith('let ', pos) || code.startsWith('var ', pos)) &&
        (pos === 0 || !isIdent(code[pos - 1]))
      ) {
        const declMatch = /^(const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*:\s*/.exec(code.slice(pos));
        if (declMatch) {
          const colonIdx = declMatch[0].indexOf(':');
          res += declMatch[0].slice(0, colonIdx);
          pos = consumeType(code, pos + declMatch[0].length);
          continue;
        }
      }

      // Parâmetro opcional/tipado dentro de `(...)` de função/arrow: `(a: Type, b?: Type = 1)`
      if (ch === ':' && inParams > 0) {
        // Verifica se é realmente anotação de parâmetro (precedido por identificador ou `]?` ou `}` de destructuring)
        const before = res.replace(/\s+$/, '');
        if (isIdent(before.slice(-1)) || before.endsWith('?')) {
          if (before.endsWith('?')) {
            res = before.slice(0, -1);
          }
          // Evita apagar chaves de objetos literais passados em chamadas como `fn({ a: 1 })`
          const lastOpenBrace = res.lastIndexOf('{');
          const lastOpenParen = res.lastIndexOf('(');
          if (lastOpenBrace < lastOpenParen) {
            pos = consumeType(code, pos + 1);
            continue;
          }
        }
      }

      // `as Type` / `as const`
      if (code.startsWith('as', pos) && (pos === 0 || !isIdent(code[pos - 1])) && !isIdent(code[pos + 2] || '')) {
        const afterAs = code.slice(pos + 2);
        if (/^\s+/.test(afterAs)) {
          // Evita `import { x as y }` — apenas remove quando NÃO está dentro de `import { ... }`
          const lineStart = code.lastIndexOf('\n', pos) + 1;
          const linePrefix = code.slice(lineStart, pos);
          if (!/^\s*(import|export)\b/.test(linePrefix)) {
            pos = consumeType(code, pos + 2 + /^\s+/.exec(afterAs)[0].length);
            continue;
          }
        }
      }

      res += ch;
      pos += 1;
    }
    return res;
  }

  out = stripInlineTypes(out);

  // Restaura placeholders
  out = out.replace(/\u0000H(\d+)\u0000/g, (_, idx) => holes[Number(idx)]);
  return out;
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts')) {
    return nextLoad(url, context);
  }
  const source = await readFile(fileURLToPath(url), 'utf8');
  return {
    format: 'module',
    shortCircuit: true,
    source: stripTypeScript(source),
  };
}
