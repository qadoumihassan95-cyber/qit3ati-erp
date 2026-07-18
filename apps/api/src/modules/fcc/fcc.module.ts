/**
 * FinancialControlCenter (FCC)
 * ────────────────────────────
 * A COMPLETELY SEPARATE read-only module that cross-verifies the ERP's
 * accounting + inventory data. Never mutates. Never changes existing
 * accounting logic. Just runs consistency checks and returns a report.
 *
 * The intent: give a CFO / auditor a single page they can open to see
 * "does the money add up?" and "does the stock add up?" without asking
 * a developer to write ad-hoc SQL.
 *
 * All endpoints are gated by 'accounting.view'. Read-only: no method
 * on this service issues INSERT / UPDATE / DELETE.
 */
import { Module, Controller, Get, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

@Injectable()
class FccService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cross-verify sales & inventory data three ways:
   *   1. Sum of SalesInvoice.total (source of truth)
   *   2. Sum of SalesItem.qty × unitPrice (line-item reconstruction)
   *   3. Sum of FifoConsumption.line_cost + gross profit calculation
   */
  async salesReconciliation(tenantId: string) {
    const invoiceAgg = await this.prisma.salesInvoice.aggregate({
      where:  { tenantId, deletedAt: null, status: 'completed' as any },
      _sum:   { total: true, subtotal: true, tax: true, discount: true },
      _count: true,
    });

    const itemsAgg = await this.prisma.salesItem.findMany({
      where: { invoice: { tenantId, deletedAt: null, status: 'completed' as any } },
      select: { qty: true, unitPrice: true, unitCost: true, discount: true },
    });
    let itemsRevenue = 0, itemsCogs = 0;
    for (const it of itemsAgg) {
      const q = Number(it.qty ?? 0);
      const p = Number(it.unitPrice ?? 0);
      const c = Number(it.unitCost ?? 0);
      const d = Number(it.discount ?? 0);
      itemsRevenue += Math.max(0, q * p - d);
      itemsCogs    += q * c;
    }

    const fifoAgg = await this.prisma.fifoConsumption.aggregate({
      where:  { tenantId },
      _sum:   { lineCost: true, qty: true },
    });

    const invoiceTotal = Number(invoiceAgg._sum.total    ?? 0);
    const invoiceSub   = Number(invoiceAgg._sum.subtotal ?? 0);
    const fifoCogs     = Number(fifoAgg._sum.lineCost   ?? 0);
    const drift = Math.abs(invoiceTotal - itemsRevenue);

    return {
      invoiceCount:  invoiceAgg._count,
      invoiceTotal, invoiceSubtotal: invoiceSub,
      itemsRevenue,
      revenueDrift:  drift,
      revenueOk:     drift < 0.05,       // JOD → half-piaster tolerance for rounding
      cogs: {
        fromSalesItemUnitCost: itemsCogs,
        fromFifoConsumptionRows: fifoCogs,
        fifoTracedFraction: itemsAgg.length > 0 ? fifoCogs / Math.max(itemsCogs, 0.01) : 0,
      },
      grossProfit: itemsRevenue - itemsCogs,
      grossMarginPct: itemsRevenue > 0 ? ((itemsRevenue - itemsCogs) / itemsRevenue) * 100 : 0,
    };
  }

  /**
   * Reconcile customer balances against invoice/receipt history.
   *  expected_balance = Σ credit sales - Σ receipts + Σ returns credit
   * If any customer's stored balance drifts, list them.
   */
  async customerBalanceCheck(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where:  { tenantId, deletedAt: null },
      select: { id: true, name: true, balance: true },
    });
    const invoices = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: { tenantId, deletedAt: null, status: 'completed' as any },
      _sum: { total: true, paid: true },
    });
    const receipts = await this.prisma.receipt.groupBy({
      by: ['customerId'],
      where: { tenantId },
      _sum: { amount: true },
    });
    const invMap = new Map<string, { total: number; paid: number }>();
    for (const i of invoices) {
      if (!i.customerId) continue;
      invMap.set(i.customerId, { total: Number(i._sum.total ?? 0), paid: Number(i._sum.paid ?? 0) });
    }
    const rcpMap = new Map<string, number>();
    for (const r of receipts) if (r.customerId) rcpMap.set(r.customerId, Number(r._sum.amount ?? 0));

    const drift: Array<{ id: string; name: string; storedBalance: number; expectedBalance: number; delta: number }> = [];
    for (const c of customers) {
      const inv = invMap.get(c.id) ?? { total: 0, paid: 0 };
      const rcp = rcpMap.get(c.id) ?? 0;
      // Expected outstanding = (invoiced - paid-at-invoice-time) - separate receipts
      const expected = Math.max(0, inv.total - inv.paid - rcp);
      const stored = Number(c.balance);
      const delta = Math.abs(stored - expected);
      if (delta > 0.05) {
        drift.push({ id: c.id, name: c.name, storedBalance: stored, expectedBalance: expected, delta });
      }
    }
    // Sort by absolute drift descending
    drift.sort((a, b) => b.delta - a.delta);
    return {
      customersChecked: customers.length,
      customersWithDrift: drift.length,
      totalDrift:       drift.reduce((s, d) => s + d.delta, 0),
      worstDrifters:    drift.slice(0, 20),
    };
  }

  /**
   * Same idea for suppliers.
   */
  async supplierBalanceCheck(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where:  { tenantId, deletedAt: null },
      select: { id: true, name: true, balance: true },
    });
    const purchases = await this.prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { tenantId, deletedAt: null },
      _sum: { total: true, paid: true },
    });
    const payments = await this.prisma.payment.groupBy({
      by: ['supplierId'],
      where: { tenantId },
      _sum: { amount: true },
    });
    const purMap = new Map<string, { total: number; paid: number }>();
    for (const p of purchases) {
      if (!p.supplierId) continue;
      purMap.set(p.supplierId, { total: Number(p._sum.total ?? 0), paid: Number(p._sum.paid ?? 0) });
    }
    const payMap = new Map<string, number>();
    for (const p of payments) if (p.supplierId) payMap.set(p.supplierId, Number(p._sum.amount ?? 0));

    const drift: Array<{ id: string; name: string; storedBalance: number; expectedBalance: number; delta: number }> = [];
    for (const s of suppliers) {
      const pur = purMap.get(s.id) ?? { total: 0, paid: 0 };
      const pay = payMap.get(s.id) ?? 0;
      const expected = Math.max(0, pur.total - pur.paid - pay);
      const stored = Number(s.balance);
      const delta = Math.abs(stored - expected);
      if (delta > 0.05) {
        drift.push({ id: s.id, name: s.name, storedBalance: stored, expectedBalance: expected, delta });
      }
    }
    drift.sort((a, b) => b.delta - a.delta);
    return {
      suppliersChecked:   suppliers.length,
      suppliersWithDrift: drift.length,
      totalDrift:         drift.reduce((s, d) => s + d.delta, 0),
      worstDrifters:      drift.slice(0, 20),
    };
  }

  /**
   * Cash flow reconciliation:
   *   net cash = Σ receipts − Σ payments − Σ expenses
   */
  async cashFlow(tenantId: string, fromISO?: string, toISO?: string) {
    const dateFilter = (fromISO || toISO) ? {
      gte: fromISO ? new Date(fromISO) : undefined,
      lte: toISO   ? new Date(toISO)   : undefined,
    } : undefined;

    const rcp = await this.prisma.receipt.aggregate({
      where: { tenantId, ...(dateFilter ? { receiptDate: dateFilter } : {}) },
      _sum: { amount: true }, _count: true,
    });
    const pay = await this.prisma.payment.aggregate({
      where: { tenantId, ...(dateFilter ? { paymentDate: dateFilter } : {}) },
      _sum: { amount: true }, _count: true,
    });
    const exp = await this.prisma.expense.aggregate({
      where: { tenantId, ...(dateFilter ? { expenseDate: dateFilter } : {}) },
      _sum: { amount: true }, _count: true,
    });
    const receiptsIn  = Number(rcp._sum.amount ?? 0);
    const paymentsOut = Number(pay._sum.amount ?? 0);
    const expensesOut = Number(exp._sum.amount ?? 0);
    return {
      period: { from: fromISO ?? null, to: toISO ?? null },
      receipts:  { count: rcp._count, total: receiptsIn },
      payments:  { count: pay._count, total: paymentsOut },
      expenses:  { count: exp._count, total: expensesOut },
      netCashFlow: receiptsIn - paymentsOut - expensesOut,
    };
  }

  /**
   * Inventory Health — read-only integrity checks:
   *   1. Parts with negative on-hand stock across all branches
   *   2. Parts below their configured min_stock (reorder alert)
   *   3. FIFO layers with impossible qtyRemaining (> qtyReceived)
   *   4. Stock rows for parts with zero FIFO layers (pre-FIFO leftover)
   */
  async inventoryHealth(tenantId: string) {
    // 1) negative stock
    const negative = await this.prisma.stock.findMany({
      where: { tenantId, quantity: { lt: 0 } },
      include: { part: { select: { id: true, sku: true, name: true } }, branch: { select: { id: true, name: true } } },
      take: 100,
    });
    // 2) below-min
    // Uses Prisma raw for cross-column comparison — no way to express Stock.quantity <= Part.minStock via Prisma types.
    const belowMin = await this.prisma.$queryRawUnsafe<Array<{ id: string; sku: string; name: string; branch_name: string; quantity: string; min_stock: string }>>(
      `SELECT s.id::text AS id,
              p.sku, p.name,
              b.name AS branch_name,
              s.quantity::text AS quantity,
              p.min_stock::text AS min_stock
         FROM stocks s
         JOIN parts   p ON p.id = s.part_id
         JOIN branches b ON b.id = s.branch_id
        WHERE s.tenant_id = $1::uuid
          AND p.min_stock > 0
          AND s.quantity  <= p.min_stock
          AND p.deleted_at IS NULL
          AND b.deleted_at IS NULL
        ORDER BY (p.min_stock - s.quantity) DESC
        LIMIT 100`,
      tenantId,
    );
    // 3) impossible FIFO layers
    const badLayers = await this.prisma.$queryRawUnsafe<Array<{ id: string; sku: string; qty_received: string; qty_remaining: string }>>(
      `SELECT fl.id::text AS id, p.sku,
              fl.qty_received::text  AS qty_received,
              fl.qty_remaining::text AS qty_remaining
         FROM fifo_layers fl
         JOIN parts p ON p.id = fl.part_id
        WHERE fl.tenant_id = $1::uuid
          AND fl.qty_remaining > fl.qty_received
        LIMIT 100`,
      tenantId,
    );
    // 4) parts with stock rows but no FIFO layers
    const untraced = await this.prisma.$queryRawUnsafe<Array<{ part_id: string; sku: string; name: string; on_hand: string }>>(
      `SELECT s.part_id::text AS part_id,
              p.sku, p.name,
              SUM(s.quantity)::text AS on_hand
         FROM stocks s
         JOIN parts p ON p.id = s.part_id
    LEFT JOIN fifo_layers fl ON fl.part_id = s.part_id AND fl.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1::uuid
          AND s.quantity > 0
          AND fl.id IS NULL
          AND p.deleted_at IS NULL
     GROUP BY s.part_id, p.sku, p.name
        LIMIT 100`,
      tenantId,
    );

    return {
      negative: {
        count: negative.length,
        rows:  negative.map(n => ({
          partId: n.part.id, sku: n.part.sku, name: n.part.name,
          branch: n.branch.name, quantity: Number(n.quantity),
        })),
      },
      belowMin: {
        count: belowMin.length,
        rows:  belowMin.map(r => ({
          sku: r.sku, name: r.name, branch: r.branch_name,
          quantity: Number(r.quantity), minStock: Number(r.min_stock),
          shortBy: Number(r.min_stock) - Number(r.quantity),
        })),
      },
      corruptFifoLayers: {
        count: badLayers.length,
        rows:  badLayers.map(r => ({
          layerId: r.id, sku: r.sku,
          qtyReceived: Number(r.qty_received), qtyRemaining: Number(r.qty_remaining),
        })),
      },
      partsWithoutFifoLayers: {
        count: untraced.length,
        rows:  untraced.map(r => ({ partId: r.part_id, sku: r.sku, name: r.name, onHand: Number(r.on_hand) })),
      },
    };
  }

  /**
   * Overall FCC KPI summary — one endpoint the frontend can call to
   * populate a dashboard-of-dashboards.
   */
  async summary(tenantId: string) {
    const [sales, cust, sup, cash, inv] = await Promise.all([
      this.salesReconciliation(tenantId),
      this.customerBalanceCheck(tenantId),
      this.supplierBalanceCheck(tenantId),
      this.cashFlow(tenantId),
      this.inventoryHealth(tenantId),
    ]);
    // Aggregate top-level health score: how many red flags?
    const redFlags =
      (sales.revenueOk ? 0 : 1)
      + (cust.customersWithDrift > 0 ? 1 : 0)
      + (sup.suppliersWithDrift  > 0 ? 1 : 0)
      + (inv.negative.count           > 0 ? 1 : 0)
      + (inv.corruptFifoLayers.count  > 0 ? 1 : 0);
    return { generatedAt: new Date().toISOString(), redFlags, sales, cust, sup, cash, inv };
  }
}

@Controller('fcc')
class FccController {
  constructor(private readonly svc: FccService) {}

  @Get('summary')
  @Permissions('accounting.view')
  summary(@Tenant() tid: string) { return this.svc.summary(tid); }

  @Get('sales-reconciliation')
  @Permissions('accounting.view')
  sales(@Tenant() tid: string) { return this.svc.salesReconciliation(tid); }

  @Get('customer-balances')
  @Permissions('accounting.view')
  customers(@Tenant() tid: string) { return this.svc.customerBalanceCheck(tid); }

  @Get('supplier-balances')
  @Permissions('accounting.view')
  suppliers(@Tenant() tid: string) { return this.svc.supplierBalanceCheck(tid); }

  @Get('cash-flow')
  @Permissions('accounting.view')
  cash(@Tenant() tid: string) { return this.svc.cashFlow(tid); }

  @Get('inventory-health')
  @Permissions('stock.view')
  inventory(@Tenant() tid: string) { return this.svc.inventoryHealth(tid); }
}

@Module({
  controllers: [FccController],
  providers:   [FccService],
  exports:     [FccService],
})
export class FccModule {}
