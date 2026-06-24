#!/usr/bin/env node
/**
 * Start all NextOffer dev services in parallel.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const services = [
  { name: 'unified-ai', cmd: 'npm', args: ['run', 'start', '-w', 'unified-ai-server'], cwd: ROOT },
  { name: 'athens-server', cmd: 'npm', args: ['run', 'start', '-w', 'Athens-server'], cwd: ROOT },
  { name: 'connector', cmd: 'npm', args: ['run', 'start', '-w', 'connector'], cwd: ROOT },
  { name: 'athens-ui', cmd: 'npm', args: ['run', 'dev'], cwd: path.join(ROOT, 'Athens') },
];

const children = [];

for (const svc of services) {
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
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`
NextOffer is running:
  Frontend       → http://localhost:5173
  Athens-server  → http://localhost:7979
  Unified AI     → http://localhost:8790
  Connector      → http://localhost:8781
Press Ctrl+C to stop all services.
`);
