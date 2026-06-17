# 🚗 قِطَعتي — AutoParts Cloud ERP

نظام SaaS متعدد المستأجرين لإدارة محلات وشركات قطع السيارات في الأردن.  
هذا الـrepo هو التنفيذ الفعلي لمنتج صُمِّم في وثيقة `01_نظام_قطع_السيارات_الوثيقة_الشاملة.md` ومخطط `02_database_schema.sql`.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

> 📘 **للنشر على Render** بنقرة واحدة: راجع **[DEPLOY.md](DEPLOY.md)** — الدليل خطوة-بخطوة بالعربية.

---

## 🏗️ الـStack

| الطبقة | التقنية |
|---|---|
| Backend API | **NestJS 10** + TypeScript |
| ORM / DB | **Prisma 5** + **PostgreSQL 16** |
| Frontend | **React 18** + **Vite** + **TypeScript** + **Tailwind CSS** (RTL) |
| Auth | JWT (HS256) + RBAC بصلاحيات دقيقة |
| Cache / Queue | Redis 7 |
| Storage | S3-compatible (MinIO محلياً) |
| Telegram | Telegraf (placeholder — M5) |

---

## 📁 بنية المشروع (Monorepo)

```
qit3ati-erp/
├── apps/
│   ├── api/       ← NestJS backend (Auth, Tenants, Parts, Stock, Sales/POS, Customers, Suppliers, Settings…)
│   ├── web/       ← React + Vite frontend (Dashboard, POS, Parts, Stock, Settings)
│   └── bot/       ← Telegraf Telegram bot (placeholder)
├── packages/
│   └── shared/    ← Shared TypeScript types
├── prisma/
│   ├── schema.prisma   ← 57 models, 15 enums
│   └── seed.ts         ← System roles, permissions, demo tenant + parts
├── docker-compose.yml  ← Postgres + Redis + MinIO
└── .env.example
```

---

## 🚀 التشغيل المحلي (Local Dev)

### 1) المتطلبات
- **Node.js 20+** و **npm 10+**
- **Docker** (للـPostgres / Redis / MinIO) أو Postgres مثبّت محلياً
- ميناء فارغ: `3001` (API)، `5173` (Web)، `5432` (PG)، `6379` (Redis)

### 2) الإعدادات
```bash
cp .env.example .env
# عدّل JWT_SECRET و DATABASE_URL إذا لزم
```

### 3) قواعد البيانات والإمدادات (Postgres + Redis + MinIO)
```bash
docker compose up -d
```

### 4) تثبيت المكتبات
```bash
npm install
```

### 5) توليد Prisma client + تطبيق المخططات + البيانات الأولية
```bash
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

> الـseed ينشئ:
> - **7 أدوار نظامية** + **20 صلاحية**
> - **مستأجراً تجريبياً** (slug: `demo`) باسم "محل قطعتي التجريبي"
> - فرعاً رئيسياً + مستودعاً + **مستخدم مالك**
> - **9 قطع** عينة مع مخزون مبدئي

### 6) تشغيل الخوادم
في طرفيتين مختلفتين:
```bash
npm run dev:api    # http://localhost:3001/api/v1/health
npm run dev:web    # http://localhost:5173
```

### 7) دخول التجربة
- **الموقع:** http://localhost:5173/login  
- **البريد:** `owner@demo.qit3ati.com`  
- **كلمة المرور:** `Qit3ati@2026`  
- **معرّف الشركة:** `demo`

---

## 🧭 الوحدات المنفّذة في هذه المرحلة (MVP Core)

| المسار | الوحدة | الوصف |
|---|---|---|
| `GET /health` | Health | فحص النظام وقاعدة البيانات |
| `POST /auth/login` | Auth | تسجيل دخول مع JWT |
| `GET /auth/me` | Auth | بيانات المستخدم الحالي |
| `GET /tenants/dashboard` | Tenants | KPIs لوحة التحكم |
| `GET /branches` | Branches | الفروع |
| `GET /parts` | Parts | بحث ذكي بـSKU/OEM/Part Number/Barcode/أرقام بديلة |
| `GET /parts/:id` | Parts | بطاقة قطعة كاملة (توافق، صور، بدائل) |
| `POST/PUT/DELETE /parts/:id` | Parts | إدارة الكتالوج |
| `GET /stock`, `/stock/low` | Stock | رؤية المخزون وتنبيهات النفاد |
| `POST /sales` | Sales (POS) | إنشاء فاتورة + خصم مخزون + ضريبة 16% + قيد ذمم آجلة (atomic) |
| `GET /sales` | Sales | قائمة الفواتير |
| `GET /customers`, `POST`, `PUT` | Customers | إدارة العملاء |
| `GET /suppliers`, `POST`, `PUT` | Suppliers | إدارة الموردين |
| `GET /settings`, `PUT` | Settings | هوية الشركة White-Label |
| `GET /users` | Users | إدارة المستخدمين (Owner only) |

### الواجهة (Web)
- 🔐 **Login** بشعار وألوان قابلة للتخصيص
- 📊 **Dashboard** — KPIs لحظية + تنبيهات النفاد + الذمم
- 🛒 **POS** — بيع سريع تفاعلي مع حساب ضريبة تلقائي وحفظ في الـAPI
- 🔧 **Parts** — جدول الكتالوج مع بحث ذكي
- 📦 **Stock** — مخزون متعدد الفروع وحالات
- ⚙️ **Settings** — تخصيص White-Label (لون، شعار، ضريبة، JoFotara)

---

## 🔐 نموذج الأمان

- **JWT** بصلاحية افتراضية ساعة (قابل للضبط عبر `JWT_ACCESS_TTL`)
- **PermissionsGuard** عالمي يطبّق `@Permissions('code.x')` على كل endpoint
- **TenantMiddleware** يستخرج `tenantId` من JWT/Header
- **Prisma extension** يحقن `tenantId` تلقائياً في كل query (عزل صارم)
- **Soft delete** على الكيانات الحرجة (parts, customers, suppliers…)
- **bcrypt** لكلمات المرور
- **Helmet** + **CORS** + **Rate limiting** عبر `@nestjs/throttler`

---

## 🛣️ الـRoadmap (ما لم يُنفّذ بعد)

| المرحلة | الوحدات |
|---|---|
| **M2** | إدارة المشتريات (Purchase Invoices + Returns) + التحويلات بين الفروع |
| **M3** | المحاسبة الكاملة (قيود يدوية، ميزان مراجعة، P&L، تدفّق نقدي) |
| **M4** | المرتجعات (مبيعات/شراء) + التالف + الكفالات والمطالبات |
| **M5** | بوت تيليجرام (`/sale, /expense, /stock, /report, /doc...`) + Webhook + Worker |
| **M6** | إدارة الموظفين (الدوام، المهام، العمولات، الرواتب) |
| **M7** | أرشيف الوثائق + تنبيهات الانتهاء + رفع لـS3 |
| **M8** | تكامل **JoFotara** (Phase 2) + بوابة الدفع + طابعة حرارية + قارئ باركود |
| **M9** | تقارير متقدمة + معدّل دوران المخزون + القطع الراكدة + لوحة تحليلات |

---

## 🧪 الاختبارات

- بنية Jest جاهزة في `apps/api`. أضف اختباراتك تحت `*.spec.ts`.
- `apps/web` يمكن إضافة Vitest + Testing Library بسهولة لاحقاً.

```bash
npm --workspace apps/api run test
```

---

## 📜 الترخيص

ملكية خاصة — كل الحقوق محفوظة.
