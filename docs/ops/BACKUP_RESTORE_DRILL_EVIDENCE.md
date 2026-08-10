# Backup / Restore Drill Evidence (P15.2)

**Generated:** 2026-08-10T12:22:50.921Z  
**Result:** **PASS**

## Procedure

1. Start embedded PostgreSQL instance A
2. Apply migrations (`npm run db:migrate:pg`)
3. Insert marker organization row
4. Run `node scripts/ops/pg-backup.mjs`
5. Start embedded PostgreSQL instance B + migrations
6. Run `node scripts/ops/pg-restore.mjs --file <backup>`
7. Verify marker organization exists on B

## Evidence

```json
{
  "started_at": "2026-08-10T12:19:05.640Z",
  "finished_at": "2026-08-10T12:22:50.921Z",
  "marker": "drill-1786364410764",
  "backup_file": "E:\\projects\\New folder\\Payment-Platform-V3.4.1-Windows-Local-Ready\\.tmp\\pg-backup-drill\\imkan_payments_2026-08-10T12-20-11-078Z.sql",
  "backup_bytes": 157613,
  "source_org_count": 1,
  "restored_org_count": 1,
  "source_migrations": 34,
  "restored_migrations": 34,
  "result": "PASS"
}
```

## RPO / RTO targets (operational)

| Metric | Target | Notes |
|---|---|---|
| RPO | ≤ 24h (daily backups); ≤ 1h if WAL archiving enabled | Logical dump baseline in P15.2 |
| RTO | ≤ 4h for single-region restore drill | Measured via this script locally |

P15.2 establishes the procedure and a **successful local drill**. Production WAL archiving / offsite retention remain ops deployment tasks (not claimed complete for Production Gate PASS).
