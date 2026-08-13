# رفع مستندات KYB — دليل سريع (عربي)

## المشكلة

قد يظهر المستند **UPLOADED** لكن عمود **الملف** يقول **«لم يُرفع الملف بعد»** — يعني تسجيل المستند نجح لكن **رفع الملف الفعلي** لم يكتمل.

## الحل (3 خطوات)

### 1) تأكد أن Render نشر آخر نسخة

- **imkan-payments-api** و **imkan-payments-web** من آخر commit على GitHub
- Manual Deploy → Clear build cache if needed

### 2) أكمل رفع الملف

1. سجّل **خروج** ثم **دخول** من جديد
2. اذهب **التاجر → المستندات** (`/merchant/documents`)
3. في جدول المستندات، على الصف الذي يقول **«لم يُرفع الملف بعد»**:
   - اضغط **«إكمال الرفع»**
   - اختر PDF أو صورة (شهادة السجل التجاري)
4. انتظر حتى يصبح عمود **الملف** = **نعم**

إذا ظهرت **رسالة حمراء** — انسخها وشاركها مع الدعم.

### 3) أرسل KYB

1. **التاجر → مراجعة KYB** (`/merchant/kyb`)
2. يجب أن تصبح **6/6**
3. **إرسال للمراجعة**

---

## متغيرات Render المطلوبة

| الخدمة | المتغير | القيمة |
|--------|---------|--------|
| API | `CORS_ORIGIN` | رابط الويب، مثل `https://imkan-payments-web.onrender.com` |
| API | `SESSION_COOKIE_SAMESITE` | `none` |
| Web | `VITE_API_URL` | رابط الـ API، مثل `https://imkan-payments-api.onrender.com` |
| Web | `VITE_SESSION_TRANSPORT` | `cookie` |

---

## للاختبار السريع فقط (بدون تخزين ملفات)

على **API** فقط:

```
DOCUMENT_STORAGE_BACKEND=metadata
```

ثم أعد النشر. **ليس للإنتاج الحقيقي.**

---

## تحقق SQL (Neon)

```sql
SELECT file_name, sha256 IS NOT NULL AS file_ok, created_at
FROM documents
ORDER BY created_at DESC
LIMIT 5;
```

`file_ok = t` يعني الرفع نجح.
