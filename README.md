# IMKAN One — Payment Platform V4

**IMKAN One** منصة مدفوعات متعددة الشركات قيد التطوير. الإصدار الحالي: **4.0.0**.

ليست إطلاقاً إنتاجياً نهائياً. العرض الحالي للتجربة والمراجعة.

**عرض حي:** [https://imkan-payments-web.onrender.com/](https://imkan-payments-web.onrender.com/)

أول فتح بعد خمول Render قد يستغرق عشرات الثواني.

---

## ماذا تقدم المنصة

- روابط دفع وجلسات دفع واسترداد، مع عزل كل شركة عن الأخرى
- كونسول عربي/إنجليزي (RTL) للتاجر ولإدارة المنصة (حسابان منفصلان)
- تأهيل النشاط (KYB) وحسابات بنكية ومراجعة من المنصة
- محفظة، أرصدة، تسويات، نزاعات، ومخاطر
- توجيه مزود دفع (Stripe في وضع الاختبار حالياً) وويب هوك وارد/صادر
- صلاحيات RBAC، سجلات تدقيق وأمان، ومصادقة MFA

التقنية: واجهة `apps/web` (React/Vite) — API `apps/api` (Fastify، `/api/v1`) — PostgreSQL مصدر الحقيقة.

---

## ما تم إنجازه

- كونسول IMKAN One ومسارات التاجر مقابل إدارة المنصة
- نواة المدفوعات، الروابط، الاسترداد، والـ Ledger على PostgreSQL
- محول Stripe (اختبار) مع ويب هوك وتوثيق التوقيع
- KYB، المستندات، مراجعة البنوك من المنصة
- نشر تجريبي على Render (`imkan-payments-api` + `imkan-payments-web`)
- اختبارات عقد في `tests/` ووثائق مزودين للمحللين

بيئة العرض: Stripe **Test**، خطة Render المجانية. ليست بطاقات حية.

---

## ما ننتظره لإكمال النظام

النظام **قيد التطوير**. لإغلاق المسار التجاري يلزم عمل تحليلي وتشغيلي على المزودين والاتفاقيات:

| المجال | الحالة |
|--------|--------|
| Stripe Live | غير مفعّل (`STRIPE_ALLOW_LIVE` مغلق) |
| PayTabs / الخليج | محول جزئي — يحتاج شهادات وبيانات تشغيل |
| مزودو فلسطين (بنك فلسطين، العربي، جوّال باي، PalPay) | مكتشفة — **لا يوجد محول V4 بعد** |
| التسوية المباشرة للتاجر | معمارية موثّقة — غير مكتملة تشغيلياً |
| نطاق مخصص، نسخ احتياطي إنتاج، إغلاق PCI | بوابات إنتاج مفتوحة |

### وثائق API والمزودين (للمحلل)

| الوثيقة | الغرض |
|---------|--------|
| [docs/implementation/PAYMENT_API.md](./docs/implementation/PAYMENT_API.md) | عقود HTTP للمدفوعات والروابط والدفع العام |
| [docs/providers/PROVIDER-READINESS-MATRIX.md](./docs/providers/PROVIDER-READINESS-MATRIX.md) | جاهزية كل مزود من الدليل في المستودع |
| [docs/providers/STRIPE_V4_ADAPTER.md](./docs/providers/STRIPE_V4_ADAPTER.md) | Stripe: متغيرات البيئة ومسار `POST /api/v1/webhooks/providers/stripe` |
| [docs/providers/PROVIDER_CHECKLIST.md](./docs/providers/PROVIDER_CHECKLIST.md) | قائمة تفعيل مزود جديد |
| [docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md](./docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md) | PayTabs sandbox |
| [docs/providers/GCC_PAYTABS_ACTIVATION.md](./docs/providers/GCC_PAYTABS_ACTIVATION.md) | مسار الخليج |
| [docs/providers/palestine/](./docs/providers/palestine/) | بحث وتواصل مزودي فلسطين |

أسماء متغيرات البيئة (بدون أسرار) في `.env.example`. القيم الحقيقية تُوضع محلياً في `.env` (غير مرفوع) أو في لوحة Render.

---

## تسجيل الدخول وMFA

بعد البريد وكلمة المرور تطلب المنصة **رمزاً من 6 أرقام** (TOTP).

1. يُرسل إلى **البريد الذي أُنشئ به الحساب** كود سري طويل (سر المصادقة، ليس الرمز السداسي نفسه).
2. أضف هذا الكود في تطبيق مصادقة:
   - Google Authenticator، أو
   - إضافة المصادقة في المتصفح (Authenticator) التي تولّد رمزاً يتغير كل نحو 30–60 ثانية.
3. أدخل في شاشة الدخول الرمز السداسي **الحالي** الظاهر في التطبيق.

بدون هذه الخطوة لا يكتمل الدخول ولا الإجراءات الحساسة (step-up).

حساب شركة جديدة: `/signup`. حساب الإدارة لا يرى إعدادات المنظمة والدفع وويب هوك الخاصة بالشركات.

---

## التشغيل المحلي

المتطلبات: Node.js 20+ وPostgreSQL 16 (محلي أو Neon). Redis اختياري محلياً.

```powershell
copy .env.example .env
# املأ DATABASE_URL_PG في .env — لا ترفع ملف .env
npm install
npm run db:migrate:pg
npm run seed:platform-owner
npm run seed:stripe-routes
npm run dev:api
npm run dev:web
```

أو بعد وجود `.env`: `.\scripts\windows\start-all.ps1`

- API: http://localhost:3000 — `/api/v1/health/ready`
- واجهة: http://localhost:5173

`.\scripts\windows\setup.ps1` يهيئ MySQL للمسار القديم فقط، وليس مسار V4 المعروض على Render.

تفاصيل ويندوز: [WINDOWS-LOCAL.md](./WINDOWS-LOCAL.md)  
النشر: [docs/ops/RENDER_DEPLOY.md](./docs/ops/RENDER_DEPLOY.md)

```powershell
npm test
```

---

## المستودع

يُبقى في Git: `apps/`، `tests/`، `scripts/`، ترحيلات Postgres، `render.yaml`، `.env.example`، `.gitignore`.

لا يُرسل: `.env` الحقيقي، مفاتيح Stripe/Brevo/Neon، `node_modules`، `dist`.
