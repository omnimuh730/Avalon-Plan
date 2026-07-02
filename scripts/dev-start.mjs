#!/usr/bin/env node
/**
 * Start all NextOffer dev services.
 * Backends start first; the Vite UI waits until their ports are open
 * so LAN websocket proxies do not hit ECONNREFUSED on boot.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe } from './wait-for-ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVALON = path.join(ROOT, 'project-avalon');

const backendServices = [
  { name: 'unified-ai', cmd: 'npm', args: ['run', 'start', '-w', 'unified-ai-server'], cwd: ROOT },
  { name: 'athens-server', cmd: 'npm', args: ['run', 'start', '-w', 'Athens-server'], cwd: ROOT },
  { name: 'avalon-backend', cmd: 'npm', args: ['run', 'dev:backend'], cwd: AVALON },
  { name: 'avalon-ai-bff', cmd: 'npm', args: ['run', 'dev:ai-bff'], cwd: AVALON },
];

const uiService = {
  name: 'athens-ui',
  cmd: 'npm',
  args: ['run', 'dev'],
  cwd: path.join(ROOT, 'Athens'),
};

const backendPorts = [
  { host: '127.0.0.1', port: Number(process.env.UNIFIED_AI_PORT || 8790), label: 'Unified AI' },
  { host: '127.0.0.1', port: Number(process.env.ATHENS_SERVER_PORT || 8979), label: 'Athens-server' },
  { host: '127.0.0.1', port: Number(process.env.AVALON_PORT || 3847), label: 'Avalon relay' },
  { host: '127.0.0.1', port: Number(process.env.AI_BFF_PORT || 3920), label: 'Avalon AI BFF' },
];

const children = [];

function lanAddresses() {
  const ips = new Set();
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) ips.add(net.address);
    }
  }
  return [...ips];
}

function startService(svc) {
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev] ${svc.name} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  console.log(`[dev] started ${svc.name}`);
  return child;
}

async function waitForBackends() {
  const timeoutMs = Number(process.env.DEV_BACKEND_WAIT_MS || 90_000);
  const intervalMs = 500;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const ready = await Promise.all(backendPorts.map((t) => probe(t.host, t.port)));
    if (ready.every(Boolean)) {
      console.log('[dev] backend ports ready');
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const pending = [];
  for (const target of backendPorts) {
    if (!(await probe(target.host, target.port))) {
      pending.push(`${target.label}:${target.port}`);
    }
  }
  console.warn(`[dev] timed out waiting for backends (${pending.join(', ')}) — starting UI anyway`);
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const svc of backendServices) {
  startService(svc);
}

await waitForBackends();
startService(uiService);

const devPort = Number(process.env.VITE_DEV_PORT || 9030) || 9030;
const networkLines = lanAddresses()
  .map((ip) => `  Frontend (LAN) → http://${ip}:${devPort}`)
  .join('\n');

console.log(`
NextOffer is running:
  Frontend       → http://localhost:${devPort}
${networkLines || '  Frontend (LAN) → use the Network URL printed by Vite'}
  Athens-server  → http://localhost:8979
  Unified AI     → http://localhost:8790
  Avalon relay   → http://localhost:3847
  Avalon AI BFF  → http://localhost:3920
Press Ctrl+C to stop all services.
`);
