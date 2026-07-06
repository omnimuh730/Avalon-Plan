import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function findVenderServerRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'vender-server') return dir;
      } catch {
        // Ignore invalid package.json and keep walking up.
      }
    }
    const parent = path.resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir, '..');
}

export const PROJECT_ROOT = findVenderServerRoot(moduleDir);

export function resolveAssetPath(envKey, fallbackRelative) {
  const fileName = path.basename(fallbackRelative);
  const candidates = [];

  const configured = String(process.env[envKey] ?? '').trim();
  if (configured) {
    if (path.isAbsolute(configured)) {
      candidates.push(configured);
    } else {
      candidates.push(
        path.resolve(moduleDir, configured),
        path.resolve(PROJECT_ROOT, configured),
        path.resolve(process.cwd(), configured),
      );
    }
  }

  candidates.push(
    path.join(moduleDir, fileName),
    path.join(process.cwd(), fileName),
    path.join(PROJECT_ROOT, fileName),
    path.resolve(PROJECT_ROOT, fallbackRelative),
    path.resolve(PROJECT_ROOT, '..', 'bid-assistant', fileName),
  );

  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved)) return resolved;
  }

  return path.resolve(candidates[0] ?? path.join(moduleDir, fileName));
}

export function loadEnv() {
  dotenv.config({ path: path.join(moduleDir, '.env') });
  dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
}

export function readTextAsset(envKey, fallbackRelative) {
  const assetPath = resolveAssetPath(envKey, fallbackRelative);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing asset file: ${assetPath}`);
  }
  return fs.readFileSync(assetPath, 'utf8');
}

export function readJsonAsset(envKey, fallbackRelative) {
  const assetPath = resolveAssetPath(envKey, fallbackRelative);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing asset file: ${assetPath}`);
  }
  return JSON.parse(fs.readFileSync(assetPath, 'utf8'));
}
