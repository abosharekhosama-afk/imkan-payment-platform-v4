import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Load repo-root `.env` into process.env (does not override existing vars). */
export function loadRootDotEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '../../..');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadRootDotEnv();
