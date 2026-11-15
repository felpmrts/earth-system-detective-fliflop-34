export interface OfflineAuditIssue {
  readonly file: string;
  readonly reason: string;
  readonly match: string;
}

const BLOCKING_HTML_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'External HTTP(S) <script> tag',
    regex: /<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["']/gi,
  },
  {
    label: 'External HTTP(S) stylesheet or <link> resource',
    regex: /<link\b[^>]*\bhref=["']https?:\/\/[^"']+["']/gi,
  },
  {
    label: 'External Google Fonts / CDN reference in HTML',
    regex: /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|cdn\.skypack\.dev)[^\s"'<>]*/gi,
  },
];

const BLOCKING_CSS_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'External CSS import (@import url(http...))',
    regex: /@import\s+(?:url\(\s*)?["']?https?:\/\/[^"')\s;]+/gi,
  },
  {
    label: 'External CSS url(http...) resource (fonts or images)',
    regex: /url\(\s*["']?https?:\/\/[^"')\s]+/gi,
  },
];

const BLOCKING_JS_CDN_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'External font, script, or library CDN embedded in JS',
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
