# Database Specification — Money Types (DEC-001)

**Status:** Approved baseline  
**Decision:** `docs/decisions/OPEN_DECISIONS.md` → DEC-001  

## Unified storage

| Rule | Specification |
|---|---|
| Column type | `NUMERIC(30,0)` NOT NULL (unless explicitly nullable in table spec) |
| Unit | **Minor units** (integer count of smallest currency unit) |
| Currency | `CHAR(3)` NOT NULL — ISO 4217, always stored with the amount |
| Forbidden | `REAL`, `DOUBLE PRECISION`, `FLOAT`, JS `number` for monetary math |
| Application | Use string/`bigint`/decimal libraries; persist via parameterized SQL |
| Transactions | All financial mutations inside PostgreSQL transactions |

## API representation (v1)

```json
{ "amount": "1050", "currency": "SAR" }
```

`amount` is a decimal string of minor units (no float). Display formatting is a presentation concern; storage remains minor units.

## Out of scope here

Fee rates, FX conversion, and rounding modes → **DEC-008 OPEN**.
