#!/usr/bin/env node
/**
 * Mandatory bootstrap before `npm start`:
 * 1. Ensure MongoDB + Redis + Qdrant are running (Docker if needed, or skip if already up)
 * 2. Wait until ports are open
 * 3. Backfill jobs.skillsNormalized + Redis skill index
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPortsReady, targets } from './wait-for-ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(ROOT, 'Athens-server', 'docker-compose.yml');
const skipDocker = (process.env.SKIP_DOCKER || '').toLowerCase() === '1'
  || (process.env.SKIP_DOCKER || '').toLowerCase() === 'true';

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function dockerDaemonReady() {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

function printInfraHelp(reason) {
  const ports = targets.map((t) => `${t.label} ${t.host}:${t.port}`).join(', ');
  console.error(`
[prestart] ${reason}

MongoDB, Redis, and Qdrant must be reachable (${ports}) before NextOffer can start.

Option A — Docker Desktop (recommended)
  1. Open Docker Desktop and wait until it says "Running"
  2. Run: npm start

Option B — Homebrew (no Docker)
  brew install mongodb-community redis
  brew services start mongodb-community
  brew services start redis
  cd Athens-server && npm run qdrant:start
  SKIP_DOCKER=1 npm start

Option C — Start Docker containers manually
  npm run infra:up
  npm start

If databases are already running elsewhere, use:
  SKIP_DOCKER=1 npm start
`);
}

async function ensureInfra() {
  if (await allPortsReady()) {
    console.log('[prestart] MongoDB + Redis + Qdrant already running — skipping Docker');
    return;
  }

  if (skipDocker) {
    console.log('[prestart] SKIP_DOCKER set — waiting for existing MongoDB + Redis + Qdrant…');
    run('node', [path.join(ROOT, 'scripts', 'wait-for-ports.mjs')]);
    return;
  }

  if (!dockerDaemonReady()) {
    printInfraHelp('Docker is not running (docker.sock not found)');
    process.exit(1);
  }

  console.log('[prestart] Starting infrastructure (MongoDB + Redis + Qdrant) via Docker…');
  const up = spawnSync(
    'docker',
    ['compose', '-f', composeFile, 'up', '-d', 'mongodb', 'redis', 'qdrant'],
    { stdio: 'inherit', cwd: ROOT },
  );
  if (up.status !== 0) {
    printInfraHelp('docker compose failed to start MongoDB/Redis/Qdrant');
    process.exit(up.status ?? 1);
  }

  run('node', [path.join(ROOT, 'scripts', 'wait-for-ports.mjs')]);
}

await ensureInfra();

console.log('[prestart] Backfilling job skills + Redis index…');
run('npm', ['run', 'build', '-w', 'unified-ai-server']);
run('npm', ['run', 'backfill-job-skills', '-w', 'Athens-server']);

console.log('[prestart] Bootstrap complete.\n');
