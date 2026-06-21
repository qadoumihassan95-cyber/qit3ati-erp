import { Module, Controller, Get, Query, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

/** Parse a YYYY-MM-DD date string. Returns Date or undefined. */
function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Convert any BigInt / Decimal-like to safe number. */
const n = (v: any): number => Number(v ?? 0);

@Injectable()
class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Profit & Loss for a period.
   * Revenue   = sum(salesInvoice.subtotal - discount) for status=completed
   * COGS      = sum(salesItem.unitCost * salesItem.qty)
   * Expenses  = sum(expense.amount)
   * Returns   = sum(salesReturn.total)
   * Net       = Revenue - COGS - Expenses - Returns
   */
  async profitAndLoss(tenantId: string, from?: Date, to?: Date) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = from;
    if (to)   dateFilter.lte = to;
    const invoiceWhere = {
      tenantId, status: 'completed' as const,
      ...(from || to ? { invoiceDate: dateFilter } : {}),
    };
    const [salesAgg, items, expAgg, retAgg, purAgg] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: invoiceWhere,
        _sum: { subtotal: true, discount: true, tax: true, total: true },
        _count: true,
      }),
      this.prisma.salesItem.findMany({
        where: { invoice: invoiceWhere },
        select: { qty: true, unitCost: true, unitPrice: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, ...(from || to ? { expenseDate: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.salesReturn.aggregate({
        where: { tenantId, ...(from || to ? { createdAt: dateFilter } : {}) },
        _sum: { total: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: { tenantId, ...(from || to ? { invoiceDate: dateFilter } : {}) },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const revenue = n(salesAgg._sum.subtotal) - n(salesAgg._sum.discount);
    const cogs = items.reduce((s, l) => s + n(l.unitCost) * n(l.qty), 0);
    const expenses = n(expAgg._sum.amount);
    const returns = n(retAgg._sum.total);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses - returns;

    return {
      period: {
        from: from?.toISOString() ?? null,
        to:   to?.toISOString()   ?? null,
      },
      revenue:      +revenue.toFixed(3),
      cogs:         +cogs.toFixed(3),
      grossProfit:  +grossProfit.toFixed(3),
      grossMargin:  revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(1) : 0,
      expenses:     +expenses.toFixed(3),
      returns:      +returns.toFixed(3),
      netProfit:    +netProfit.toFixed(3),
      netMargin:    revenue > 0 ? +((netProfit / revenue) * 100).toFixed(1) : 0,
      salesCount:   Number(salesAgg._count ?? 0),
      purchasesTotal: n(purAgg._sum.total),
      purchasesCount: Number(purAgg._count ?? 0),
      taxCollected: n(salesAgg._sum.tax),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  //  DRILL-DOWN ENDPOINTS — full row-level data behind each KPI card
  // ──────────────────────────────────────────────────────────────────

  private invoiceDateWhere(from?: Date, to?: Date) {
    const f: { gte?: Date; lte?: Date } = {};
    if (from) f.gte = from;
    if (to)   f.lte = to;
    return (from || to) ? f : undefined;
  }

  /** REVENUE drill-down: every completed sales invoice with full identifying fields. */
  async detailsRevenue(tenantId: string, from?: Date, to?: Date) {
    const where = {
      tenantId, status: 'completed' as const,
      ...(this.invoiceDateWhere(from, to) ? { invoiceDate: this.invoiceDateWhere(from, to) } : {}),
    };
    const rows = await this.prisma.salesInvoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      take: 1000,
      select: {
        id: true, invoiceNo: true, invoiceDate: true,
        subtotal: true, discount: true, tax: true, total: true,
        paymentType: true,
        customer: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
      },
    });
    return {
      total: rows.reduce((s, r) => s + (n(r.subtotal) - n(r.discount)), 0),
      count: rows.length,
      rows: rows.map((r) => ({
        id:          r.id,
        invoiceNo:   r.invoiceNo,
        date:        r.invoiceDate,
        customerId:  r.customer?.id ?? null,
        customer:    r.customer?.name ?? 'بيع نقدي',
        branchId:    r.branch?.id ?? null,
        branch:      r.branch?.name ?? '—',
        paymentType: r.paymentType,
        subtotal:    n(r.subtotal),
        discount:    n(r.discount),
        tax:         n(r.tax),
        total:       n(r.total),
        net:         +(n(r.subtotal) - n(r.discount)).toFixed(3),
      })),
    };
  }

  /** COGS drill-down: per-part qty sold, avg cost, total cost, branches, suppliers. */
  async detailsCogs(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const items = await this.prisma.salesItem.findMany({
      where: {
        invoice: {
          tenantId, status: 'completed',
          ...(dateW ? { invoiceDate: dateW } : {}),
        },
      },
      select: {
        qty: true, unitCost: true, partId: true,
        part: {
          select: {
            id: true, sku: true, name: true,
            purchaseItems: {
              orderBy: { id: 'desc' },
              take: 1,
              select: { invoice: { select: { supplier: { select: { id: true, name: true } } } } },
            },
          },
        },
        invoice: { select: { branch: { select: { id: true, name: true } } } },
      },
    });

    const map = new Map<string, {
      partId: string; sku: string; name: string;
      qty: number; totalCost: number;
      branches: Set<string>; suppliers: Set<string>;
    }>();
    for (const it of items) {
      if (!it.part) continue;
      const k = it.part.id;
      const cur = map.get(k) ?? {
        partId: it.part.id, sku: it.part.sku, name: it.part.name,
        qty: 0, totalCost: 0,
        branches: new Set<string>(), suppliers: new Set<string>(),
      };
      cur.qty += n(it.qty);
      cur.totalCost += n(it.unitCost) * n(it.qty);
      if (it.invoice?.branch?.name) cur.branches.add(it.invoice.branch.name);
      const sup = it.part.purchaseItems?.[0]?.invoice?.supplier?.name;
      if (sup) cur.suppliers.add(sup);
      map.set(k, cur);
    }
    const rows = [...map.values()].map((r) => ({
      partId:    r.partId,
      sku:       r.sku,
      name:      r.name,
      qty:       +r.qty.toFixed(3),
      avgCost:   r.qty > 0 ? +(r.totalCost / r.qty).toFixed(3) : 0,
      totalCost: +r.totalCost.toFixed(3),
      branches:  [...r.branches].join('، '),
      suppliers: [...r.suppliers].join('، ') || '—',
    })).sort((a, b) => b.totalCost - a.totalCost);
    return { total: rows.reduce((s, r) => s + r.totalCost, 0), count: rows.length, rows };
  }

  /** PROFIT drill-down: top parts, top customers, top branches by profit, per-invoice margin. */
  async detailsProfit(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const items = await this.prisma.salesItem.findMany({
      where: { invoice: { tenantId, status: 'completed', ...(dateW ? { invoiceDate: dateW } : {}) } },
      select: {
        qty: true, unitPrice: true, unitCost: true, discount: true, partId: true,
        part:    { select: { id: true, name: true, sku: true } },
        invoice: {
          select: {
            id: true, invoiceNo: true, invoiceDate: true, total: true,
            customer: { select: { id: true, name: true } },
            branch:   { select: { id: true, name: true } },
          },
        },
      },
    });

    const partMap = new Map<string, { name: string; sku: string; revenue: number; cost: number }>();
    const custMap = new Map<string, { name: string; revenue: number; cost: number }>();
    const brMap   = new Map<string, { name: string; revenue: number; cost: number }>();
    const invMap  = new Map<string, {
      invoiceId: string; invoiceNo: string; date: Date | null;
      customer: string; branch: string;
      revenue: number; cost: number;
    }>();

    for (const it of items) {
      const rev = (n(it.unitPrice) - n(it.discount)) * n(it.qty);
      const cost = n(it.unitCost) * n(it.qty);

      if (it.part) {
        const cur = partMap.get(it.part.id) ?? { name: it.part.name, sku: it.part.sku, revenue: 0, cost: 0 };
        cur.revenue += rev; cur.cost += cost; partMap.set(it.part.id, cur);
      }
      const custId = it.invoice?.customer?.id ?? '__cash__';
      const cName = it.invoice?.customer?.name ?? 'بيع نقدي';
      const cCur = custMap.get(custId) ?? { name: cName, revenue: 0, cost: 0 };
      cCur.revenue += rev; cCur.cost += cost; custMap.set(custId, cCur);

      const brId = it.invoice?.branch?.id ?? '__nobr__';
      const bName = it.invoice?.branch?.name ?? '—';
      const bCur = brMap.get(brId) ?? { name: bName, revenue: 0, cost: 0 };
      bCur.revenue += rev; bCur.cost += cost; brMap.set(brId, bCur);

      const invId = it.invoice?.id;
      if (invId) {
        const iCur = invMap.get(invId) ?? {
          invoiceId: invId, invoiceNo: it.invoice!.invoiceNo,
          date: it.invoice!.invoiceDate, customer: cName, branch: bName,
          revenue: 0, cost: 0,
        };
        iCur.revenue += rev; iCur.cost += cost; invMap.set(invId, iCur);
      }
    }

    const mapToTop = <T extends { revenue: number; cost: number }>(m: Map<string, T>) =>
      [...m.entries()].map(([id, v]) => ({
        id, ...v,
        revenue: +v.revenue.toFixed(3),
        cost:    +v.cost.toFixed(3),
        profit:  +(v.revenue - v.cost).toFixed(3),
        margin:  v.revenue > 0 ? +(((v.revenue - v.cost) / v.revenue) * 100).toFixed(1) : 0,
      })).sort((a, b) => b.profit - a.profit);

    const topParts     = mapToTop(partMap).slice(0, 20);
    const topCustomers = mapToTop(custMap).slice(0, 20);
    const topBranches  = mapToTop(brMap).slice(0, 20);
    const perInvoice = [...invMap.values()].map((v) => ({
      ...v,
      revenue: +v.revenue.toFixed(3),
      cost:    +v.cost.toFixed(3),
      profit:  +(v.revenue - v.cost).toFixed(3),
      margin:  v.revenue > 0 ? +(((v.revenue - v.cost) / v.revenue) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.profit - a.profit).slice(0, 200);

    return {
      total: perInvoice.reduce((s, r) => s + r.profit, 0),
      topParts, topCustomers, topBranches, perInvoice,
    };
  }

  /** EXPENSES drill-down. */
  async detailsExpenses(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const rows = await this.prisma.expense.findMany({
      where: { tenantId, ...(dateW ? { expenseDate: dateW } : {}) },
      orderBy: { expenseDate: 'desc' },
      take: 1000,
      select: {
        id: true, amount: true, description: true, expenseDate: true,
        category: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
        creator:  { select: { id: true, fullName: true } },
      },
    });
    return {
      total: rows.reduce((s, r) => s + n(r.amount), 0),
      count: rows.length,
      rows: rows.map((r) => ({
        id:          r.id,
        amount:      n(r.amount),
        date:        r.expenseDate,
        description: r.description ?? '—',
        category:    r.category?.name ?? '—',
        branch:      r.branch?.name ?? '—',
        user:        r.creator?.fullName ?? '—',
      })),
    };
  }

  /** NET-PROFIT drill-down: equation breakdown + per-month series. */
  async detailsNetProfit(tenantId: string, from?: Date, to?: Date) {
    const pnl = await this.profitAndLoss(tenantId, from, to);
    const explanation =
      pnl.netProfit > 0
        ? `الربح ناتج عن إيرادات (${pnl.revenue.toFixed(3)}) تفوق مجموع التكلفة والمصاريف والمرتجعات بمقدار ${pnl.netProfit.toFixed(3)} د.أ.`
        : pnl.netProfit < 0
        ? `الخسارة بسبب أنّ التكاليف (${pnl.cogs.toFixed(3)}) والمصاريف (${pnl.expenses.toFixed(3)}) والمرتجعات (${pnl.returns.toFixed(3)}) تجاوزت الإيراد (${pnl.revenue.toFixed(3)}).`
        : `النشاط متعادل — الإيرادات تساوي التكاليف.`;
    return {
      equation: {
        revenue:    pnl.revenue,
        cogs:       pnl.cogs,
        expenses:   pnl.expenses,
        returns:    pnl.returns,
        taxIncluded: pnl.taxCollected,
        netProfit:  pnl.netProfit,
      },
      netProfit: pnl.netProfit,
      netMargin: pnl.netMargin,
      explanation,
    };
  }

  /** INVOICES drill-down (every sales invoice — any status). */
  async detailsInvoices(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const rows = await this.prisma.salesInvoice.findMany({
      where: { tenantId, ...(dateW ? { invoiceDate: dateW } : {}) },
      orderBy: { invoiceDate: 'desc' },
      take: 1000,
      select: {
        id: true, invoiceNo: true, invoiceDate: true,
        total: true, paymentType: true, status: true,
        customer: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
        creator:  { select: { id: true, fullName: true } },
      },
    });
    return {
      total: rows.reduce((s, r) => s + n(r.total), 0),
      count: rows.length,
      rows: rows.map((r) => ({
        id:          r.id,
        invoiceNo:   r.invoiceNo,
        date:        r.invoiceDate,
        customer:    r.customer?.name ?? 'بيع نقدي',
        customerId:  r.customer?.id ?? null,
        branch:      r.branch?.name ?? '—',
        branchId:    r.branch?.id ?? null,
        user:        r.creator?.fullName ?? '—',
        total:       n(r.total),
        paymentType: r.paymentType,
        status:      r.status,
      })),
    };
  }

  /** PURCHASES drill-down. */
  async detailsPurchases(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const rows = await this.prisma.purchaseInvoice.findMany({
      where: { tenantId, ...(dateW ? { invoiceDate: dateW } : {}) },
      orderBy: { invoiceDate: 'desc' },
      take: 1000,
      select: {
        id: true, invoiceNo: true, invoiceDate: true,
        total: true, paymentType: true,
        supplier: { select: { id: true, name: true } },
        branch:   { select: { id: true, name: true } },
      },
    });
    return {
      total: rows.reduce((s, r) => s + n(r.total), 0),
      count: rows.length,
      rows: rows.map((r) => ({
        id:          r.id,
        invoiceNo:   r.invoiceNo,
        date:        r.invoiceDate,
        supplier:    r.supplier?.name ?? '—',
        supplierId:  r.supplier?.id ?? null,
        branch:      r.branch?.name ?? '—',
        branchId:    r.branch?.id ?? null,
        total:       n(r.total),
        paymentType: r.paymentType,
      })),
    };
  }

  /** RETURNS drill-down (sales returns; each return with reason, customer, items). */
  async detailsReturns(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const rows = await this.prisma.salesReturn.findMany({
      where: { tenantId, ...(dateW ? { createdAt: dateW } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true, reason: true, total: true, refundMethod: true, createdAt: true,
        invoice: {
          select: {
            id: true, invoiceNo: true,
            customer: { select: { id: true, name: true } },
          },
        },
        branch: { select: { id: true, name: true } },
        items: {
          take: 10,
          select: { qty: true, part: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
    return {
      total: rows.reduce((s, r) => s + n(r.total), 0),
      count: rows.length,
      rows: rows.map((r) => ({
        id:           r.id,
        date:         r.createdAt,
        invoiceNo:    r.invoice?.invoiceNo ?? '—',
        invoiceId:    r.invoice?.id ?? null,
        customer:     r.invoice?.customer?.name ?? '—',
        customerId:   r.invoice?.customer?.id ?? null,
        branch:       r.branch?.name ?? '—',
        reason:       r.reason ?? '—',
        refundMethod: r.refundMethod ?? '—',
        total:        n(r.total),
        items:        r.items.map((i) => ({
          qty:  n(i.qty),
          name: i.part?.name ?? '—',
          sku:  i.part?.sku ?? '—',
        })),
      })),
    };
  }

  /** TAX drill-down: per invoice + per month aggregates (for accountants). */
  async detailsTax(tenantId: string, from?: Date, to?: Date) {
    const dateW = this.invoiceDateWhere(from, to);
    const rows = await this.prisma.salesInvoice.findMany({
      where: { tenantId, status: 'completed', tax: { gt: 0 }, ...(dateW ? { invoiceDate: dateW } : {}) },
      orderBy: { invoiceDate: 'desc' },
      take: 1000,
      select: {
        id: true, invoiceNo: true, invoiceDate: true,
        subtotal: true, tax: true, total: true,
        customer: { select: { name: true } },
        branch:   { select: { name: true } },
      },
    });
    const perInvoice = rows.map((r) => ({
      id:        r.id,
      invoiceNo: r.invoiceNo,
      date:      r.invoiceDate,
      customer:  r.customer?.name ?? 'بيع نقدي',
      branch:    r.branch?.name ?? '—',
      subtotal:  n(r.subtotal),
      tax:       n(r.tax),
      total:     n(r.total),
    }));
    // monthly aggregate
    const monthlyMap = new Map<string, { tax: number; count: number }>();
    for (const r of perInvoice) {
      const k = r.date.toISOString().slice(0, 7); // YYYY-MM
      const cur = monthlyMap.get(k) ?? { tax: 0, count: 0 };
      cur.tax += r.tax; cur.count += 1;
      monthlyMap.set(k, cur);
    }
    const monthly = [...monthlyMap.entries()].map(([month, v]) => ({
      month,
      tax: +v.tax.toFixed(3),
      count: v.count,
    })).sort((a, b) => a.month.localeCompare(b.month));

    return {
      total: perInvoice.reduce((s, r) => s + r.tax, 0),
      count: perInvoice.length,
      perInvoice,
      monthly,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  //  Existing endpoints (unchanged)
  // ──────────────────────────────────────────────────────────────────

  async customerAging(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null, balance: { gt: 0 } },
      select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
    });

    const result = await Promise.all(customers.map(async (c) => {
      const oldest = await this.prisma.salesInvoice.findFirst({
        where: { tenantId, customerId: c.id, paymentType: 'credit', status: 'completed' },
        orderBy: { invoiceDate: 'asc' },
        select: { id: true, invoiceNo: true, invoiceDate: true, total: true },
      });
      const daysOld = oldest ? Math.floor((Date.now() - oldest.invoiceDate.getTime()) / 86400000) : 0;
      const bucket =
        daysOld <= 30 ? '0-30' :
        daysOld <= 60 ? '31-60' :
        daysOld <= 90 ? '61-90' :
        '90+';
      return {
        customerId: c.id, name: c.name, phone: c.phone,
        balance: n(c.balance),
        creditLimit: n(c.creditLimit),
        oldestInvoice: oldest?.invoiceNo,
        oldestInvoiceDate: oldest?.invoiceDate?.toISOString(),
        daysOld, bucket,
      };
    }));

    const buckets: Record<'0-30' | '31-60' | '61-90' | '90+', number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of result) {
      const bk = r.bucket as '0-30'|'31-60'|'61-90'|'90+';
      buckets[bk] = (buckets[bk] ?? 0) + r.balance;
    }
    return {
      customers: result.sort((a, b) => b.balance - a.balance),
      summary: buckets,
      totalReceivables: result.reduce((s, r) => s + r.balance, 0),
    };
  }

  async supplierAging(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null, balance: { gt: 0 } },
      select: { id: true, name: true, phone: true, balance: true },
    });
    return {
      suppliers: suppliers.map((s) => ({ ...s, balance: n(s.balance) }))
                          .sort((a, b) => b.balance - a.balance),
      totalPayables: suppliers.reduce((s, x) => s + n(x.balance), 0),
    };
  }

  async stockTurnover(tenantId: string, from?: Date, to?: Date) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = from;
    if (to)   dateFilter.lte = to;
    const where = {
      tenantId, type: 'sale' as const,
      ...(from || to ? { createdAt: dateFilter } : {}),
    };

    const movements = await this.prisma.stockMovement.groupBy({
      by: ['partId'],
      where,
      _sum: { qtyChange: true },
    });

    const partIds = movements.map((m) => m.partId);
    if (partIds.length === 0) {
      return { topSold: [], slowMovers: [], deadStock: [] };
    }
    const parts = await this.prisma.part.findMany({
      where: { id: { in: partIds }, tenantId },
      include: { stocks: true },
      take: 500,
    });
    const stocksByPart = new Map(parts.map((p) => [
      p.id,
      {
        name: p.name,
        sku: p.sku,
        onHand: p.stocks.reduce((s, st) => s + n(st.quantity), 0),
        cost: n(p.avgCost),
      },
    ]));

    const enriched = movements.map((m) => {
      const info = stocksByPart.get(m.partId);
      const sold = Math.abs(n(m._sum.qtyChange));
      return {
        partId: m.partId,
        name: info?.name ?? '?',
        sku: info?.sku ?? '?',
        sold,
        onHand: info?.onHand ?? 0,
        valueAtCost: +(((info?.onHand ?? 0) * (info?.cost ?? 0))).toFixed(3),
      };
    });

    const partsWithStock = await this.prisma.part.findMany({
      where: { tenantId, deletedAt: null, isActive: true, id: { notIn: partIds } },
      include: { stocks: true },
      take: 200,
    });
    const deadStock = partsWithStock
      .map((p) => ({
        partId: p.id, name: p.name, sku: p.sku,
        onHand: p.stocks.reduce((s, st) => s + n(st.quantity), 0),
        valueAtCost: +(p.stocks.reduce((s, st) => s + n(st.quantity), 0) * n(p.avgCost)).toFixed(3),
      }))
      .filter((p) => p.onHand > 0)
      .sort((a, b) => b.valueAtCost - a.valueAtCost)
      .slice(0, 30);

    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      topSold:    enriched.sort((a, b) => b.sold - a.sold).slice(0, 20),
      slowMovers: enriched.filter((e) => e.sold <= 1).slice(0, 20),
      deadStock,
    };
  }

  async profitByPart(tenantId: string, from?: Date, to?: Date) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = from;
    if (to)   dateFilter.lte = to;
    const items = await this.prisma.salesItem.findMany({
      where: {
        invoice: { tenantId, status: 'completed', ...(from || to ? { invoiceDate: dateFilter } : {}) },
      },
      select: { partId: true, qty: true, unitPrice: true, unitCost: true, discount: true,
                part: { select: { id: true, sku: true, name: true } } },
    });

    const map = new Map<string, { partId: string; sku: string; name: string;
      qtySold: number; revenue: number; cost: number; }>();
    for (const it of items) {
      if (!it.partId || !it.part) continue;
      const key = it.partId;
      const rev = (n(it.unitPrice) - n(it.discount)) * n(it.qty);
      const cost = n(it.unitCost) * n(it.qty);
      const existing = map.get(key);
      if (existing) {
        existing.qtySold += n(it.qty);
        existing.revenue += rev;
        existing.cost    += cost;
      } else {
        map.set(key, {
          partId: it.part.id, sku: it.part.sku, name: it.part.name,
          qtySold: n(it.qty), revenue: rev, cost,
        });
      }
    }

    const rows = [...map.values()].map((r) => ({
      ...r,
      revenue: +r.revenue.toFixed(3),
      cost:    +r.cost.toFixed(3),
      profit:  +(r.revenue - r.cost).toFixed(3),
      margin:  r.revenue > 0 ? +(((r.revenue - r.cost) / r.revenue) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.profit - a.profit);

    return rows.slice(0, 100);
  }

  async dailySales(tenantId: string, days = 7) {
    days = Math.min(Math.max(days, 1), 90);
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
    const sales = await this.prisma.salesInvoice.findMany({
      where: { tenantId, status: 'completed', invoiceDate: { gte: since } },
      select: { invoiceDate: true, total: true },
    });
    const buckets: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setDate(since.getDate() + i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const s of sales) {
      const k = s.invoiceDate.toISOString().slice(0, 10);
      if (k in buckets) buckets[k] = (buckets[k] ?? 0) + n(s.total);
    }
    return Object.entries(buckets).map(([date, total]) => ({ date, total: +total.toFixed(3) }));
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('pnl') @Permissions('accounting.view')
  pnl(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.profitAndLoss(tid, parseDate(from), parseDate(to));
  }

  @Get('aging/customers') @Permissions('accounting.view')
  customerAging(@Tenant() tid: string) { return this.svc.customerAging(tid); }

  @Get('aging/suppliers') @Permissions('accounting.view')
  supplierAging(@Tenant() tid: string) { return this.svc.supplierAging(tid); }

  @Get('stock-turnover') @Permissions('stock.view')
  stockTurnover(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.stockTurnover(tid, parseDate(from), parseDate(to));
  }

  @Get('profit-by-part') @Permissions('accounting.view')
  profitByPart(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.profitByPart(tid, parseDate(from), parseDate(to));
  }

  @Get('daily-sales') @Permissions('sales.view')
  dailySales(@Tenant() tid: string, @Query('days') days?: string) {
    return this.svc.dailySales(tid, days ? +days : 7);
  }

  // ─── DRILL-DOWN ENDPOINTS for clickable KPI cards ───
  @Get('details/revenue') @Permissions('accounting.view')
  detailsRevenue(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsRevenue(tid, parseDate(from), parseDate(to));
  }
  @Get('details/cogs') @Permissions('accounting.view')
  detailsCogs(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsCogs(tid, parseDate(from), parseDate(to));
  }
  @Get('details/profit') @Permissions('accounting.view')
  detailsProfit(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsProfit(tid, parseDate(from), parseDate(to));
  }
  @Get('details/expenses') @Permissions('accounting.view')
  detailsExpenses(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsExpenses(tid, parseDate(from), parseDate(to));
  }
  @Get('details/net-profit') @Permissions('accounting.view')
  detailsNetProfit(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsNetProfit(tid, parseDate(from), parseDate(to));
  }
  @Get('details/invoices') @Permissions('accounting.view')
  detailsInvoices(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsInvoices(tid, parseDate(from), parseDate(to));
  }
  @Get('details/purchases') @Permissions('accounting.view')
  detailsPurchases(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsPurchases(tid, parseDate(from), parseDate(to));
  }
  @Get('details/returns') @Permissions('accounting.view')
  detailsReturns(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsReturns(tid, parseDate(from), parseDate(to));
  }
  @Get('details/tax') @Permissions('accounting.view')
  detailsTax(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.detailsTax(tid, parseDate(from), parseDate(to));
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
