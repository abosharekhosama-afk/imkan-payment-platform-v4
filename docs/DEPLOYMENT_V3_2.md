# V3.2 Deployment Notes

## Local without Docker

The API requires MySQL and Redis for the full stack. The included Docker Compose remains the easiest route, but if Docker is unavailable install MySQL 8.x and Redis locally, create the database, then run:

```powershell
npm install
$env:DATABASE_URL="mysql://payment:payment@127.0.0.1:3306/payment_platform"
$env:REDIS_URL="redis://127.0.0.1:6379"
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```powershell
cd apps/web
npm install
npm run dev
```

## Production

1. Configure an actual MySQL service and Redis service.
2. Configure secrets in the deployment platform, never commit `.env` files.
3. Start with `PAYMENT_PROVIDER=sandbox` for integration testing.
4. Switch to `PAYMENT_PROVIDER=paytabs` only after processor onboarding and test credentials are available.
5. Configure the Zoho Books OAuth application and redirect URI.
6. Configure KYC/risk/settlement/payout providers for the jurisdictions where the merchant is approved.
7. Run database migrations before accepting traffic.
8. Run `scripts/e2e-smoke.sh` and provider certification tests.
