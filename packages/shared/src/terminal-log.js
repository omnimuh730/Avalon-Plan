/**
 * Structured, colorized terminal logging for NextOffer services.
 * Styling only — callers keep the same console.* messages and timing.
 */

const ESC = '\x1b[';
const c = {
	reset: `${ESC}0m`,
	dim: `${ESC}2m`,
	bold: `${ESC}1m`,
	gray: `${ESC}90m`,
	red: `${ESC}31m`,
	green: `${ESC}32m`,
	yellow: `${ESC}33m`,
	blue: `${ESC}34m`,
	magenta: `${ESC}35m`,
	cyan: `${ESC}36m`,
	white: `${ESC}37m`,
	brightRed: `${ESC}91m`,
	brightGreen: `${ESC}92m`,
	brightYellow: `${ESC}93m`,
	brightBlue: `${ESC}94m`,
	brightMagenta: `${ESC}95m`,
	brightCyan: `${ESC}96m`,
};

/** @type {Record<string, string>} */
export const TAG_COLORS = {
	'match-score': c.magenta,
	'job-analysis': c.cyan,
	'job-skill-extract': c.brightCyan,
	socket: c.green,
	redis: c.red,
	qdrant: c.blue,
	embedding: c.brightMagenta,
	'avalon-log': c.yellow,
	job_market: c.brightBlue,
	imap: c.cyan,
	'otp-extract': c.yellow,
	api: c.brightRed,
	infra: c.blue,
	dev: c.brightYellow,
	prestart: c.brightBlue,
	athens: c.brightMagenta,
	'unified-ai': c.brightCyan,
	'avalon-relay': c.yellow,
	'ai-bff': c.magenta,
	mongo: c.blue,
};

/** @type {Record<string, { icon: string, color: string }>} */
export const LEVEL_STYLES = {
	info: { icon: '●', color: c.green },
	warn: { icon: '▲', color: c.yellow },
	error: { icon: '✖', color: c.red },
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
	return String(text).replace(ANSI_RE, '');
}

function formatTimestamp() {
	const now = new Date();
	const h = String(now.getHours()).padStart(2, '0');
	const m = String(now.getMinutes()).padStart(2, '0');
	const s = String(now.getSeconds()).padStart(2, '0');
	const ms = String(now.getMilliseconds()).padStart(3, '0');
	return `${h}:${m}:${s}.${ms}`;
}

function stringifyArg(arg) {
	if (arg instanceof Error) return arg.stack || arg.message;
	if (typeof arg === 'object' && arg !== null) {
		try {
			return JSON.stringify(arg, null, 2);
		} catch {
			return String(arg);
		}
	}
	return String(arg);
}

/**
 * @param {string} text
 * @returns {{ tag: string | null, body: string }}
 */
export function extractBracketTag(text) {
	if (typeof text !== 'string') return { tag: null, body: stringifyArg(text) };
	const match = text.match(/^\[([^\]]+)\]\s*(.*)$/s);
	if (match) return { tag: match[1], body: match[2] || '' };
	return { tag: null, body: text };
}

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {unknown[]} args
 * @param {string} [defaultTag]
 */
export function formatLogLine(level, args, defaultTag = '') {
	const style = LEVEL_STYLES[level] || LEVEL_STYLES.info;
	const first = args[0];
	let tag = null;
	let bodyParts = [];

	if (typeof first === 'string') {
		const parsed = extractBracketTag(first);
		tag = parsed.tag;
		if (parsed.body) bodyParts.push(parsed.body);
		bodyParts.push(...args.slice(1).map(stringifyArg));
	} else {
		bodyParts = args.map(stringifyArg);
	}

	if (!tag && defaultTag) tag = defaultTag;

	const message = bodyParts.filter((part) => part !== '').join(' ');
	const ts = `${c.dim}${formatTimestamp()}${c.reset}`;
	const icon = `${style.color}${style.icon}${c.reset}`;
	const tagLabel = (tag || 'app').padEnd(16);
	const tagColor = TAG_COLORS[tag || ''] || TAG_COLORS[defaultTag] || c.brightCyan;
	const tagStr = `${tagColor}${c.bold}${tagLabel}${c.reset}`;

	return `${ts}  ${icon}  ${tagStr}  ${message}`;
}

/**
 * @param {string} line
 * @param {string} [serviceName]
 * @returns {{ time: string, level: 'info' | 'warn' | 'error', tag: string, message: string, service: string }}
 */
export function parseStyledLine(line, serviceName = '') {
	const plain = stripAnsi(line).trim();
	if (!plain) {
		return { time: '', level: 'info', tag: serviceName || 'app', message: '', service: serviceName };
	}

	const structured = plain.match(
		/^(\d{2}:\d{2}:\d{2}\.\d{3})\s+[●▲✖]\s+(\S+)\s{2,}(.*)$/,
	);
	if (structured) {
		const icon = plain.match(/\s([●▲✖])\s/)?.[1];
		const level = icon === '▲' ? 'warn' : icon === '✖' ? 'error' : 'info';
		return {
			time: structured[1],
			level,
			tag: structured[2].trim(),
			message: structured[3],
			service: serviceName,
		};
	}

	const bracket = extractBracketTag(plain);
	return {
		time: formatTimestamp().slice(0, 12),
		level: plain.toLowerCase().includes('error') || plain.toLowerCase().includes('failed') ? 'error' : 'info',
		tag: bracket.tag || serviceName || 'app',
		message: bracket.tag ? bracket.body : plain,
		service: serviceName,
	};
}

/**
 * @param {string} [defaultTag]
 */
export function installTerminalLogger(defaultTag = '') {
	if (process.env.NO_STYLED_LOGS === '1') return;

	const original = {
		log: console.log.bind(console),
		info: console.info.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	const wrap =
		(level, output) =>
		(...args) => {
			output(formatLogLine(level, args, defaultTag));
		};

	console.log = wrap('info', original.log);
	console.info = wrap('info', original.info);
	console.warn = wrap('warn', original.warn);
	console.error = wrap('error', original.error);
}

const originalConsole = {
	log: console.log.bind(console),
};

export function printBanner(title, lines = []) {
	const width = 62;
	const bar = '─'.repeat(width - 2);
	const pad = (text) => {
		const visible = stripAnsi(text);
		const padding = Math.max(1, width - visible.length - 2);
		return `${text}${' '.repeat(padding)}`;
	};

	originalConsole.log(`${c.brightBlue}${c.bold}╭${bar}╮${c.reset}`);
	originalConsole.log(`${c.brightBlue}${c.bold}│${c.reset} ${pad(`${c.brightMagenta}${c.bold}${title}${c.reset}`)}${c.brightBlue}${c.bold}│${c.reset}`);
	for (const line of lines) {
		originalConsole.log(`${c.brightBlue}${c.bold}│${c.reset} ${pad(`${c.dim}${line}${c.reset}`)}${c.brightBlue}${c.bold}│${c.reset}`);
	}
	originalConsole.log(`${c.brightBlue}${c.bold}╰${bar}╯${c.reset}`);
}
