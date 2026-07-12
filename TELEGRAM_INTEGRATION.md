# تكامل تيليجرام مع قِطَعتي — Qit3ati Telegram Bot

## ملخّص المعمارية

- **`apps/api/src/modules/telegram/telegram.module.ts`** — الوحدة الكاملة (webhook + خدمة الأوامر + admin REST + audit)
- **Prisma schema** — 3 نماذج جديدة: `TelegramConversation`, `TelegramCommandLog`, `TelegramSubscription` (بالإضافة إلى `TelegramLink` الموجود مسبقاً)
- **`apps/web/src/pages/settings/TelegramSettingsPage.tsx`** — واجهة الإدارة (`/settings/telegram`)
- **Route جديد** — `/settings/telegram` في `App.tsx` + رابط في القائمة الجانبية

## متغيرات البيئة المطلوبة على Render

في لوحة Render → qit3ati-api → Environment، أضِف:

```
TELEGRAM_BOT_TOKEN=<من BotFather>
TELEGRAM_WEBHOOK_SECRET=<نص عشوائي طويل — يتم تمريره كـ ?secret=... في الـwebhook URL>
```

## خطوات النشر (يدوية بعد الـ deploy)

### 1) إنشاء البوت في تيليجرام

1. افتح [@BotFather](https://t.me/BotFather) في تيليجرام
2. أرسل `/newbot`
3. اختر اسماً ظاهراً (مثلاً "قِطَعتي — Qit3ati")
4. اختر اسم مستخدم ينتهي بـ `bot` (مثلاً `@Qit3atiBot`)
5. احفظ الـ**Bot Token** المُعطى

### 2) ضبط المتغيّرات على Render

```
TELEGRAM_BOT_TOKEN=1234567890:ABCDefGhIJKLMNOpqrsTUVwxyz  (المفتاح من BotFather)
TELEGRAM_WEBHOOK_SECRET=<اختر رمزاً طويلاً عشوائياً، مثلاً 32 حرف>
```

### 3) تسجيل الـwebhook (مرة واحدة)

بعد نشر الـAPI، سجّل الـwebhook عبر Terminal:

```bash
# استبدل القيم أولاً
BOT_TOKEN="1234567890:ABC..."
SECRET="<TELEGRAM_WEBHOOK_SECRET>"
API_URL="https://qit3ati-api.onrender.com"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{
       \"url\": \"${API_URL}/telegram/webhook?secret=${SECRET}\",
       \"allowed_updates\": [\"message\", \"callback_query\"]
     }"
```

للتأكد من الحالة:

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

### 4) ربط أول مستخدم

1. سجّل دخول قِطَعتي بصلاحية `users.manage`
2. افتح **الإعدادات ← تكامل تيليجرام** (`/settings/telegram`)
3. اضغط **"إنشاء رمز ربط"** بجانب المستخدم
4. انسخ الرمز المكوّن من 6 أحرف
5. افتح البوت في تيليجرام وأرسل: `/start ABCDEF`
6. سيرد البوت "✅ تم ربط حسابك بنجاح!"

## الأوامر المدعومة

### التقارير
- `مبيعات اليوم` / `today's sales`
- `مبيعات الشهر` / `monthly sales`
- `مصاريف اليوم` / `today's expenses`
- `مصاريف الشهر` / `monthly expenses`
- `المواد القريبة من النفاد` / `low stock`
- `ذمم العملاء` / `customer debts`
- `ذمم الموردين` / `supplier debts`

### المعاملات
- `سجل مصروف بنزين 35 دينار` — إنشاء مصروف مع تأكيد
- `add fuel expense 40 JOD` — نفس الشيء بالإنجليزية
- عند نقص المعلومات، البوت يسأل خطوة بخطوة
- قبل الحفظ يظهر تأكيد بأزرار Confirm/Cancel

### الإدارية
- `/start CODE` — ربط الحساب
- `/help` / `مساعدة` — قائمة الأوامر
- `/menu` — القائمة الرئيسية
- `/cancel` — إلغاء العملية الحالية

## الأمان

- كل طلب webhook يجب أن يحوي `?secret=<TELEGRAM_WEBHOOK_SECRET>` وإلا يُرفض بـ403
- المستخدمون غير المربوطين يحصلون على رسالة "🔒 حسابك غير مربوط"
- كل عملية تُسجَّل في `TelegramCommandLog` مع intent، النص، النتيجة، والـentity المرتبطة
- الـtenantId والـuserId يتم حقنهما تلقائياً — البوت لا يستطيع تجاوز صلاحيات ERP
- الـsecret + الـbot token يُخزَّنان في env vars ولا يظهران في الـlogs

## استكشاف الأخطاء

```bash
# اختبار webhook (يعيد نفس الاستجابة كما لو أرسل تيليجرام update)
curl -X POST "https://qit3ati-api.onrender.com/telegram/webhook?secret=YOUR_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":123,"type":"private"},"date":1,"text":"/help"}}'
```

## دليل المستخدم النهائي (عربي مختصر)

**كيف أستعمل بوت قِطَعتي؟**

1. اطلب من الإدارة رمز الربط
2. افتح البوت وأرسل `/start CODE`
3. بعدها اكتب أوامرك بشكل طبيعي:
   - "كم مبيعات اليوم؟"
   - "سجل مصروف بنزين 35 دينار"
   - "المواد القريبة من النفاد"
4. عند إنشاء مصروف، سيسأل البوت عن أي معلومة ناقصة، ثم يعرض تأكيداً قبل الحفظ

**البوت يفهم:**
- العربية الفصحى والعامية الأردنية
- English
- الأرقام + العملة + الفئات (بنزين، إيجار، راتب، إلخ)
