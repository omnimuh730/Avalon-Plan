/**
 * Plain structured terminal logging for vender-server.
 * ISO-8601 timestamps, key=value fields, no ANSI colors or icons.
 */

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '');
}

function isoTimestamp() {
  return new Date().toISOString();
}

function stringifyArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function quoteValue(value) {
  const s = String(value ?? '');
  if (s === '') return '""';
  if (/[\s="\\]/.test(s)) return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return s;
}

export function formatFields(fields = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${quoteValue(value)}`);
  }
  return parts.join(' ');
}

export function formatPlainLine(level, service, tag, msg, extra = {}) {
  const base = [
    isoTimestamp(),
    `level=${level}`,
    `service=${quoteValue(service || 'app')}`,
    `tag=${quoteValue(tag || 'app')}`,
  ];
  const extraStr = formatFields(extra);
  if (extraStr) base.push(extraStr);
  if (msg) base.push(`msg=${quoteValue(msg)}`);
  return base.join(' ');
}

export function extractBracketTag(text) {
  if (typeof text !== 'string') return { tag: null, body: stringifyArg(text) };
  const match = text.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (match) return { tag: match[1], body: match[2] || '' };
  return { tag: null, body: text };
}

export function formatLogLine(level, args, service = '') {
  const levelUpper = level === 'warn' ? 'WARN' : level === 'error' ? 'ERROR' : 'INFO';
  const first = args[0];
  let tag = 'app';
  let bodyParts = [];

  if (typeof first === 'string') {
    const parsed = extractBracketTag(first);
    if (parsed.tag) tag = parsed.tag;
    if (parsed.body) bodyParts.push(parsed.body);
    bodyParts.push(...args.slice(1).map(stringifyArg));
  } else {
    bodyParts = args.map(stringifyArg);
  }

  const message = bodyParts.filter((part) => part !== '').join(' ');
  return formatPlainLine(levelUpper, service, tag, message);
}

export function installTerminalLogger(service = '') {
  if (process.env.NO_TERMINAL_LOGGER === '1') return;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const wrap =
    (level, output) =>
    (...args) => {
      output(formatLogLine(level, args, service));
    };

  console.log = wrap('info', original.log);
  console.info = wrap('info', original.info);
  console.warn = wrap('warn', original.warn);
  console.error = wrap('error', original.error);
}
