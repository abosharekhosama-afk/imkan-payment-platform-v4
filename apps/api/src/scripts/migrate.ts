import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const url = new URL(config.databaseUrl);

const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );

  const count = Number((rows as Array<{ count: number | string }>)[0]?.count || 0);
  return count > 0;
}

async function runStatement(statement: string) {
  const addColumnMatch = statement.match(/ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD COLUMN\s+`?([a-zA-Z0-9_]+)`?/i);

  if (addColumnMatch) {
    const tableName = addColumnMatch[1];
    const columnName = addColumnMatch[2];

    if (await columnExists(tableName, columnName)) {
      console.log(`Skipping existing column ${tableName}.${columnName}`);
      return;
    }
  }

  await conn.query(statement);
}

try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_schema_migration (migration)
    )
  `);

  const dir = path.resolve(process.cwd(), '../../database/migrations');

  const files = (await fs.readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const [rows] = await conn.query(
    'SELECT migration FROM schema_migrations ORDER BY migration'
  );

  const applied = new Set(
    (rows as Array<{ migration: string }>).map((row) => row.migration)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`Applying ${file}`);

    const sql = await fs.readFile(
      path.join(dir, file),
      'utf8'
    );

    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    await conn.beginTransaction();

    try {
      for (const statement of statements) {
        await runStatement(statement);
      }

      await conn.query(
        'INSERT INTO schema_migrations (migration) VALUES (?)',
        [file]
      );

      await conn.commit();

      console.log(`Applied ${file}`);
    } catch (error) {
      await conn.rollback();

      console.error(`Migration failed: ${file}`);
      throw error;
    }
  }

  console.log('Database migrations completed successfully.');
} finally {
  await conn.end();
}