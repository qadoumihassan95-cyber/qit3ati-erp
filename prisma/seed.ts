/**
 * Qit3ati ERP — Database seed
 *   - System roles & permissions
 *   - One demo tenant (with settings, main branch, owner user)
 *   - A small parts catalog so the UI demo works end-to-end
 *
 *   Run:  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------- System roles ----------
const SYSTEM_ROLES = [
  { name: 'owner',          labelAr: 'صاحب الشركة' },
  { name: 'manager',        labelAr: 'مدير عام' },
  { name: 'branch_manager', labelAr: 'مدير فرع' },
  { name: 'accountant',     labelAr: 'محاسب' },
  { name: 'warehouse',      labelAr: 'أمين مستودع' },
  { name: 'cashier',        labelAr: 'بائع/كاشير' },
  { name: 'viewer',         labelAr: 'مشاهد' },
];

// ---------- System permissions (extend as you build new modules) ----------
const PERMISSIONS: Array<{ code: string; module: string; labelAr: string }> = [
  // sales
  { code: 'sales.view',     module: 'sales',     labelAr: 'عرض المبيعات' },
  { code: 'sales.create',   module: 'sales',     labelAr: 'إنشاء فاتورة بيع' },
  { code: 'sales.cancel',   module: 'sales',     labelAr: 'إلغاء فاتورة بيع' },
  { code: 'cost.view',      module: 'sales',     labelAr: 'رؤية التكلفة والأرباح' },
  { code: 'discount.grant', module: 'sales',     labelAr: 'منح خصم يدوي' },
  // catalog
  { code: 'parts.view',     module: 'catalog',   labelAr: 'عرض الأصناف' },
  { code: 'parts.create',   module: 'catalog',   labelAr: 'إضافة قطعة' },
  { code: 'parts.edit',     module: 'catalog',   labelAr: 'تعديل بطاقة القطعة' },
  { code: 'parts.delete',   module: 'catalog',   labelAr: 'حذف قطعة' },
  { code: 'price.edit',     module: 'catalog',   labelAr: 'تعديل الأسعار' },
  // inventory
  { code: 'stock.view',     module: 'inventory', labelAr: 'عرض المخزون' },
  { code: 'stock.adjust',   module: 'inventory', labelAr: 'تعديل المخزون' },
  { code: 'transfer.create',  module: 'inventory', labelAr: 'إنشاء تحويل' },
  { code: 'transfer.approve', module: 'inventory', labelAr: 'اعتماد تحويل بين الفروع' },
  // purchases
  { code: 'purchase.view',   module: 'purchases', labelAr: 'عرض المشتريات' },
  { code: 'purchase.create', module: 'purchases', labelAr: 'إنشاء فاتورة شراء' },
  // accounting
  { code: 'accounting.view',   module: 'accounting', labelAr: 'عرض التقارير المالية' },
  { code: 'accounting.entry',  module: 'accounting', labelAr: 'إدخال قيد/سند/مصروف' },
  // admin
  { code: 'users.manage',   module: 'admin',     labelAr: 'إدارة المستخدمين والصلاحيات' },
  { code: 'settings.edit',  module: 'admin',     labelAr: 'تعديل الإعدادات والهوية' },
  // audit
  { code: 'audit.view',     module: 'admin',     labelAr: 'عرض سجل التدقيق' },
];

// Permission bundles per role
const ROLE_PERMS: Record<string, string[]> = {
  owner: PERMISSIONS.map((p) => p.code), // everything
  manager: PERMISSIONS.filter((p) => !['users.manage'].includes(p.code)).map((p) => p.code),
  branch_manager: [
    'sales.view','sales.create','sales.cancel','discount.grant','cost.view',
    'parts.view','price.edit','stock.view','stock.adjust','transfer.create',
    'purchase.view','purchase.create','accounting.view',
  ],
  accountant: ['accounting.view','accounting.entry','sales.view','purchase.view','stock.view','cost.view'],
  warehouse:  ['stock.view','stock.adjust','transfer.create','parts.view'],
  cashier:    ['sales.view','sales.create','parts.view','stock.view'],
  viewer:     ['sales.view','parts.view','stock.view','accounting.view'],
};

// ---------- Demo catalog ----------
const DEMO_PARTS = [
  { sku: 'P-0001', name: 'فلتر زيت تويوتا',       partNumber: 'F026407099', oemNumber: '90915-YZZD4', manufacturer: 'Bosch', countryOrigin: 'اليابان', cost: 1.80, retail: 3.50, wholesale: 2.80, qty: 240 },
  { sku: 'P-0002', name: 'بوجيه NGK',              partNumber: 'BKR6E',      oemNumber: 'EC01B-22401', manufacturer: 'NGK',   countryOrigin: 'اليابان', cost: 1.10, retail: 2.00, wholesale: 1.60, qty: 620 },
  { sku: 'P-0003', name: 'طقم فحمات أمامي',         partNumber: 'GDB3424',    oemNumber: '58101-3XA00', manufacturer: 'TRW',   countryOrigin: 'ألمانيا', cost: 11.0, retail: 18.00, wholesale: 14.5, qty: 6 },
  { sku: 'P-0004', name: 'حساس أكسجين',             partNumber: '234-9023',   oemNumber: '89465-02250', manufacturer: 'Denso', countryOrigin: 'اليابان', cost: 20.0, retail: 32.00, wholesale: 27.0, qty: 2 },
  { sku: 'P-0005', name: 'مساعد أمامي KYB',         partNumber: '339234',     oemNumber: '54302-3SG0A', manufacturer: 'KYB',   countryOrigin: 'اليابان', cost: 28.0, retail: 45.00, wholesale: 38.0, qty: 0 },
  { sku: 'P-0006', name: 'بطارية 70A',              partNumber: 'E44',         oemNumber: '',            manufacturer: 'Varta', countryOrigin: 'ألمانيا', cost: 38.0, retail: 55.00, wholesale: 48.0, qty: 18 },
  { sku: 'P-0007', name: 'سير مكنة',                partNumber: '6PK1750',     oemNumber: '',            manufacturer: 'Gates', countryOrigin: 'بلجيكا', cost: 5.5,  retail: 9.50,  wholesale: 7.50, qty: 35 },
  { sku: 'P-0008', name: 'فلتر هواء',              partNumber: '28113-1R100', oemNumber: '',            manufacturer: 'Mann',  countryOrigin: 'ألمانيا', cost: 3.5,  retail: 6.00,  wholesale: 4.80, qty: 5 },
  { sku: 'P-0009', name: 'زيت محرك 4L 5W-30',       partNumber: '5W-30',       oemNumber: '',            manufacturer: 'Mobil', countryOrigin: 'الإمارات', cost: 14.0, retail: 22.00, wholesale: 18.0, qty: 42 },
];

async function main() {
  console.log('🌱  Seeding Qit3ati ERP...');

  // -------- 1) System roles + permissions --------
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { name: r.name, tenantId: null } });
    if (!existing) {
      await prisma.role.create({
        data: { name: r.name, labelAr: r.labelAr, isSystem: true, tenantId: null },
      });
    }
  }

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, labelAr: p.labelAr },
      create: p,
    });
  }

  // wire role <-> permission
  for (const [roleName, codes] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.findFirst({ where: { name: roleName, tenantId: null } });
    if (!role) continue;
    for (const code of codes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log(`  ✔ roles=${SYSTEM_ROLES.length} permissions=${PERMISSIONS.length}`);

  // -------- 2) Demo tenant --------
  let tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'محل قطعتي التجريبي',
        slug: 'demo',
        plan: 'pro',
        status: 'active',
        maxBranches: 3,
        maxUsers: 10,
        settings: {
          create: {
            legalName: 'قِطَعتي للتجارة',
            taxNumber: '123456789',
            phone: '+962790000000',
            address: 'عمّان — وادي صقرة',
            colorPrimary: '#1E5F74',
            colorSecondary: '#FF7A00',
            currency: 'JOD',
            taxRate: 16.0,
            language: 'ar',
            jofotaraEnabled: false,
          },
        },
      },
    });
  }

  // Main branch
  let branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id, isMain: true } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'فرع وادي صقرة (رئيسي)',
        code: 'MAIN',
        address: 'وادي صقرة، عمّان',
        phone: '+962790000000',
        isMain: true,
      },
    });
  }

  // Main warehouse
  let warehouse = await prisma.warehouse.findFirst({ where: { tenantId: tenant.id, isMain: true } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'المستودع الرئيسي', isMain: true },
    });
  }

  // -------- 3) Owner user --------
  // Allow override via env (so production seeds don't use the public demo password).
  const ownerEmail    = process.env.SEED_OWNER_EMAIL    ?? 'owner@demo.qit3ati.com';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'Qit3ati@2026';
  const ownerRole = await prisma.role.findFirst({ where: { name: 'owner', tenantId: null } });
  const passwordHash = await bcrypt.hash(ownerPassword, 10);
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: ownerEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      roleId: ownerRole?.id,
      fullName: 'حسّان (المالك)',
      email: ownerEmail,
      phone: '+962790000000',
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: {},
    create: { userId: owner.id, branchId: branch.id },
  });

  console.log(`  ✔ demo tenant + owner (${ownerEmail})`);

  // -------- 4) Demo catalog & stock --------
  for (const p of DEMO_PARTS) {
    const part = await prisma.part.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
        partNumber: p.partNumber || null,
        oemNumber: p.oemNumber || null,
        barcode: p.sku,
        manufacturer: p.manufacturer,
        countryOrigin: p.countryOrigin,
        costPrice: p.cost,
        avgCost: p.cost,
        retailPrice: p.retail,
        wholesalePrice: p.wholesale,
        minStock: 5,
        warrantyMonths: 6,
        taxRate: 16.0,
        createdBy: owner.id,
      },
    });
    await prisma.stock.upsert({
      where: { tenantId_warehouseId_partId: { tenantId: tenant.id, warehouseId: warehouse.id, partId: part.id } },
      update: { quantity: p.qty },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        partId: part.id,
        quantity: p.qty,
        status: p.qty === 0 ? 'out' : p.qty < 5 ? 'low' : 'available',
      },
    });
  }
  console.log(`  ✔ ${DEMO_PARTS.length} demo parts + stock seeded`);

  console.log('✅  Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
