#!/usr/bin/env bash
set -euo pipefail
API="${API_URL:-http://localhost:3000}"
TENANT="${TENANT_ID:-550e8400-e29b-41d4-a716-446655440000}"
EMAIL="${ADMIN_EMAIL:-admin@example.test}"
PASSWORD="${ADMIN_PASSWORD:-ChangeMe!123}"
echo "[1/6] health"; curl -fsS "$API/health" >/dev/null
echo "[2/6] readiness"; curl -fsS "$API/health/ready" >/dev/null
echo "[3/6] login"; TOKEN=$(curl -fsS -X POST "$API/v1/auth/login" -H 'content-type: application/json' -d "{\"tenant_id\":\"$TENANT\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{const j=JSON.parse(x);if(j.mfa_required){console.error("MFA enabled: run interactive MFA test");process.exit(2)}console.log(j.access_token||j.data?.access_token)})')
echo "[4/6] auth/me"; curl -fsS "$API/v1/auth/me" -H "authorization: Bearer $TOKEN" >/dev/null
echo "[5/6] regional config"; curl -fsS "$API/v1/regional-supported" >/dev/null
echo "[6/8] create customer"; CUSTOMER=$(curl -fsS -X POST "$API/v1/customers" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"merchant_id":"550e8400-e29b-41d4-a716-446655440001","name":"Smoke Customer","email":"smoke@example.test"}' | node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{const j=JSON.parse(x);if(!j.data?.id)process.exit(1);console.log(j.data.id)})')
echo "[7/8] create payment link"; curl -fsS -X POST "$API/v1/payment-links" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"merchant_id":"550e8400-e29b-41d4-a716-446655440001","amount_minor":"1000","currency":"USD","reference":"SMOKE-001","description":"Smoke test","customer_email":"smoke@example.test"}' >/dev/null
echo "[8/8] logout"; curl -fsS -X POST "$API/v1/auth/logout" -H "authorization: Bearer $TOKEN" >/dev/null
echo "Smoke test passed."
