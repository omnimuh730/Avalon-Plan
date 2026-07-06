import DOMPurify from 'dompurify';

const PURIFY_OPTIONS: DOMPurify.Config = {
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ['style', 'link', 'head', 'body', 'meta', 'center', 'font', 'o:p', 'wbr'],
  ADD_ATTR: [
    'style',
    'class',
    'id',
    'target',
    'align',
    'valign',
    'bgcolor',
    'background',
    'color',
    'border',
    'cellpadding',
    'cellspacing',
    'width',
    'height',
    'colspan',
    'rowspan',
    'role',
    'aria-hidden',
    'face',
    'size',
    'loading',
    'srcset',
    'data-src',
  ],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  ALLOW_UNKNOWN_PROTOCOLS: true,
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
};

export const EMAIL_VIEWPORT_FIX_CSS = `
html, body {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
}
body > div,
body > table,
body > center {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
}
.ga-plain-text-fallback {
  margin: 0 0 16px;
  padding: 16px;
  border-radius: 8px;
  background: #2a2a2a;
  color: #e5e5e5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}
.ga-plain-text-fallback p { margin: 0 0 12px; }
.ga-lazy-img {
  background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
  background-size: 200% 100%;
  animation: ga-skeleton 1.2s ease-in-out infinite;
  min-height: 48px;
  min-width: 80px;
}
.ga-lazy-img.ga-lazy-loaded {
  animation: none;
  background: transparent;
  min-height: 0;
  min-width: 0;
}
@keyframes ga-skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_OPTIONS);
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function isFullHtmlDocument(html: string): boolean {
  const trimmed = html.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function injectIntoHead(html: string, injection: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${injection}`);
  }
  return injection + html;
}

function shouldPrependPlainText(_html: string, plainBody: string): boolean {
  const plain = plainBody.trim();
  return plain.length > 0 && plain !== '(No text content)';
}

function plainTextFallbackBlock(plainBody: string): string {
  return `<div class="ga-plain-text-fallback">${plainTextToHtml(plainBody)}</div>`;
}

export function wrapEmailHtmlForIframe(html: string, plainBody = ''): string {
  const sanitized = sanitizeEmailHtml(html);
  const fixTag = `<style data-gmail-assistant-viewport-fix>${EMAIL_VIEWPORT_FIX_CSS}</style>`;
  const prependPlain =
    plainBody && shouldPrependPlainText(sanitized, plainBody) ? plainTextFallbackBlock(plainBody) : '';

  if (isFullHtmlDocument(sanitized)) {
    let doc = injectIntoHead(sanitized, fixTag);
    if (prependPlain) {
      doc = doc.replace(/<body([^>]*)>/i, `<body$1>${prependPlain}`);
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank" rel="noopener noreferrer">
<style data-gmail-assistant-viewport-fix>${EMAIL_VIEWPORT_FIX_CSS}
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
</style>
</head>
<body>${prependPlain}${sanitized}</body>
</html>`;
}

export function resolveDisplayHtml(bodyHtml: string | null | undefined, plainBody: string): string {
  const html = bodyHtml?.trim();
  const plain = plainBody?.trim() ?? '';
  if (html) return wrapEmailHtmlForIframe(html, plain);
  return wrapEmailHtmlForIframe(plainTextToHtml(plain || '(No text content)'), plain);
}

export function applyDeepViewportFix(doc: Document): void {
  const view = doc.defaultView;
  if (!view || !doc.body) return;

  for (const el of doc.body.querySelectorAll<HTMLElement>('*')) {
    const style = view.getComputedStyle(el);
    if (['hidden', 'scroll', 'auto', 'clip'].includes(style.overflow)) {
      el.style.setProperty('overflow', 'visible', 'important');
    }
    if (style.maxHeight !== 'none' && style.maxHeight !== '') {
      el.style.setProperty('max-height', 'none', 'important');
    }
    const heightPx = parseFloat(style.height);
    if (heightPx > 0 && heightPx < 400 && style.height.endsWith('px')) {
      el.style.setProperty('height', 'auto', 'important');
    }
  }
}

export function measureEmailDocumentHeight(doc: Document): number {
  const view = doc.defaultView;
  if (!view || !doc.body) return 0;

  applyDeepViewportFix(doc);

  const bodyTop = doc.body.getBoundingClientRect().top;
  let maxBottom = doc.body.getBoundingClientRect().bottom;

  for (const el of doc.body.querySelectorAll<HTMLElement>('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    maxBottom = Math.max(maxBottom, rect.bottom);
  }

  const scrollHeight = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    maxBottom - bodyTop,
  );

  const textLength = doc.body.innerText?.trim().length ?? 0;
  if (textLength > 80 && scrollHeight < 200) {
    return Math.max(scrollHeight, 480);
  }

  return Math.ceil(scrollHeight + 24);
}
