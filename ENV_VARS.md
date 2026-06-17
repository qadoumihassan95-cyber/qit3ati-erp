# 🔐 متغيرات البيئة (Environment Variables)

قائمة كاملة بكل المتغيرات التي يقرأها النظام، أين تُستخدم، وأيها مطلوب فعلاً عند النشر على Render.

> ⚠️ **لا تضع أي قيم سرية في الكود أبداً.** الـ`render.yaml` يحدّد المتغيرات بأسمائها فقط — القيم تأتي إما من Render تلقائياً (مثل `DATABASE_URL` من قاعدة البيانات و`JWT_SECRET` المولّد عشوائياً)، وإما تدخلها يدوياً في لوحة Render.

---

## 🟢 مطلوبة دائماً (Required)

| المتغير | الخدمة | المصدر على Render | الوصف |
|---|---|---|---|
| `DATABASE_URL` | API | **تلقائي** من قاعدة `qit3ati-postgres` | عنوان اتصال PostgreSQL |
| `JWT_SECRET` | API | **مولّد تلقائياً** عبر `generateValue: true` | مفتاح توقيع JWT |
| `NODE_ENV` | API | ثابت `production` | يفعّل تحسينات الإنتاج |
| `API_PREFIX` | API | ثابت `api/v1` | بادئة كل الـendpoints |
| `CORS_ORIGIN` | API | **تدخله يدوياً** | عنوان الـWeb الكامل بدون شَرطة نهائية، مثل `https://qit3ati-web.onrender.com` |
| `VITE_API_BASE_URL` | Web | **تدخله يدوياً** | عنوان الـAPI الكامل + البادئة، مثل `https://qit3ati-api.onrender.com/api/v1` |

> 🔄 `PORT` يحقنه Render تلقائياً للـAPI — الكود يقرأه قبل `API_PORT`.

---

## 🟡 افتراضية محلية (Defaults)

| المتغير | القيمة الافتراضية | يمكنك تجاوزها على Render |
|---|---|---|
| `JWT_ACCESS_TTL` | `3600` (ساعة بالثواني) | نعم |
| `JWT_REFRESH_TTL` | `2592000` (30 يوم) | نعم |
| `DEFAULT_LOCALE` | `ar` | نعم |
| `DEFAULT_TAX_RATE` | `16.0` | نعم |
| `DEFAULT_CURRENCY` | `JOD` | نعم |

---

## 🔵 اختيارية (للتكاملات اللاحقة)

اضبطها فقط عندما تحتاج الميزة المعنية:

| المتغير | الخدمة | تستخدم لـ |
|---|---|---|
| `REDIS_URL` | API | كاش + طوابير (مرحلة M5+) |
| `TELEGRAM_BOT_TOKEN` | API + Bot | بوت تيليجرام (M5) |
| `TELEGRAM_WEBHOOK_URL` | Bot | عنوان Webhook العام |
| `JOFOTARA_API_URL` | API | فوترة إلكترونية أردنية (M8) |
| `JOFOTARA_CLIENT_ID` | API | اعتماد JoFotara |
| `JOFOTARA_SECRET_KEY` | API | مفتاح JoFotara |
| `S3_ENDPOINT` | API | رفع صور القطع والوثائق (M7) |
| `S3_ACCESS_KEY` | API | اعتماد S3 |
| `S3_SECRET_KEY` | API | اعتماد S3 |
| `S3_BUCKET` | API | اسم الباكت |
| `S3_REGION` | API | منطقة S3 |

---

## 🛠️ على Render تحديداً

كل المتغيرات معرَّفة في `render.yaml`:
- المُسمَّاة `sync: false` تظهر بـ"value not set" بعد إنشاء الـBlueprint — يجب أن تدخلها قبل أول تشغيل ناجح
- المُسمَّاة `generateValue: true` يولّدها Render عشوائياً وتبقى مخفية (آمنة)
- المُسمَّاة `fromDatabase` تُربط تلقائياً بقاعدة البيانات

---

## 🚨 ما يجب أن لا يدخل أبداً في الـRepo

ضع هذه في `.env` المحلي فقط (مُستثنى في `.gitignore`)، ولا ترفعها على GitHub:
- `JWT_SECRET` (المحلي)
- `DATABASE_URL` (المحلي إذا فيه كلمة مرور حقيقية)
- `TELEGRAM_BOT_TOKEN`
- `JOFOTARA_SECRET_KEY`
- `S3_SECRET_KEY`

`.env.example` آمن لأنه لا يحوي قيماً حقيقية.
