# التشغيل المحلي على Windows — IMKAN One V4

المسار الأساسي هو **PostgreSQL** وواجهة V4. لا تعتمد على MySQL إلا إذا كنت تختبر المسار القديم صراحة.

## المتطلبات

- Windows 10/11
- Node.js 20+
- PostgreSQL 16 (محلي أو اتصال Neon في `DATABASE_URL_PG`)

Redis غير مطلوب للاختبار المحلي الخفيف؛ اترك `REDIS_URL` فارغاً في `.env` إن لزم.

## الإعداد (V4)

من جذر المشروع:

```powershell
copy .env.example .env
```

عدّل `DATABASE_URL_PG` ليشير إلى قاعدتك. ثم:

```powershell
npm install
npm run db:migrate:pg
npm run seed:platform-owner
npm run seed:stripe-routes
```

## التشغيل

```powershell
.\scripts\windows\start-all.ps1
```

أو نافذتين:

```powershell
.\scripts\windows\start-api.ps1
.\scripts\windows\start-web.ps1
```

- API: http://localhost:3000
- Web: http://localhost:5173
- صحة الخدمة: http://localhost:3000/api/v1/health/ready

## تسجيل الدخول

بعد التشغيل استخدم حساباً موجوداً أو `/signup`. الدخول يتطلب MFA: كود سري طويل يصل إلى بريد الحساب يُضاف إلى Google Authenticator أو إضافة المصادقة في المتصفح، ثم يُدخل الرمز السداسي الذي يتغير دورياً. التفاصيل في [README.md](./README.md).

شركة جديدة: `/signup`.

## مسار MySQL القديم (اختياري)

`.\scripts\windows\setup.ps1` ينشئ قاعدة MySQL `payment_platform` ويشغّل ترحيلات V1. ذلك **ليس** نظام IMKAN One المعروض على Render. أبقِ `ENABLE_LEGACY_V1` كما في `.env.example` فقط إذا احتجت ذلك المسار.

## إيقاف التشغيل

أغلق نوافذ PowerShell الخاصة بالـ API والواجهة.
