#!/usr/bin/env node
/**
 * Mandatory bootstrap before `npm start`:
 * 1. Start MongoDB + Redis (Docker)
 * 2. Wait until ports are open
 * 3. Backfill jobs.skillsNormalized + Redis skill index
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(ROOT, 'Athens-server', 'docker-compose.yml');

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log('[prestart] Starting infrastructure (MongoDB + Redis)…');
run('docker', ['compose', '-f', composeFile, 'up', '-d', 'mongodb', 'redis']);

run('node', [path.join(ROOT, 'scripts', 'wait-for-ports.mjs')]);

console.log('[prestart] Backfilling job skills + Redis index…');
run('npm', ['run', 'build', '-w', 'unified-ai-server']);
run('npm', ['run', 'backfill-job-skills', '-w', 'Athens-server']);

console.log('[prestart] Bootstrap complete.\n');
