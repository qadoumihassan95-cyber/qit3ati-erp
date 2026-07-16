/**
 * End-to-end tests for the multi-branch enforcement layer.
 *
 * We seed a minimal fixture at the top of the suite:
 *   • Tenant T
 *   • Two branches: A (Amman) + B (Irbid)
 *   • User Ann → assigned ONLY to branch A (no super-admin, no
 *     `branches.view_all` permission)
 *   • User Owen → super-admin (owner)
 *
 * Then we assert:
 *   1. Ann can create a sale in branch A
 *   2. Ann is FORBIDDEN from creating a sale in branch B (403)
 *   3. Ann's list of sales does not leak branch B rows
 *   4. Ann is FORBIDDEN from reading a specific branch B invoice by UUID
 *   5. Owen sees sales from both branches with no branchId filter
 *   6. Transfer create requires access to source branch
 *   7. Transfer receive requires access to target branch
 *
 * Run: pnpm --filter api test:e2e branch-access
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as request from 'supertest';
import { sign } from 'jsonwebtoken';

// Seed data captured once per suite
let app:    INestApplication;
let prisma: PrismaService;
let tenantId: string;
let branchAId: string;
let branchBId: string;
let annToken: string;
let owenToken: string;
let partId: string;

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

function jwt(sub: string, extras: any = {}) {
  return sign({ sub, tenantId, roleId: null, permissions: [], ...extras }, JWT_SECRET);
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);

  // ----- fixtures -----
  const tenant = await prisma.tenant.create({
    data: { name: 'BA Test Co', slug: 'ba-test-' + Date.now() },
  });
  tenantId = tenant.id;

  const brA = await prisma.branch.create({
    data: { tenantId, name: 'Amman',  code: 'AMM', isMain: true,  isActive: true },
  });
  const brB = await prisma.branch.create({
    data: { tenantId, name: 'Irbid',  code: 'IRB', isMain: false, isActive: true },
  });
  branchAId = brA.id;
  branchBId = brB.id;

  // Warehouse per branch (createSale expects it)
  await prisma.warehouse.create({ data: { tenantId, branchId: branchAId, name: 'A-WH', isMain: true } });
  await prisma.warehouse.create({ data: { tenantId, branchId: branchBId, name: 'B-WH', isMain: true } });

  const ann = await prisma.user.create({
    data: {
      tenantId, email: 'ann@test.local', fullName: 'Ann Manager',
      passwordHash: 'x', isSuperAdmin: false,
    },
  });
  await prisma.userBranch.create({ data: { userId: ann.id, branchId: branchAId } });
  annToken = jwt(ann.id);

  const owen = await prisma.user.create({
    data: {
      tenantId, email: 'owen@test.local', fullName: 'Owen Owner',
      passwordHash: 'x', isSuperAdmin: true,
    },
  });
  owenToken = jwt(owen.id, { isSuperAdmin: true });

  // A part with stock in both branches so sales can succeed
  const part = await prisma.part.create({
    data: { tenantId, sku: 'BA-TEST-001', name: 'Test Part', price: 10, cost: 5 },
  });
  partId = part.id;
  await prisma.stock.create({ data: { tenantId, branchId: branchAId, partId, quantity: 100 } });
  await prisma.stock.create({ data: { tenantId, branchId: branchBId, partId, quantity: 100 } });
});

afterAll(async () => {
  // Best-effort cleanup — leaves DB tidy even if a test halfway failed.
  await prisma.stockMovement.deleteMany({ where: { tenantId } });
  await prisma.salesInvoiceItem.deleteMany({ where: { tenantId } });
  await prisma.salesInvoice.deleteMany({ where: { tenantId } });
  await prisma.stock.deleteMany({ where: { tenantId } });
  await prisma.userBranch.deleteMany({ where: { branchId: { in: [branchAId, branchBId] } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.part.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await app.close();
});

describe('multi-branch enforcement', () => {
  const saleBody = (branchId: string) => ({
    branchId,
    items: [{ partId, qty: 1, unitPrice: 10 }],
    paymentType: 'cash',
  });

  it('Ann can create a sale in HER branch (A)', async () => {
    const r = await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', `Bearer ${annToken}`)
      .send(saleBody(branchAId));
    expect(r.status).toBe(201);
    expect(r.body.branchId).toBe(branchAId);
  });

  it('Ann is FORBIDDEN from creating a sale in branch B', async () => {
    const r = await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', `Bearer ${annToken}`)
      .send(saleBody(branchBId));
    expect(r.status).toBe(403);
    expect(String(r.body.message ?? '')).toMatch(/not assigned/i);
  });

  it("Ann's sales list does NOT include branch B rows", async () => {
    // Seed a branch-B sale via Owen so branch B has data
    await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', `Bearer ${owenToken}`)
      .send(saleBody(branchBId));

    const r = await request(app.getHttpServer())
      .get('/sales')
      .set('Authorization', `Bearer ${annToken}`);
    expect(r.status).toBe(200);
    for (const inv of r.body.items) {
      expect(inv.branchId).toBe(branchAId);
    }
  });

  it('Ann is FORBIDDEN from reading a specific branch B invoice by UUID', async () => {
    const branchBInv = await prisma.salesInvoice.findFirst({ where: { branchId: branchBId } });
    expect(branchBInv).toBeTruthy();
    const r = await request(app.getHttpServer())
      .get(`/sales/${branchBInv!.id}`)
      .set('Authorization', `Bearer ${annToken}`);
    expect(r.status).toBe(403);
  });

  it('Owen sees BOTH branches in his sales list with no branch filter', async () => {
    const r = await request(app.getHttpServer())
      .get('/sales')
      .set('Authorization', `Bearer ${owenToken}`);
    expect(r.status).toBe(200);
    const branches = new Set(r.body.items.map((i: any) => i.branchId));
    expect(branches.has(branchAId)).toBe(true);
    expect(branches.has(branchBId)).toBe(true);
  });

  it('Ann cannot create a transfer OUT of branch B (she has no access to source)', async () => {
    const r = await request(app.getHttpServer())
      .post('/transfers')
      .set('Authorization', `Bearer ${annToken}`)
      .send({
        fromBranch: branchBId,
        toBranch:   branchAId,
        items: [{ partId, qty: 1 }],
      });
    expect(r.status).toBe(403);
  });

  it('Ann CAN create a transfer FROM A → B (source access enforced, target validated)', async () => {
    const r = await request(app.getHttpServer())
      .post('/transfers')
      .set('Authorization', `Bearer ${annToken}`)
      .send({
        fromBranch: branchAId,
        toBranch:   branchBId,
        items: [{ partId, qty: 1 }],
      });
    expect(r.status).toBe(201);
  });

  it('Ann cannot RECEIVE a transfer into branch B (she is not assigned there)', async () => {
    const t = await prisma.transfer.findFirst({ where: { toBranch: branchBId } });
    expect(t).toBeTruthy();
    const r = await request(app.getHttpServer())
      .post(`/transfers/${t!.id}/receive`)
      .set('Authorization', `Bearer ${annToken}`)
      .send({ items: [{ partId, qtyReceived: 1 }] });
    expect(r.status).toBe(403);
  });
});
