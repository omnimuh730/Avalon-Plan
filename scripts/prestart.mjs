#!/usr/bin/env node
/**
 * Bootstrap before `npm start`. The app is Mongo-only — no Docker, Redis, or
 * Qdrant. This just verifies MongoDB is reachable, then builds the AI gateway.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe } from './wait-for-ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MONGO_HOST = process.env.MONGO_HOST || '127.0.0.1';
const MONGO_PORT = Number(process.env.MONGO_PORT || 27017);

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!(await probe(MONGO_HOST, MONGO_PORT))) {
  console.error(`
[prestart] MongoDB is not reachable at ${MONGO_HOST}:${MONGO_PORT}.

Start a local MongoDB (no Docker needed):
  brew services start mongodb-community
  # or run mongod however you prefer

Then: npm start
`);
  process.exit(1);
}
console.log(`[prestart] MongoDB ready on ${MONGO_HOST}:${MONGO_PORT}`);

// Build the unified AI gateway that all LLM calls route through.
run('npm', ['run', 'build', '-w', 'unified-ai-server']);

console.log('[prestart] Bootstrap complete.\n');
