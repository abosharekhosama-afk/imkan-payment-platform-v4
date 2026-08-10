# تشغيل Payment Platform V3.4 على Windows بدون Docker

## المتطلبات
- Windows 10/11
- Node.js 20+ (لديك Node 24 مناسب)
- MySQL Server 8.x
- لا تحتاج Redis في وضع الاختبار المحلي؛ `REDIS_URL` يكون فارغًا.

## 1. تثبيت MySQL
ثبّت MySQL Server 8.x. أثناء التثبيت احفظ كلمة مرور root.
بعدها تأكد أن خدمة MySQL تعمل من `services.msc`.

## 2. من PowerShell داخل مجلد المشروع V3.4
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\setup.ps1
```
السكريبت يقوم بتثبيت npm packages، إنشاء `payment_platform`، إنشاء المستخدم `payment` بكلمة مرور `payment`، تشغيل migrations ثم seed.

## 3. التشغيل
الطريقة الأسهل:
```powershell
.\scripts\windows\start-all.ps1
```
أو في نافذتين منفصلتين:
```powershell
.\scripts\windows\start-api.ps1
.\scripts\windows\start-web.ps1
```

- API: http://localhost:3000
- Web: http://localhost:5173
- Health: http://localhost:3000/health/ready

## بيانات الاختبار
- Email: `admin@example.test`
- Password: `ChangeMe!123`

غيّر كلمة المرور قبل أي استخدام حقيقي.

## ملاحظة Redis
Redis غير مطلوب لاختبار Windows الحالي لأن التطبيق يتعامل معه كخدمة اختيارية. إذا أردت اختبار Redis لاحقًا، ثبّت Redis-compatible service على Windows وضع:
`REDIS_URL=redis://127.0.0.1:6379`

## إيقاف التشغيل
أغلق نافذتي PowerShell الخاصة بـ API وWeb.
