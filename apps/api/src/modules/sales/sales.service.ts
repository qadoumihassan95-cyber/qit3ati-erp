import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FifoService } from '../fifo/fifo.module';

export interface CartItem {
  partId: string;
  qty: number;
  unitPrice?: number;  // optional override; defaults to part.retailPrice (or wholesale by customer tier)
  discount?: number;
}

export interface CreateSaleInput {
  branchId: string;
  customerId?: string;
  posSessionId?: string;
  paymentType?: 'cash' | 'credit' | 'card' | 'bank' | 'cheque';
  discount?: number;
  items: CartItem[];
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fifo: FifoService,
  ) {}

  async createSale(tenantId: string, soldBy: string, input: CreateSaleInput) {
    if (!input.items?.length) throw new BadRequestException('السلّة فارغة');

    // Atomic: read prices/stock, build invoice, decrement stock, write movements.
    const invoice = await this.prisma.$transaction(async (tx) => {
      // Validate branch belongs to tenant (prevents misleading "insufficient stock"
      // errors when the branchId is invalid or from another tenant).
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, tenantId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود أو غير مفعّل');

      const tenant = await tx.tenantSettings.findUnique({ where: { tenantId } });
      const taxRate = Number(tenant?.taxRate ?? 16);

      const customer = input.customerId
        ? await tx.customer.findFirst({ where: { id: input.customerId, tenantId } })
        : null;
      if (input.customerId && !customer) throw new NotFoundException('العميل غير موجود');

      // pull all parts at once + their stock at the branch
      const partIds = input.items.map((i) => i.partId);
      const parts = await tx.part.findMany({
        where: { id: { in: partIds }, tenantId },
        include: { stocks: { where: { branchId: input.branchId } } },
      });
      const byId = new Map(parts.map((p) => [p.id, p]));

      let subtotal = 0;
      const itemRows: Prisma.SalesItemCreateManyInvoiceInput[] = [];
      const movements: Prisma.StockMovementUncheckedCreateInput[] = [];

      for (const it of input.items) {
        const part = byId.get(it.partId);
        if (!part) throw new NotFoundException(`القطعة ${it.partId} غير موجودة`);
        if (it.qty <= 0) throw new BadRequestException(`الكمية يجب أن تكون أكبر من صفر`);

        // NOTE: real stock availability is validated atomically below via
        // `updateMany ... where quantity >= qty`. The check here is a fast
        // pre-flight using the snapshot we already loaded — concurrent sales
        // will still be caught at decrement time.
        const stock = part.stocks[0];
        const snapshotAvailable = stock ? Number(stock.quantity) - Number(stock.reserved) : 0;
        if (snapshotAvailable < it.qty) {
          throw new BadRequestException(`الكمية غير كافية لـ ${part.name} (المتوفر ${snapshotAvailable}، المطلوب ${it.qty})`);
        }

        const tier = customer?.priceTier ?? 'retail';
        const base = it.unitPrice ?? (tier === 'wholesale'
          ? Number(part.wholesalePrice)
          : Number(part.retailPrice));
        const discount = it.discount ?? 0;
        const lineTotal = (base - discount) * it.qty;
        subtotal += lineTotal;

        itemRows.push({
          partId: part.id,
          qty: it.qty,
          unitPrice: base,
          unitCost: Number(part.avgCost),
          discount,
          lineTotal,
          warrantyUntil: part.warrantyMonths
            ? new Date(Date.now() + part.warrantyMonths * 30 * 24 * 3600 * 1000)
            : null,
        });

        // decrement stock at branch (we'll do it after creating the invoice for ref id)
        movements.push({
          tenantId, branchId: input.branchId, partId: part.id,
          type: 'sale', qtyChange: -it.qty,
          unitCost: Number(part.avgCost), userId: soldBy,
        });
      }

      const globalDiscount = input.discount ?? 0;
      const taxable = Math.max(0, subtotal - globalDiscount);
      const tax = +(taxable * (taxRate / 100)).toFixed(3);
      const total = +(taxable + tax).toFixed(3);

      const invoiceNo = await this.nextInvoiceNo(tx, tenantId);
      const invoice = await tx.salesInvoice.create({
        data: {
          tenantId, branchId: input.branchId,
          customerId: input.customerId ?? null,
          posSessionId: input.posSessionId ?? null,
          invoiceNo, subtotal, discount: globalDiscount, tax, total,
          paid: input.paymentType === 'credit' ? 0 : total,
          paymentType: input.paymentType ?? 'cash',
          status: 'completed',
          soldBy,
          items: { create: itemRows },
        },
        include: { items: true },
      });

      // ATOMIC stock decrement — only succeeds if quantity is still sufficient
      // at the moment of the UPDATE. This eliminates the read-then-write race
      // where N concurrent sales each see the same snapshot and all "pass" the
      // pre-flight check.
      //
      // `updateMany ... where: { quantity: { gte: qty } }` returns count = 1
      // only if a matching row was updated. If two concurrent calls race for
      // the last unit, exactly one wins. The loser sees count = 0 → we throw.
      for (let i = 0; i < input.items.length; i++) {
        const it = input.items[i]!;
        const result = await tx.stock.updateMany({
          where: {
            tenantId, branchId: input.branchId, partId: it.partId,
            quantity: { gte: it.qty },     // ← atomicity gate
          },
          data: { quantity: { decrement: it.qty } },
        });
        if (result.count === 0) {
          const partName = byId.get(it.partId)?.name ?? it.partId;
          throw new BadRequestException(`الكمية غير كافية لـ ${partName} — نفدت بعد التحقّق الأوّلي`);
        }
        await tx.stockMovement.create({
          data: { ...movements[i]!, refTable: 'sales_invoices', refId: invoice.id },
        });

        // ── FIFO: consume oldest cost layers for this sale line ──
        // Records FifoConsumption rows tying this SalesItem to the exact
        // purchase batches it drew from — enables per-invoice profit
        // breakdown ("How was this calculated?" in the UI).
        const persistedItem = invoice.items[i];
        const part = byId.get(it.partId)!;
        if (persistedItem) {
          const result = await this.fifo.consumeForSale(tx, {
            tenantId,
            branchId: input.branchId,
            partId: it.partId,
            salesItemId: persistedItem.id,
            qty: Number(it.qty),
            fallbackUnitCost: Number(part.avgCost),
          });
          // Refine the unit_cost stored on the SalesItem with the actual
          // FIFO-weighted cost so downstream reports (profitability,
          // gross margin) are accurate rather than a rough avgCost snapshot.
          if (result.layers.length > 0 && Math.abs(result.weightedUnitCost - Number(persistedItem.unitCost ?? 0)) > 0.001) {
            await tx.salesItem.update({
              where: { id: persistedItem.id },
              data:  { unitCost: result.weightedUnitCost },
            });
          }
        }
      }

      // customer balance update for credit sales
      if (input.paymentType === 'credit' && customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { balance: { increment: total } },
        });
      }

      return invoice;
    });

    // ---- Fire-and-forget JoFotara auto-send (does NOT block the response) ----
    // We check the config OUTSIDE the transaction. If autoSendOnSale=true and
    // creds are configured, we kick off a background submit. Failures are
    // logged but never propagate to the caller — the sale itself is already
    // committed and the operator can re-submit manually from /jofotara.
    this.maybeAutoSubmitJofotara(tenantId, soldBy, invoice.id).catch((e) => {
      this.logger.warn(`JoFotara auto-send skipped for ${invoice.id}: ${e?.message ?? e}`);
    });

    return invoice;
  }

  /**
   * If JoFotara auto-send is on, mark the freshly-created invoice as `queued`.
   * The actual HTTP submission happens via the operator pressing "إرسال" on
   * the /invoices page, or via a future background worker that processes the
   * `queued` queue. We deliberately do NOT call JofotaraService from here —
   * doing so would couple SalesModule to JofotaraModule at compile time and
   * risk circular imports / build failures as both modules grow.
   */
  private async maybeAutoSubmitJofotara(tenantId: string, _userId: string, invoiceId: string) {
    const cfg = await this.prisma.jofotaraConfig.findUnique({
      where: { tenantId },
      select: { autoSendOnSale: true, clientId: true, secretEncrypted: true },
    });
    if (!cfg?.autoSendOnSale || !cfg.clientId || !cfg.secretEncrypted) return;

    // Mark the invoice as queued so the UI shows "بانتظار الإرسال" immediately
    // and the operator (or a future cron worker) can pick it up from /jofotara.
    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data:  { jofotaraStatus: 'queued' },
    }).catch(() => undefined);
  }

  /**
   * Atomic invoice numbering using a per-tenant counter row.
   * Prisma's `upsert` uses INSERT ... ON CONFLICT DO UPDATE under the hood,
   * giving us a row-level lock per (tenantId, counterKey). Two concurrent
   * sales create distinct INV-YYYY-XXXX numbers — no race condition.
   */
  private async nextInvoiceNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `sales:${year}`;
    const counter = await tx.tenantCounter.upsert({
      where: { tenantId_counterKey: { tenantId, counterKey: key } },
      update: { value: { increment: 1 } },
      create: { tenantId, counterKey: key, value: 1 },
    });
    return `INV-${year}-${String(counter.value).padStart(4, '0')}`;
  }

  async list(tenantId: string, branchId?: string, page = 1, perPage = 25) {
    const [items, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { tenantId, ...(branchId ? { branchId } : {}) },
        include: { customer: { select: { id: true, name: true } }, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage, take: perPage,
      }),
      this.prisma.salesInvoice.count({ where: { tenantId, ...(branchId ? { branchId } : {}) } }),
    ]);
    return { items, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  async findOne(tenantId: string, id: string) {
    const inv = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { part: true } },
        customer: true,
        branch: true,
        seller: { select: { id: true, fullName: true } },
      },
    });
    if (!inv) throw new NotFoundException('الفاتورة غير موجودة');
    return inv;
  }
}
