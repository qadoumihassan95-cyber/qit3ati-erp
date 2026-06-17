# 🚀 نشر قِطَعتي على Render

دليل خطوة-بخطوة لنشر النظام كاملاً (Postgres + NestJS API + React Web) باستخدام **Render Blueprint**.

> ⏱️ **الوقت الإجمالي:** 15–25 دقيقة لأول نشر.  
> 💰 **التكلفة:** مجاناً تماماً على خطة Free (مناسبة للتجربة والـMVP).  
> ⚠️ خطة Render Free فيها قيدان: قاعدة Postgres المجانية تنتهي بعد 90 يوماً (تُحذف)، والـAPI ينام بعد 15 دقيقة خمول ويستيقظ خلال ~30 ثانية. للإنتاج الفعلي رقّ لخطة **Starter** ($7/شهر لكل خدمة).

---

## 📋 المتطلبات قبل البدء

- [ ] حساب على **GitHub** ([إنشاء](https://github.com/signup))
- [ ] حساب على **Render** ([إنشاء](https://dashboard.render.com/register))
- [ ] **Git** مثبّت محلياً (`git --version`)

---

## الخطوة 1 — رفع المشروع إلى GitHub

من داخل مجلد المشروع `qit3ati-erp/`:

```bash
git init
git add .
git commit -m "Initial commit: Qit3ati ERP scaffold + MVP core"
git branch -M main
```

أنشئ مستودعاً جديداً فارغاً على GitHub (سمّه مثلاً `qit3ati-erp`)، **لا تختر** إضافة README/license (لأن لدينا ملفاتنا الخاصة).

ثم اربط واتفع:

```bash
git remote add origin https://github.com/<اسم-حسابك>/qit3ati-erp.git
git push -u origin main
```

> 💡 لو ما عندك GitHub CLI: من واجهة GitHub بعد إنشاء الـrepo تظهر لك تعليمات `git remote add` جاهزة للنسخ.

---

## الخطوة 2 — إنشاء Blueprint على Render

1. ادخل [dashboard.render.com](https://dashboard.render.com)
2. اضغط **New +** ← **Blueprint**
3. اختر **Connect a repository** ← اختر `qit3ati-erp` من قائمة مستودعاتك (قد يطلب منك تفويض Render للوصول لـGitHub)
4. سيقرأ Render ملف `render.yaml` تلقائياً ويعرض لك:
   - 🗄️ قاعدة بيانات: `qit3ati-postgres`
   - 🌐 خدمة: `qit3ati-api` (Node Web Service)
   - 🌐 خدمة: `qit3ati-web` (Static Site)
5. اضغط **Apply** أو **Create new resources**

Render سيبدأ ببناء الخدمات. **الوقت المتوقع:**
- قاعدة البيانات: 2–3 دقائق
- API: 6–10 دقائق (Prisma generate + NestJS build)
- Web: 5–8 دقائق

---

## الخطوة 3 — ربط الخدمات ببعضها (مهم جداً)

Render يعطي كل خدمة عنواناً (URL) بعد أول نشر. تحتاج ربطهم يدوياً مرة واحدة:

### 3.1 — انسخ روابط الخدمات

من لوحة Render، انسخ عنوان كل خدمة:
- **API URL** — مثل: `https://qit3ati-api.onrender.com`
- **Web URL** — مثل: `https://qit3ati-web.onrender.com`

### 3.2 — اضبط `CORS_ORIGIN` على الـAPI

افتح خدمة `qit3ati-api` ← **Environment** ← `CORS_ORIGIN` ← Add ← القيمة:

```
https://qit3ati-web.onrender.com
```

(ضع الـWeb URL الخاص بك بدون شَرطة في النهاية).

اضغط **Save Changes** — الـAPI سيُعاد تشغيله تلقائياً.

### 3.3 — اضبط `VITE_API_BASE_URL` على الـWeb

افتح خدمة `qit3ati-web` ← **Environment** ← `VITE_API_BASE_URL` ← القيمة:

```
https://qit3ati-api.onrender.com/api/v1
```

اضغط **Save Changes**. ⚠️ مهم: Vite يحقن متغيرات البيئة عند **البناء** لا التشغيل. لذلك بعد الحفظ افتح **Manual Deploy** ← **Deploy latest commit** على خدمة الـWeb لإعادة البناء.

---

## الخطوة 4 — إنشاء البيانات الأولية (Seed) لأول مرة

البيانات الأولية (الأدوار، الصلاحيات، الشركة التجريبية، المستخدم المالك، 9 قطع) تُنشأ مرة واحدة عبر **Render Shell**:

1. افتح خدمة `qit3ati-api`
2. التبويب **Shell** (أعلى اليمين)
3. اكتب:

```bash
npm run db:seed
```

ستظهر:
```
🌱  Seeding Qit3ati ERP...
  ✔ roles=7 permissions=20
  ✔ demo tenant + owner (owner@demo.qit3ati.com / Qit3ati@2026)
  ✔ 9 demo parts + stock seeded
✅  Seed complete.
```

---

## الخطوة 5 — تسجيل الدخول وتجربة النظام 🎉

افتح الـWeb URL في المتصفّح:

```
https://qit3ati-web.onrender.com/login
```

ادخل بالبيانات التجريبية:

| الحقل | القيمة |
|---|---|
| البريد | `owner@demo.qit3ati.com` |
| كلمة المرور | `Qit3ati@2026` |
| معرّف الشركة | `demo` |

افتح:
- 📊 **Dashboard** — KPIs لحظية
- 🛒 **POS** — اضغط قطعة لإضافتها للسلة، ثم "نقدي" لإصدار فاتورة فعلية
- 🔧 **Parts** — جدول 9 قطع جاهز للبحث
- ⚙️ **Settings** — غيّر اللون الأساسي وشاهد التطبيق الفوري

---

## 🩺 استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| **Web يقول "Failed to fetch"** | `VITE_API_BASE_URL` خاطئ أو الـAPI نائم — افتح API URL مباشرة في المتصفح بـ`/api/v1/health` لإيقاظه. تحقّق من القيمة وأعد بناء الـWeb. |
| **CORS error في الـConsole** | `CORS_ORIGIN` على الـAPI لا يطابق الـWeb URL بالضبط (تذكّر: بدون شَرطة في النهاية، https لا http). أعد ضبطه. |
| **API يفشل في البناء "Prisma engine"** | غالباً مشكلة شبكة مؤقتة — اضغط **Manual Deploy** ثانية. |
| **API يفشل: "P1001 Can't reach database"** | `DATABASE_URL` لم يُربط — افتح **Environment** على الـAPI وتحقّق أن `DATABASE_URL` يأتي من الـDatabase (Source: Database). |
| **`db:seed` يفشل** | تأكد أن `npm run db:deploy` ركض أولاً (يحدث تلقائياً عند start). |
| **الـDashboard فارغ** | طبيعي قبل إنشاء أول فاتورة — افتح POS وأصدر فاتورة. |
| **API يستيقظ ببطء أول طلب** | خطة Free تنام بعد 15 دقيقة — رقّ لـStarter ($7/شهر) لإلغائه. |

---

## 🔧 تحديثات لاحقة

كل push على فرع `main` في GitHub يُطلق نشراً تلقائياً:

```bash
git add . && git commit -m "feat: add purchases module" && git push
```

Render يلتقط الـcommit ويبني تلقائياً.

لإجراء migration جديدة بعد تعديل `schema.prisma`:

```bash
# محلياً
npm run db:migrate -- --name "add_purchases"
git add . && git commit -m "migrate: add purchases" && git push
# على Render، startCommand يطبّق "prisma migrate deploy" تلقائياً
```

---

## 🌐 ربط دومين مخصص (اختياري)

عندما تكون جاهزاً للإطلاق التجاري:

1. اشترِ دومين (مثلاً `qit3ati.com`)
2. على Render، خدمة الـWeb ← **Custom Domain** ← أضف `app.qit3ati.com`
3. أضف سجل **CNAME** عند مسجّل الدومين يشير إلى الـWeb URL
4. كرّر للـAPI: `api.qit3ati.com`
5. حدّث `VITE_API_BASE_URL` و`CORS_ORIGIN` بالدومينات الجديدة

---

## 💵 تكلفة الإنتاج المتوقّعة (خطة Starter)

| الخدمة | الخطة | السعر/شهر |
|---|---|---|
| Postgres | Starter | $7 |
| API (Web Service) | Starter | $7 |
| Web (Static Site) | Free | $0 |
| Redis (Key-Value) | Starter | $10 (اختياري) |
| **الإجمالي** | | **$14–$24/شهر** |

كافٍ لخدمة عشرات المحلات. للأكبر، رقّ لـStandard أو Pro.

---

## ✅ Checklist النشر

- [ ] رفعت المشروع على GitHub
- [ ] أنشأت Blueprint وانتظرت أول نشر يكتمل
- [ ] ضبطت `CORS_ORIGIN` على الـAPI
- [ ] ضبطت `VITE_API_BASE_URL` على الـWeb وأعدت البناء
- [ ] شغّلت `npm run db:seed` في Shell الـAPI
- [ ] دخلت بـ`owner@demo.qit3ati.com` ورأيت لوحة التحكم 🎉

> 🟢 جاهز للإنتاج. شارك الـWeb URL مع أول محل قطع تجربه.
