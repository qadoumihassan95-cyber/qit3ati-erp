import { Module, Controller, Get, Query, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { Prisma } from '@prisma/client';

/** Parse a YYYY-MM-DD date string. Returns Date or undefined. */
function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

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
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = from;
    if (to)   dateFilter.lte = to;
    const invoiceWhere: Prisma.SalesInvoiceWhereInput = {
      tenantId, status: 'completed',
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

    const revenue = Number(salesAgg._sum.subtotal ?? 0) - Number(salesAgg._sum.discount ?? 0);
    const cogs = items.reduce((s, l) => s + Number(l.unitCost ?? 0) * Number(l.qty ?? 0), 0);
    const expenses = Number(expAgg._sum.amount ?? 0);
    const returns = Number(retAgg._sum.total ?? 0);
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
      salesCount:   salesAgg._count,
      purchasesTotal: Number(purAgg._sum.total ?? 0),
      purchasesCount: purAgg._count,
      taxCollected: Number(salesAgg._sum.tax ?? 0),
    };
  }

  /**
   * Customer ageing — how old is each receivable.
   * Buckets: 0-30, 31-60, 61-90, 90+ days based on last unpaid invoice date.
   */
  async customerAging(tenantId: string) {
    // get all customers with balance > 0, plus their oldest unpaid credit invoice
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null, balance: { gt: 0 } },
      select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
    });

    const result = await Promise.all(customers.map(async (c) => {
      // find oldest credit, unpaid invoice
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
        balance: Number(c.balance),
        creditLimit: Number(c.creditLimit),
        oldestInvoice: oldest?.invoiceNo,
        oldestInvoiceDate: oldest?.invoiceDate?.toISOString(),
        daysOld,
        bucket,
      };
    }));

    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of result) buckets[r.bucket as '0-30'|'31-60'|'61-90'|'90+'] += r.balance;

    return {
      customers: result.sort((a, b) => b.balance - a.balance),
      summary: buckets,
      totalReceivables: result.reduce((s, r) => s + r.balance, 0),
    };
  }

  /**
   * Supplier ageing (what we owe).
   */
  async supplierAging(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null, balance: { gt: 0 } },
      select: { id: true, name: true, phone: true, balance: true },
    });
    return {
      suppliers: suppliers.map((s) => ({ ...s, balance: Number(s.balance) }))
                          .sort((a, b) => b.balance - a.balance),
      totalPayables: suppliers.reduce((s, x) => s + Number(x.balance), 0),
    };
  }

  /**
   * Stock turnover — how fast parts are moving.
   * Returns top sold parts in the period + slow movers (sold ≤ 1).
   */
  async stockTurnover(tenantId: string, from?: Date, to?: Date) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = from;
    if (to)   dateFilter.lte = to;
    const where: Prisma.StockMovementWhereInput = {
      tenantId, type: 'sale',
      ...(from || to ? { createdAt: dateFilter } : {}),
    };

    // movements give us qty sold per part
    const movements = await this.prisma.stockMovement.groupBy({
      by: ['partId'],
      where,
      _sum: { qtyChange: true },
    });

    // load parts + current stock
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
        onHand: p.stocks.reduce((s, st) => s + Number(st.quantity), 0),
        cost: Number(p.avgCost),
      },
    ]));

    const enriched = movements.map((m) => {
      const info = stocksByPart.get(m.partId);
      const sold = Math.abs(Number(m._sum.qtyChange ?? 0));
      return {
        partId: m.partId,
        name: info?.name ?? '?',
        sku: info?.sku ?? '?',
        sold,
        onHand: info?.onHand ?? 0,
        valueAtCost: +(((info?.onHand ?? 0) * (info?.cost ?? 0))).toFixed(3),
      };
    });

    // also find parts with stock but ZERO sales in the period
    const partsWithStock = await this.prisma.part.findMany({
      where: { tenantId, deletedAt: null, isActive: true, id: { notIn: partIds } },
      include: { stocks: true },
      take: 200,
    });
    const deadStock = partsWithStock
      .map((p) => ({
        partId: p.id, name: p.name, sku: p.sku,
        onHand: p.stocks.reduce((s, st) => s + Number(st.quantity), 0),
        valueAtCost: +(p.stocks.reduce((s, st) => s + Number(st.quantity), 0) * Number(p.avgCost)).toFixed(3),
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

  /**
   * Profit-by-part report. Reads sales_items and computes margin per part.
   */
  async profitByPart(tenantId: string, from?: Date, to?: Date) {
    const dateFilter: Prisma.DateTimeFilter = {};
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
      const rev = (Number(it.unitPrice ?? 0) - Number(it.discount ?? 0)) * Number(it.qty ?? 0);
      const cost = Number(it.unitCost ?? 0) * Number(it.qty ?? 0);
      const existing = map.get(key);
      if (existing) {
        existing.qtySold += Number(it.qty ?? 0);
        existing.revenue += rev;
        existing.cost    += cost;
      } else {
        map.set(key, {
          partId: it.part.id, sku: it.part.sku, name: it.part.name,
          qtySold: Number(it.qty ?? 0), revenue: rev, cost,
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

  /**
   * Daily sales — last N days summary for charting.
   */
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
      if (k in buckets) buckets[k]! += Number(s.total ?? 0);
    }
    return Object.entries(buckets).map(([date, total]) => ({ date, total: +total.toFixed(3) }));
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('pnl')
  @Permissions('accounting.view')
  pnl(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.profitAndLoss(tid, parseDate(from), parseDate(to));
  }

  @Get('aging/customers')
  @Permissions('accounting.view')
  customerAging(@Tenant() tid: string) {
    return this.svc.customerAging(tid);
  }

  @Get('aging/suppliers')
  @Permissions('accounting.view')
  supplierAging(@Tenant() tid: string) {
    return this.svc.supplierAging(tid);
  }

  @Get('stock-turnover')
  @Permissions('stock.view')
  stockTurnover(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.stockTurnover(tid, parseDate(from), parseDate(to));
  }

  @Get('profit-by-part')
  @Permissions('accounting.view')
  profitByPart(@Tenant() tid: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.profitByPart(tid, parseDate(from), parseDate(to));
  }

  @Get('daily-sales')
  @Permissions('sales.view')
  dailySales(@Tenant() tid: string, @Query('days') days?: string) {
    return this.svc.dailySales(tid, days ? +days : 7);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
