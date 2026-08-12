#!/usr/bin/env node
/**
 * Build the V4 web console for production (static assets).
 * Requires apps/web/.env.production with VITE_API_URL and VITE_SESSION_TRANSPORT=cookie.
 *
 * Usage: npm run build:web:production
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'apps', 'web');
const prodEnv = path.join(webDir, '.env.production');
const example = path.join(webDir, '.env.production.example');

if (!fs.existsSync(prodEnv)) {
  console.error('Missing apps/web/.env.production');
  console.error(`Copy ${path.relative(root, example)} and set VITE_API_URL to your API origin.`);
  process.exit(2);
}

const envText = fs.readFileSync(prodEnv, 'utf8');
if (!/VITE_API_URL=https:\/\//.test(envText)) {
  console.warn('WARN: VITE_API_URL should use HTTPS in production.');
}
if (!/VITE_SESSION_TRANSPORT=cookie/.test(envText)) {
  console.warn('WARN: VITE_SESSION_TRANSPORT should be cookie in production.');
}

console.log('Building web for production…');
const r = spawnSync('npm', ['run', 'build', '-w', 'apps/web'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {...process.env, NODE_ENV: 'production'},
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log('\nWeb build output: apps/web/dist');
console.log('Serve dist/ behind HTTPS (nginx, CDN, or object storage + CDN).');
