export interface OfflineAuditIssue {
  readonly file: string;
  readonly reason: string;
  readonly match: string;
}

const BLOCKING_HTML_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'Tag <script> externa por HTTP(S)',
    regex: /<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["']/gi,
  },
  {
    label: 'Folha de estilo ou recurso <link> externo por HTTP(S)',
    regex: /<link\b[^>]*\bhref=["']https?:\/\/[^"']+["']/gi,
  },
  {
    label: 'Referência Google Fonts / CDN externo em HTML',
    regex: /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|cdn\.skypack\.dev)[^\s"'<>]*/gi,
  },
];

const BLOCKING_CSS_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'Importação CSS externa (@import url(http...))',
    regex: /@import\s+(?:url\(\s*)?["']?https?:\/\/[^"')\s;]+/gi,
  },
  {
    label: 'Recurso CSS url(http...) (fontes ou imagens externas)',
    regex: /url\(\s*["']?https?:\/\/[^"')\s]+/gi,
  },
];

const BLOCKING_JS_CDN_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'CDN de fonte, script ou biblioteca externa embutida no JS',
    regex: /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|cdn\.skypack\.dev|ajax\.googleapis\.com)[^\s"'`)]*/gi,
  },
];

function collectMatches(
  file: string,
  source: string,
  patterns: readonly { readonly label: string; readonly regex: RegExp }[],
): OfflineAuditIssue[] {
  const issues: OfflineAuditIssue[] = [];
  for (const { label, regex } of patterns) {
    regex.lastIndex = 0;
    let match = regex.exec(source);
    while (match !== null) {
      issues.push({ file, reason: label, match: match[0] });
      match = regex.exec(source);
    }
  }
  return issues;
}

export function auditHtmlOfflineSafety(file: string, html: string): readonly OfflineAuditIssue[] {
  return collectMatches(file, html, BLOCKING_HTML_PATTERNS);
}

export function auditCssOfflineSafety(file: string, css: string): readonly OfflineAuditIssue[] {
  return collectMatches(file, css, BLOCKING_CSS_PATTERNS);
}

export function auditJsBundleOfflineSafety(file: string, js: string): readonly OfflineAuditIssue[] {
  return collectMatches(file, js, BLOCKING_JS_CDN_PATTERNS);
}
