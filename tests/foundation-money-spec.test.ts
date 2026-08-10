import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('DEC-001 money specification', () => {
  it('documents unified NUMERIC(30,0) minor units + currency', () => {
    const file = path.resolve('docs/database/MONEY_TYPES.md');
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('NUMERIC(30,0)');
    expect(text).toContain('CHAR(3)');
    expect(text).toMatch(/minor units/i);
    expect(text).not.toMatch(/\bFLOAT\b.*allowed/i);
  });

  it('does not introduce float money columns in postgres foundation migrations', () => {
    const dir = path.resolve('database/migrations/postgres');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8').toUpperCase();
      expect(sql.includes('DOUBLE PRECISION')).toBe(false);
      expect(sql.includes(' REAL')).toBe(false);
      expect(sql.includes('FLOAT')).toBe(false);
    }
  });
});
