import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FifoService } from '../fifo/fifo.module';

export interface PurchaseItemInput {
  partId: string;
  qty: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  branchId: string;
  supplierId?: string;
  invoiceNo?: string;
  supplierRef?: string;
  invoiceDate?: string;
  paymentType?: 'cash' | 'credit' | 'card' | 'bank' | 'cheque';
  attachmentUrl?: string;
  items: PurchaseItemInput[];
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fifo: FifoService,
  ) {}

  /**
   * Atomic purchase creation:
   *  - Validates supplier and parts
   *  - Creates the invoice + line items
   *  - Increments stock at the receiving branch's main warehouse
   *  - Recomputes weighted-average cost per part
   *  - Adds a stock_movement (type=purchase) per line for audit
   *  - Updates supplier balance for credit purchases (we owe them more)
   */
  async createPurchase(tenantId: string, createdBy: string, input: CreatePurchaseInput) {
    if (!input.items?.length) throw new BadRequestException('purchase has no items');

    return this.prisma.$transaction(async (tx) => {
      // Validate branch belongs to tenant first (clear error message).
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, tenantId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود أو غير مفعّل');

      // resolve target warehouse (use the branch's main warehouse if present, else any)
      const warehouse = await tx.warehouse.findFirst({
        where: { tenantId, branchId: input.branchId },
        orderBy: { isMain: 'desc' },
      });
      if (!warehouse) {
        throw new BadRequestException('لا يوجد مستودع لهذا الفرع — أنشئ مستودعاً أولاً');
      }

      // validate supplier if provided
      if (input.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, tenantId, deletedAt: null },
        });
        if (!supplier) throw new NotFoundException('المورد غير موجود');
      }

      // load all parts at once
      const partIds = input.items.map((i) => i.partId);
      const parts = await tx.part.findMany({
        where: { id: { in: partIds }, tenantId },
      });
      const partsById = new Map(parts.map((p) => [p.id, p]));

      // compute totals + build line rows
      let subtotal = 0;
      let taxTotal = 0;
      const lineRows: Prisma.PurchaseItemCreateManyInvoiceInput[] = [];

      for (const it of input.items) {
        const part = partsById.get(it.partId);
        if (!part) throw new NotFoundException(`part ${it.partId} not found`);
        if (it.qty <= 0) throw new BadRequestException('الكمية يجب أن تكون أكبر من صفر');
        if (it.unitCost < 0) throw new BadRequestException('unit cost cannot be negative');

        const lineSubtotal = +(it.unitCost * it.qty).toFixed(3);
        const lineTax = +(lineSubtotal * (Number(part.taxRate) / 100)).toFixed(3);
        subtotal += lineSubtotal;
        taxTotal += lineTax;

        lineRows.push({
          partId: part.id,
          qty: it.qty,
          unitCost: it.unitCost,
          lineTotal: lineSubtotal,
        });
      }
      const total = +(subtotal + taxTotal).toFixed(3);

      const invoiceNo = input.invoiceNo ?? (await this.nextInvoiceNo(tx, tenantId));
      const invoice = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          branchId: input.branchId,
          supplierId: input.supplierId ?? null,
          invoiceNo,
          supplierRef: input.supplierRef ?? null,
          invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
          subtotal,
          tax: taxTotal,
          total,
          paid: input.paymentType === 'credit' ? 0 : total,
          paymentType: input.paymentType ?? 'cash',
          status: 'received',
          attachmentUrl: input.attachmentUrl ?? null,
          createdBy,
          items: { create: lineRows },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      // For each item: bump stock + recompute avg cost + write stock movement
      for (let i = 0; i < input.items.length; i++) {
        const it = input.items[i]!;
        const part = partsById.get(it.partId)!;

        // upsert stock row at this warehouse
        const existing = await tx.stock.findFirst({
          where: { tenantId, warehouseId: warehouse.id, partId: it.partId },
        });
        if (existing) {
          await tx.stock.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: it.qty },
              status: 'available',
            },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId,
              branchId: input.branchId,
              warehouseId: warehouse.id,
              partId: it.partId,
              quantity: it.qty,
              status: 'available',
            },
          });
        }

        // weighted-average cost recompute across all warehouses of this tenant
        const totalOnHand = await tx.stock.aggregate({
          where: { tenantId, partId: it.partId },
          _sum: { quantity: true },
        });
        const onHand = Number(totalOnHand._sum.quantity ?? 0);
        const prevOnHand = Math.max(0, onHand - it.qty);
        const prevAvg = Number(part.avgCost);
        const newAvg = onHand > 0
          ? +(((prevAvg * prevOnHand) + (it.unitCost * it.qty)) / onHand).toFixed(3)
          : it.unitCost;

        await tx.part.update({
          where: { id: it.partId },
          data: { costPrice: it.unitCost, avgCost: newAvg },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: input.branchId,
            partId: it.partId,
            type: 'purchase',
            qtyChange: it.qty,
            unitCost: it.unitCost,
            userId: createdBy,
            refTable: 'purchase_invoices',
            refId: invoice.id,
          },
        });

        // ── FIFO: create a cost layer for this receipt ──
        // Match by (partId, qty, unitCost) — invoice.items were created via
        // `items: { create: [...] }` in the same order, so each purchase row
        // maps to exactly one persisted PurchaseItem.
        const persistedItem = invoice.items[i];
        if (persistedItem) {
          await this.fifo.createLayer(tx, {
            tenantId,
            branchId: input.branchId,
            partId: it.partId,
            purchaseItemId: persistedItem.id,
            qty: it.qty,
            unitCost: it.unitCost,
            receivedAt: invoice.invoiceDate ?? invoice.createdAt,
          });
        }
      }

      // Update supplier balance for credit purchases
      if (input.paymentType === 'credit' && input.supplierId) {
        await tx.supplier.update({
          where: { id: input.supplierId },
          data: { balance: { increment: total } },
        });
      }

      return invoice;
    });
  }

  async list(
    tenantId: string,
    scope?: string | string[] | null,
    page = 1,
    perPage = 25,
  ) {
    const branchFilter: Prisma.PurchaseInvoiceWhereInput =
      scope == null       ? {} :
      Array.isArray(scope) ? { branchId: { in: scope } } :
                             { branchId: scope };
    const where: Prisma.PurchaseInvoiceWhereInput = {
      tenantId,
      deletedAt: null,
      ...branchFilter,
    };
    const [items, total] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return { items, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  async findOne(tenantId: string, id: string) {
    const inv = await this.prisma.purchaseInvoice.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { part: { select: { id: true, sku: true, name: true } } } },
        supplier: true,
        branch: true,
        creator: { select: { id: true, fullName: true } },
      },
    });
    if (!inv) throw new NotFoundException('purchase invoice not found');
    return inv;
  }

  /** Atomic counter — see SalesService.nextInvoiceNo for explanation. */
  private async nextInvoiceNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `purchases:${year}`;
    const counter = await tx.tenantCounter.upsert({
      where: { tenantId_counterKey: { tenantId, counterKey: key } },
      update: { value: { increment: 1 } },
      create: { tenantId, counterKey: key, value: 1 },
    });
    return `PUR-${year}-${String(counter.value).padStart(4, '0')}`;
  }
}
