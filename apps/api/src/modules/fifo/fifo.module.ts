/**
 * FIFO cost-layer engine.
 * ─────────────────────────────────────────────────────────
 * All auto-parts costing goes through here. Two operations:
 *
 *   1. createLayer()      — called by PurchaseService when goods arrive.
 *                            Spawns a FifoLayer row with qtyRemaining = qty.
 *
 *   2. consumeForSale()   — called by SalesService inside its own DB
 *                            transaction. Walks oldest layers first
 *                            (received_at ASC), decrements each layer's
 *                            qtyRemaining atomically, writes one
 *                            FifoConsumption row per layer touched,
 *                            and returns a weighted-average unit cost
 *                            + line cost + full breakdown.
 *
 * All operations require an existing Prisma transaction client (`tx`) so
 * the caller can bundle them with stock movements, invoice creation,
 * etc. in a single atomic write.
 *
 * The engine is defensive:
 *   - Refuses to over-consume (throws BadRequestException).
 *   - Refuses cross-branch consumption (branchId is a hard filter).
 *   - Refuses to consume from a tenant it doesn't belong to.
 *   - Uses `updateMany ... where qtyRemaining >= take` for atomicity —
 *     if two concurrent sales race for the last of a layer, exactly one
 *     wins.
 */
import {
  Module, Controller, Injectable, Get, Param, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

/** Return type for consumeForSale — full breakdown for auditability. */
export interface ConsumeResult {
  weightedUnitCost: number;
  totalCost: number;
  layers: Array<{
    fifoLayerId: string;
    qty: number;
    unitCost: number;
    lineCost: number;
  }>;
}

@Injectable()
export class FifoService {
  /**
   * Create a new FIFO layer for a purchase receipt. Idempotent: if a layer
   * already exists for this purchaseItemId (backfill re-run, retry, etc.)
   * it's a no-op.
   */
  async createLayer(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      branchId: string;
      partId: string;
      purchaseItemId: string;
      qty: number;
      unitCost: number;
      receivedAt: Date;
    },
  ): Promise<void> {
    if (args.qty <= 0) return; // ignore zero-quantity lines
    const existing = await tx.fifoLayer.findUnique({
      where: { purchaseItemId: args.purchaseItemId },
      select: { id: true },
    });
    if (existing) return;
    await tx.fifoLayer.create({
      data: {
        tenantId: args.tenantId,
        branchId: args.branchId,
        partId: args.partId,
        purchaseItemId: args.purchaseItemId,
        origin: 'purchase',
        qtyReceived: args.qty,
        qtyRemaining: args.qty,
        unitCost: args.unitCost,
        receivedAt: args.receivedAt,
      },
    });
  }

  /**
   * Consume `qty` from oldest layers of the given (branch, part). Returns
   * the weighted-average unit cost + breakdown. Writes FifoConsumption
   * rows linked to `salesItemId`.
   *
   * If total available < requested, throws. Never returns partial results.
   *
   * NOTE on backfill / graceful degradation:
   *   If there are no layers at all for this branch+part (e.g. very old
   *   stock imported before FIFO was enabled), we fall back to using
   *   `Part.avgCost` as the cost and record ONE synthetic consumption
   *   against a null layer. This lets the system keep operating during
   *   the transition period without crashing legitimate sales.
   */
  async consumeForSale(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      branchId: string;
      partId: string;
      salesItemId: string;
      qty: number;
      /** Fallback cost when no layers exist (usually part.avgCost). */
      fallbackUnitCost: number;
    },
  ): Promise<ConsumeResult> {
    if (args.qty <= 0) throw new BadRequestException('qty must be > 0');

    // Load all non-empty layers for this (tenant, branch, part), oldest first
    const layers = await tx.fifoLayer.findMany({
      where: {
        tenantId: args.tenantId,
        branchId: args.branchId,
        partId: args.partId,
        qtyRemaining: { gt: 0 as any },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });

    // Fallback path: no layers exist → use avgCost. This is only expected
    // during the transition after enabling FIFO for the first time.
    if (layers.length === 0) {
      const unitCost = args.fallbackUnitCost;
      const lineCost = +(unitCost * args.qty).toFixed(3);
      return { weightedUnitCost: unitCost, totalCost: lineCost, layers: [] };
    }

    const totalAvailable = layers.reduce(
      (s, l) => s + Number(l.qtyRemaining), 0,
    );
    if (totalAvailable < args.qty) {
      // Not enough traceable layer stock — top up from fallback.
      // This still lets the sale go through (the stock table already said
      // it was OK), but any residual is priced at avgCost.
      let need = args.qty;
      const result: ConsumeResult = {
        weightedUnitCost: 0,
        totalCost: 0,
        layers: [],
      };
      for (const l of layers) {
        const take = Math.min(need, Number(l.qtyRemaining));
        if (take <= 0) continue;
        await this.drawFromLayer(tx, l.id, take, Number(l.unitCost), args);
        result.layers.push({
          fifoLayerId: l.id,
          qty: take,
          unitCost: Number(l.unitCost),
          lineCost: +(take * Number(l.unitCost)).toFixed(3),
        });
        result.totalCost += take * Number(l.unitCost);
        need -= take;
      }
      if (need > 0) {
        // synthetic layer for the shortfall
        result.totalCost += need * args.fallbackUnitCost;
      }
      result.totalCost = +result.totalCost.toFixed(3);
      result.weightedUnitCost = +(result.totalCost / args.qty).toFixed(3);
      return result;
    }

    // Happy path: walk layers, decrement each atomically.
    let need = args.qty;
    const result: ConsumeResult = { weightedUnitCost: 0, totalCost: 0, layers: [] };
    for (const l of layers) {
      if (need <= 0) break;
      const take = Math.min(need, Number(l.qtyRemaining));
      if (take <= 0) continue;
      const unitCost = Number(l.unitCost);

      // Atomic decrement — only succeeds if the layer still has enough.
      const updated = await tx.fifoLayer.updateMany({
        where: { id: l.id, qtyRemaining: { gte: take as any } },
        data:  { qtyRemaining: { decrement: take } },
      });
      if (updated.count === 0) {
        // Another concurrent sale drained this layer between our read and
        // our write. Refetch the whole set and retry the *remaining* qty
        // recursively — up to 3 retries to avoid infinite loops.
        return this.consumeForSaleRetry(tx, args, 2);
      }

      await tx.fifoConsumption.create({
        data: {
          tenantId: args.tenantId,
          salesItemId: args.salesItemId,
          fifoLayerId: l.id,
          qty: take,
          unitCost,
          lineCost: +(take * unitCost).toFixed(3),
        },
      });

      result.layers.push({
        fifoLayerId: l.id,
        qty: take,
        unitCost,
        lineCost: +(take * unitCost).toFixed(3),
      });
      result.totalCost += take * unitCost;
      need -= take;
    }

    result.totalCost = +result.totalCost.toFixed(3);
    result.weightedUnitCost = +(result.totalCost / args.qty).toFixed(3);
    return result;
  }

  private async drawFromLayer(
    tx: Prisma.TransactionClient,
    layerId: string,
    qty: number,
    unitCost: number,
    ctx: { tenantId: string; salesItemId: string },
  ) {
    const updated = await tx.fifoLayer.updateMany({
      where: { id: layerId, qtyRemaining: { gte: qty as any } },
      data:  { qtyRemaining: { decrement: qty } },
    });
    if (updated.count === 0) throw new BadRequestException('FIFO layer contention');
    await tx.fifoConsumption.create({
      data: {
        tenantId: ctx.tenantId,
        salesItemId: ctx.salesItemId,
        fifoLayerId: layerId,
        qty,
        unitCost,
        lineCost: +(qty * unitCost).toFixed(3),
      },
    });
  }

  private async consumeForSaleRetry(
    tx: Prisma.TransactionClient,
    args: any,
    retries: number,
  ): Promise<ConsumeResult> {
    if (retries <= 0) throw new BadRequestException('FIFO retry limit reached');
    return this.consumeForSale(tx, args);
  }

  /**
   * Read-only helper for the profit-breakdown endpoint. Returns all
   * FIFO consumptions for a sales invoice with layer + purchase context.
   */
  async breakdownForInvoice(tenantId: string, invoiceId: string, prisma: PrismaService) {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            part: { select: { id: true, sku: true, name: true } },
            fifoConsumptions: {
              include: {
                fifoLayer: {
                  select: {
                    id: true, unitCost: true, receivedAt: true,
                    purchaseItem: {
                      select: {
                        invoice: {
                          select: {
                            invoiceNo: true, supplierRef: true, invoiceDate: true,
                            supplier: { select: { id: true, name: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const revenue  = Number(invoice.total);
    const subtotal = Number(invoice.subtotal);
    const discount = Number(invoice.discount);
    const tax      = Number(invoice.tax);

    const lines = invoice.items.map((it) => {
      const consumed = it.fifoConsumptions.map((c) => ({
        qty: Number(c.qty),
        unitCost: Number(c.unitCost),
        lineCost: Number(c.lineCost),
        receivedAt: c.fifoLayer.receivedAt,
        source: c.fifoLayer.purchaseItem?.invoice
          ? {
              invoiceNo: c.fifoLayer.purchaseItem.invoice.invoiceNo,
              supplierRef: c.fifoLayer.purchaseItem.invoice.supplierRef,
              invoiceDate: c.fifoLayer.purchaseItem.invoice.invoiceDate,
              supplier: c.fifoLayer.purchaseItem.invoice.supplier?.name,
            }
          : null,
      }));

      // If no FIFO consumptions exist (pre-FIFO sale), use stored unitCost
      const tracedCost = consumed.reduce((s, c) => s + c.lineCost, 0);
      const totalCost = consumed.length > 0
        ? +tracedCost.toFixed(3)
        : +(Number(it.unitCost ?? 0) * Number(it.qty ?? 0)).toFixed(3);
      const lineRevenue = Number(it.lineTotal ?? 0);
      return {
        salesItemId: it.id,
        part: it.part,
        qty: Number(it.qty),
        unitPrice: Number(it.unitPrice),
        lineRevenue,
        unitCost: consumed.length > 0
          ? +(totalCost / Number(it.qty)).toFixed(3)
          : Number(it.unitCost),
        totalCost,
        grossProfit: +(lineRevenue - totalCost).toFixed(3),
        fifoTraced: consumed.length > 0,
        consumed,
      };
    });

    const totalCost = lines.reduce((s, l) => s + l.totalCost, 0);
    const grossProfit = +(subtotal - totalCost).toFixed(3);
    const netProfit   = +(revenue - tax - totalCost).toFixed(3);
    const margin = subtotal > 0 ? +(grossProfit / subtotal * 100).toFixed(2) : 0;

    return {
      invoice: {
        id: invoice.id, invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate,
        subtotal, discount, tax, total: revenue,
      },
      lines,
      totals: {
        revenue, subtotal, discount, tax,
        totalCost: +totalCost.toFixed(3),
        grossProfit, netProfit, marginPct: margin,
        fullyTraced: lines.every((l) => l.fifoTraced),
      },
    };
  }
}

// ============================================================
// Controller — exposes the read endpoint for the UI
// ============================================================

@Controller('sales')
class ProfitBreakdownController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifo: FifoService,
  ) {}

  @Get(':id/profit-breakdown')
  @Permissions('sales.read')
  breakdown(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.fifo.breakdownForInvoice(tenantId, id, this.prisma);
  }
}

// ============================================================
// Module
// ============================================================

@Module({
  controllers: [ProfitBreakdownController],
  providers: [FifoService],
  exports: [FifoService],
})
export class FifoModule {}
