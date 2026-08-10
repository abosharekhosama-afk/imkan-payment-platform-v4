/**
 * Generate docs/security/API_AUTHORIZATION_MATRIX.md from live route source.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'apps/api/src/interfaces/http/apiV1');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

const PUBLIC_EXACT = new Set([
  '/health',
  '/health/ready',
  '/auth/register',
  '/auth/login',
  '/auth/mfa/verify',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/password/forgot',
  '/auth/password/reset',
  '/invitations/accept',
]);

function isPublicPath(p) {
  if (PUBLIC_EXACT.has(p)) return true;
  if (p.startsWith('/checkout/')) return true;
  if (p.startsWith('/webhooks/providers/')) return true;
  return false;
}

const rows = [];

for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const routeRe = /app\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/g;
  let m;
  while ((m = routeRe.exec(text))) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const start = m.index;
    // Limit window to this route's options + start of handler
    const nextApp = text.indexOf('\n  app.', start + 5);
    const asyncIdx = text.indexOf('async (', start);
    const endCandidates = [nextApp, asyncIdx + 200, start + 1200].filter((n) => n > start);
    const end = Math.min(...endCandidates);
    const window = text.slice(start, end);

    let perms = 'auth-only';
    if (isPublicPath(routePath)) {
      perms = '(public)';
    } else {
      const permMatch = window.match(/requirePermission\(([^)]*)\)/);
      if (permMatch) {
        perms = permMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/['"`]/g, ''))
          .filter(Boolean)
          .join(' | ');
      } else if (/requireOrganizationContext/.test(window) === false && /auth\/(logout|me|mfa)/.test(routePath)) {
        perms = 'authenticated session';
      }
    }

    const stepMatch = window.match(/requireStepUp\(([^)]*)\)/);
    const stepUp = stepMatch ? stepMatch[1].replace(/['"`]/g, '') || 'yes' : 'no';
    const orgCtx = /requireOrganizationContext/.test(window)
      ? 'session org'
      : isPublicPath(routePath)
        ? 'n/a'
        : /admin\//.test(routePath)
          ? 'platform cross-tenant'
          : 'handler';

    rows.push({
      method,
      path: routePath,
      module: file.replace(/\.ts$/, '').replace(/-routes$/, ''),
      perms,
      orgScope: orgCtx,
      stepUp,
      sensitive: stepUp !== 'no' ? 'yes' : 'no',
      resourceScope: orgCtx === 'session org' ? 'org-owned' : orgCtx,
      file,
    });
  }
}

rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const lines = [
  '# API Authorization Matrix',
  '',
  `Generated from live route sources under \`apps/api/src/interfaces/http/apiV1/\`.`,
  `Date: ${new Date().toISOString().slice(0, 10)}`,
  '',
  'Organization context for tenant mutators is taken from the authenticated session/API key, not from untrusted body/query `organization_id`.',
  '',
  '| Endpoint | Method | Module | Required Permission | Role/Platform Scope | Organization Scope | Resource Scope | Sensitive? | Step-up | Source |',
  '|---|---|---|---|---|---|---|---|---|---|',
];

for (const r of rows) {
  const platform = r.perms.includes('platform.') || r.path.startsWith('/admin/') ? 'platform allowed if perm' : 'merchant';
  lines.push(
    `| \`/api/v1${r.path}\` | ${r.method} | ${r.module} | ${r.perms} | ${platform} | ${r.orgScope} | ${r.resourceScope} | ${r.sensitive} | ${r.stepUp} | \`${r.file}\` |`,
  );
}

lines.push('');
lines.push(`**Total routes inventoried:** ${rows.length}`);
lines.push('');
lines.push('## Notes');
lines.push('');
lines.push('- Regenerate: `node scripts/gen-api-authz-matrix.mjs`');
lines.push('- `*.manage` aggregates remain accepted alongside granular codes for backward compatibility (see ROLE_MATRIX).');
lines.push('- Deferred financial modules (refunds/payouts/settlements) have catalog permissions but no routes yet.');
lines.push('- Public checkout and inbound provider webhooks are intentionally unauthenticated; authorization is token/signature based.');
lines.push('- Audit required for sensitive mutations is enforced in services/routes (see SENSITIVE_OPERATIONS.md).');
lines.push('');

const out = path.join(root, 'docs/security/API_AUTHORIZATION_MATRIX.md');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out} (${rows.length} routes)`);
