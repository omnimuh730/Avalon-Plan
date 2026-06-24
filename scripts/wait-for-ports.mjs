#!/usr/bin/env node
/**
 * Wait until MongoDB and Redis accept TCP connections.
 */
import net from 'node:net';

const targets = [
  { host: process.env.MONGO_HOST || '127.0.0.1', port: Number(process.env.MONGO_PORT || 27017), label: 'MongoDB' },
  { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), label: 'Redis' },
];

const timeoutMs = Number(process.env.INFRA_WAIT_TIMEOUT_MS || 120_000);
const intervalMs = 1_000;

function probe(host, port) {
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

for (const t of targets) {
  await waitFor(t);
}
