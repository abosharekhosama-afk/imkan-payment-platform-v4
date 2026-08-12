# النشر على Render (مجاني / Free tier)

دليل نشر **Payment Platform V4** على [Render](https://render.com) مع:
- **API** — Web Service (Node)
- **Web** — Static Site
- **PostgreSQL** — [Neon](https://neon.tech) (مجاني)
- **Redis** — [Upstash](https://upstash.com) (مجاني)

> Outbox worker (بريد + webhooks) يعمل **داخل عملية API** — لا حاجة لـ worker منفصل.

---

## 1) قبل Render — حسابات مجانية

### أ) Neon (PostgreSQL)

1. أنشئ مشروعاً → Database → انسخ **Connection string**  
   مثال: `postgres://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

### ب) Upstash (Redis)

1. أنشئ Redis database → انسخ **Redis URL** (يبدأ بـ `rediss://` — ليس أمر `redis-cli`)
   مثال: `rediss://default:xxx@sought-bug-170112.upstash.io:6379`

### ج) SMTP (اختياري للبداية — مطلوب للدعوات)

- [Brevo](https://www.brevo.com) — 300 رسالة/يوم مجاناً  
- أو SendGrid — 100 رسالة/يوم

### د) GitHub

1. ارفع المشروع إلى مستودع GitHub (عام أو خاص)

---

## 2) النشر عبر Blueprint

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. اربط مستودع GitHub
3. Render يقرأ `render.yaml` من الجذر
4. أنشئ الخدمتين: `imkan-payments-api` + `imkan-payments-web`

> **Free tier:** `preDeployCommand` غير مدعوم — `npm run db:migrate:pg` يعمل داخل `buildCommand` عند كل deploy (يحتاج `DATABASE_URL_PG` في env).

---

## 2b) التحديث التلقائي عند Push

بعد ربط GitHub:

```text
git push origin main  →  Render يبني وينشر API + Web تلقائياً
```

تأكد في كل خدمة: **Settings → Build & Deploy → Auto-Deploy = Yes** و **Branch = main**.

عند إضافة migrations SQL جديدة في المستقبل، `db:migrate:pg` في build يطبّقها تلقائياً على Neon.

---

## 3) متغيرات البيئة (API)

في **imkan-payments-api** → **Environment**:

| المتغير | القيمة |
|---------|--------|
| `DATABASE_URL_PG` | Connection string من Neon |
| `REDIS_URL` | **Redis URL** من Upstash (`rediss://...` — لا تلصق `redis-cli --tls -u`) |
| `APP_PUBLIC_URL` | `https://imkan-payments-web.onrender.com` (URL الواجهة) |
| `CORS_ORIGIN` | نفس URL الواجهة |
| `SMTP_HOST` | مثال `smtp-relay.brevo.com` |
| `SMTP_USER` / `SMTP_PASS` | من Brevo |
| `EMAIL_FROM` | بريد مرسل موثوق |
| `STRIPE_TEST_SECRET_KEY` | من Stripe Dashboard |
| `STRIPE_TEST_PUBLISHABLE_KEY` | |
| `STRIPE_TEST_WEBHOOK_SECRET` | بعد إنشاء webhook |
| `STRIPE_SUCCESS_URL` | `https://YOUR-WEB.onrender.com/checkout/return?status=success` |
| `STRIPE_CANCEL_URL` | `https://YOUR-WEB.onrender.com/checkout/return?status=cancel` |
| `PLATFORM_KYB_NOTIFY_EMAIL` | بريدك لمراجع KYB |

المتغيرات المُولَّدة تلقائياً (`WEBHOOK_SIGNING_SECRET`, …) تُنشأ من Blueprint.

---

## 4) متغيرات البيئة (Web)

في **imkan-payments-web** → **Environment**:

| المتغير | القيمة |
|---------|--------|
| `VITE_API_URL` | `https://imkan-payments-api.onrender.com` (URL الـ API بدون `/` أخير) |
| `VITE_SESSION_TRANSPORT` | `cookie` |

> بعد تغيير `VITE_*` يجب **إعادة Deploy** للواجهة.

---

## 5) Seed (مرة واحدة — إن لم تفعل محلياً)

إذا سبق وشغّلت على Neon محلياً:

```powershell
npm run seed:platform-owner
npm run seed:stripe-routes
```

**لا حاجة** إعادة seed على Render.

Otherwise — **Render Shell** (API service → Shell) أو محلياً مع `DATABASE_URL_PG`:

```bash
npm run seed:platform-owner
npm run seed:stripe-routes
```

---

## 6) Stripe Webhook (Test)

في Stripe Dashboard → Webhooks:

- **URL:** `https://imkan-payments-api.onrender.com/api/v1/webhooks/providers/stripe`
- **Events:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- انسخ **Signing secret** → `STRIPE_TEST_WEBHOOK_SECRET` على Render → Redeploy API

---

## 7) التحقق

```text
GET https://imkan-payments-api.onrender.com/api/v1/health/ready
→ 200 + postgres + redis
```

افتح الواجهة → سجّل دخول → Platform Admin → أرسل دعوة (يصل البريد إذا SMTP مضبوط).

---

## 8) قيود Free tier

| القيد | التأثير |
|-------|---------|
| API ينام بعد ~15 دقيقة | أول طلب بطيء |
| 750 ساعة/شهر | كافٍ لمشروع واحد |
| Neon + Upstash limits | كافٍ للتجربة |

---

## 9) الترقية لاحقاً

- `STRIPE_ENV=live` + `STRIPE_ALLOW_LIVE=true` + مفاتيح Live
- `plan: starter` في `render.yaml` لإزالة النوم
- نطاق مخصص + Custom Domain على Render

---

## أوامر محلية مفيدة

```bash
npm run build:render:api
npm run build:render:web
npm run ops:production-preflight
```

---

## Related

- [PRODUCTION_DEPLOY_RUNBOOK.md](./PRODUCTION_DEPLOY_RUNBOOK.md)
- [PAYMENT_PRODUCTION_CLOSURE.md](./PAYMENT_PRODUCTION_CLOSURE.md)
