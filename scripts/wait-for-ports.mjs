#!/usr/bin/env node
/**
 * Wait until MongoDB accepts TCP connections. (Redis/Qdrant/Docker are no
 * longer used — the app is Mongo-only.)
 * Also exports probe() for prestart infra checks.
 */
import net from 'node:net';
import { installTerminalLogger } from '@nextoffer/shared/terminal-log';

export const targets = [
  { host: process.env.MONGO_HOST || '127.0.0.1', port: Number(process.env.MONGO_PORT || 27017), label: 'MongoDB' },
];

const timeoutMs = Number(process.env.INFRA_WAIT_TIMEOUT_MS || 120_000);
const intervalMs = 1_000;

export function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(2_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function allPortsReady(list = targets) {
  for (const t of list) {
    if (!(await probe(t.host, t.port))) return false;
  }
  return true;
}

async function waitFor(target) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(target.host, target.port)) {
      console.log(`[infra] ${target.label} ready on ${target.host}:${target.port}`);
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`[infra] Timed out waiting for ${target.label} on ${target.host}:${target.port}`);
}

/** Only run wait loop when executed directly: node scripts/wait-for-ports.mjs */
const isMain = process.argv[1]?.endsWith('wait-for-ports.mjs');
if (isMain) {
	installTerminalLogger('infra');
	for (const t of targets) {
		await waitFor(t);
	}
}
