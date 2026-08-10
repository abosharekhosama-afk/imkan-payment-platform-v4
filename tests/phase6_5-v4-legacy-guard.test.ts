import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webRoot = path.resolve(__dirname, '../apps/web/src');
const legacyDir = path.join(webRoot, 'legacy');

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === legacyDir) continue;
      walk(full, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Fail if active V4 frontend *calls* Legacy MySQL API paths.
 * Allows mentioning "/api/" + "v1" and constructed string guards in the client.
 */
describe('Phase 6.5 V4 legacy API guard', () => {
  it('active V4 sources do not call Legacy MySQL /v1 APIs', () => {
    const files = walk(webRoot).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
    const offenders: string[] = [];

    // Call-site patterns only (not documentation / constructed guards).
    const callPatterns = [
      /(?:fetch|apiV1|api)\s*\(\s*['"`]\/v1(?:\/|['"`])/,
      /['"`]\/v1\/[a-zA-Z]/,
      /['"`]\/checkout\/public\//,
      /['"`]\/pay\/[^'"`]+['"`]/,
    ];

    for (const file of files) {
      const rel = path.relative(webRoot, file);
      let src = fs.readFileSync(file, 'utf8');
      // Drop block + line comments to avoid doc false positives
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // Valid V4 prefix is fine
      src = src.replace(/\/api\/v1/g, '');
      // Constructed legacy roots used by the ban-guard itself
      src = src.replace(/`\/\$\{'v1'\}`/g, '').replace(/'\/'\s*\+\s*'v1'/g, '').replace(/"\/"\s*\+\s*"v1"/g, '');
      src = src.replace(/'\/checkout\/'\s*\+\s*'public'/g, '').replace(/'\/'\s*\+\s*'pay'\s*\+\s*'\/'/g, '');

      for (const re of callPatterns) {
        if (re.test(src)) offenders.push(`${rel} :: ${re}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('frozen legacy console is preserved and not imported by V4 entry', () => {
    const frozen = path.join(legacyDir, 'main.legacy.tsx');
    expect(fs.existsSync(frozen)).toBe(true);
    const entry = fs.readFileSync(path.join(webRoot, 'main.tsx'), 'utf8');
    expect(entry).not.toMatch(/legacy\/main\.legacy/);
    expect(entry).toMatch(/v4\/app\/App/);
    const content = fs.readFileSync(frozen, 'utf8');
    expect(content).toMatch(/FROZEN LEGACY CONSOLE/);
  });
});
