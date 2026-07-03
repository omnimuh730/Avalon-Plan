export const TAG_COLORS: Record<string, string>;
export const LEVEL_STYLES: Record<string, { icon: string; color: string }>;

export function stripAnsi(text: string): string;
export function extractBracketTag(text: string): { tag: string | null; body: string };
export function formatLogLine(level: 'info' | 'warn' | 'error', args: unknown[], defaultTag?: string): string;
export function parseStyledLine(
	line: string,
	serviceName?: string,
): { time: string; level: 'info' | 'warn' | 'error'; tag: string; message: string; service: string };
export function installTerminalLogger(defaultTag?: string): void;
export function printBanner(title: string, lines?: string[]): void;
