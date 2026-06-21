import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PartSearchQuery {
  q?: string;          // free text
  categoryId?: string;
  status?: string;
  branchId?: string;
  page?: number;
  perPage?: number;
}

@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Smart search: matches name, SKU, partNumber, OEM, barcode, and alt numbers.
   */
  async search(tenantId: string, q: PartSearchQuery) {
    const page    = Math.max(1, q.page ?? 1);
    const perPage = Math.min(100, Math.max(5, q.perPage ?? 25));

    // Strip control characters and null bytes (\x00..\x1F + \x7F).
    // Postgres rejects \x00 inside text params and Prisma surfaces it as
    // a fatal cannot-connect error — effectively a 1-byte DoS vector.
    // Also cap the length so a 100KB query string can't pin a connection.
    const text = (q.q ?? '')
      .toString()
      .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
      .slice(0, 120)
      .trim();
    const where: Prisma.PartWhereInput = {
      tenantId,
      deletedAt: null,
      isActive: true,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(text
        ? {
            OR: [
              { name:          { contains: text, mode: 'insensitive' } },
              { nameEn:        { contains: text, mode: 'insensitive' } },
              { sku:           { contains: text, mode: 'insensitive' } },
              { partNumber:    { contains: text, mode: 'insensitive' } },
              { oemNumber:     { contains: text, mode: 'insensitive' } },
              { barcode:       { contains: text, mode: 'insensitive' } },
              { manufacturer:  { contains: text, mode: 'insensitive' } },
              { countryOrigin: { contains: text, mode: 'insensitive' } },
              { numbers:       { some: { number: { contains: text, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.part.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          stocks: q.branchId
            ? { where: { branchId: q.branchId } }
            : true,
          // pull the primary image (or, if none flagged, the first one) for the thumbnail
          images: {
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
            take: 1,
            select: { id: true, url: true, isPrimary: true },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.part.count({ where }),
    ]);

    return {
      items: items.map((p) => {
        const totalQty = p.stocks.reduce((s, st) => s + Number(st.quantity), 0);
        const minStock = Number(p.minStock);
        const status =
          totalQty <= 0 ? 'out' :
          totalQty < minStock ? 'low' :
          'available';
        return {
          id: p.id, sku: p.sku, name: p.name, nameEn: p.nameEn,
          partNumber: p.partNumber, oemNumber: p.oemNumber, barcode: p.barcode,
          manufacturer: p.manufacturer, countryOrigin: p.countryOrigin, unit: p.unit,
          costPrice: Number(p.costPrice), avgCost: Number(p.avgCost),
          retailPrice: Number(p.retailPrice), wholesalePrice: Number(p.wholesalePrice),
          minStock, warrantyMonths: p.warrantyMonths, taxRate: Number(p.taxRate),
          category: p.category, quantity: totalQty, status,
          imageUrl: p.images[0]?.url ?? null,
        };
      }),
      page, perPage, total,
      pages: Math.ceil(total / perPage),
    };
  }

  async findOne(tenantId: string, id: string) {
    const part = await this.prisma.part.findFirst({
      // also filter deletedAt — soft-deleted parts must not leak via GET /:id
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        numbers: true,
        compats: { include: { make: true, model: true } },
        images: true,
        stocks: { include: { branch: true, warehouse: true } },
        substitutesA: { include: { substitute: { select: { id: true, sku: true, name: true, retailPrice: true } } } },
      },
    });
    if (!part) throw new NotFoundException('القطعة غير موجودة');
    return part;
  }

  /**
   * Aggregated 360° view of a single part — for the details modal.
   * One endpoint = one network call from the UI = instant render.
   * Returns:
   *   - base info + image + status
   *   - per-branch stock breakdown
   *   - last purchase (price + supplier + date)
   *   - last sale (date + customer + qty)
   *   - lifetime totals (qty sold, revenue, cost, profit)
   *   - last 20 sales invoices the part appeared in
   *   - last 20 purchase invoices
   *   - last 30 stock movements (chronological audit trail)
   *   - low-stock alert flag
   *
   * Tenant-scoped at every join — no cross-tenant leakage.
   */
  async fullDetails(tenantId: string, id: string) {
    // 1) The part itself + stock + last 1 image + alternative/compatible parts
    const part = await this.prisma.part.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        stocks:   {
          include: {
            branch:    { select: { id: true, name: true, code: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
        images: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }] },
        // Cross-part substitutes (e.g. اِستعمل هذه القطعة بدلاً من تلك)
        substitutesA: {
          include: {
            substitute: {
              select: {
                id: true, sku: true, name: true, partNumber: true,
                retailPrice: true, manufacturer: true,
              },
            },
          },
        },
      },
    });
    if (!part) throw new NotFoundException('القطعة غير موجودة');

    // Run everything else in parallel — 7 independent queries
    const [
      lastPurchaseItem,
      lastSaleItem,
      salesTotals,
      salesItems,
      purchaseItems,
      movements,
      avgCostRow,
    ] = await Promise.all([
      // Last purchase line for this part (with supplier + date)
      this.prisma.purchaseItem.findFirst({
        where: { partId: id, invoice: { tenantId, deletedAt: null } },
        include: {
          invoice: {
            select: {
              id: true, invoiceNo: true, invoiceDate: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { invoice: { invoiceDate: 'desc' } },
      }),

      // Last sale line
      this.prisma.salesItem.findFirst({
        where: { partId: id, invoice: { tenantId, deletedAt: null } },
        include: {
          invoice: {
            select: {
              id: true, invoiceNo: true, invoiceDate: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { invoice: { invoiceDate: 'desc' } },
      }),

      // Lifetime sold qty + revenue
      this.prisma.salesItem.aggregate({
        where: { partId: id, invoice: { tenantId, deletedAt: null } },
        _sum: { qty: true, lineTotal: true },
        _count: true,
      }),

      // Last 20 sales invoices (with customer + line qty/price)
      this.prisma.salesItem.findMany({
        where: { partId: id, invoice: { tenantId, deletedAt: null } },
        include: {
          invoice: {
            select: {
              id: true, invoiceNo: true, invoiceDate: true,
              customer: { select: { id: true, name: true } },
              paymentType: true,
            },
          },
        },
        orderBy: { invoice: { invoiceDate: 'desc' } },
        take: 20,
      }),

      // Last 20 purchase invoices
      this.prisma.purchaseItem.findMany({
        where: { partId: id, invoice: { tenantId, deletedAt: null } },
        include: {
          invoice: {
            select: {
              id: true, invoiceNo: true, invoiceDate: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { invoice: { invoiceDate: 'desc' } },
        take: 20,
      }),

      // Last 30 stock movements (audit trail)
      this.prisma.stockMovement.findMany({
        where: { tenantId, partId: id },
        include: {
          branch: { select: { id: true, name: true } },
          user:   { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),

      // Average cost (for profit calc) — use part.avgCost if maintained,
      // otherwise compute from purchase history. We use the stored avgCost.
      this.prisma.part.findUnique({
        where: { id }, select: { avgCost: true, costPrice: true },
      }),
    ]);

    // ---- Derived calculations ----
    const totalQuantity = part.stocks.reduce((s, st) => s + Number(st.quantity), 0);
    const minStock      = Number(part.minStock);
    const isLowStock    = totalQuantity > 0 && totalQuantity < minStock;
    const isOutOfStock  = totalQuantity <= 0;

    const totalSoldQty   = Number(salesTotals._sum.qty ?? 0);
    const totalRevenue   = Number(salesTotals._sum.lineTotal ?? 0);
    const avgCost        = Number(avgCostRow?.avgCost ?? avgCostRow?.costPrice ?? part.costPrice ?? 0);
    const totalCost      = totalSoldQty * avgCost;
    const totalProfit    = totalRevenue - totalCost;
    const profitMargin   = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      // --- Identity ---
      id:           part.id,
      sku:          part.sku,
      name:         part.name,
      nameEn:       part.nameEn,
      partNumber:   part.partNumber,
      oemNumber:    part.oemNumber,
      barcode:      part.barcode,
      manufacturer: part.manufacturer,
      countryOrigin: part.countryOrigin,
      unit:         part.unit,
      category:     part.category,
      imageUrl:     part.images[0]?.url ?? null,
      images:       part.images.map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary })),

      // --- Pricing ---
      costPrice:      Number(part.costPrice),
      avgCost:        avgCost,
      retailPrice:    Number(part.retailPrice),
      wholesalePrice: Number(part.wholesalePrice),
      taxRate:        Number(part.taxRate),

      // --- Stock ---
      totalQuantity,
      minStock,
      isLowStock,
      isOutOfStock,
      status: isOutOfStock ? 'out' : isLowStock ? 'low' : 'available',
      stockByBranch: part.stocks.map((s) => ({
        branchId:    s.branchId,
        branchName:  s.branch?.name ?? '—',
        branchCode:  s.branch?.code ?? null,
        warehouse:   s.warehouse?.name ?? null,
        quantity:    Number(s.quantity),
        reserved:    Number(s.reserved),
        available:   Number(s.quantity) - Number(s.reserved),
        location:    s.location,
      })),

      // --- Last transactions ---
      lastPurchase: lastPurchaseItem ? {
        invoiceId:    lastPurchaseItem.invoice.id,
        invoiceNo:    lastPurchaseItem.invoice.invoiceNo,
        invoiceDate:  lastPurchaseItem.invoice.invoiceDate,
        supplier:     lastPurchaseItem.invoice.supplier,
        qty:          Number(lastPurchaseItem.qty ?? 0),
        unitCost:     Number(lastPurchaseItem.unitCost ?? 0),
      } : null,
      lastSale: lastSaleItem ? {
        invoiceId:   lastSaleItem.invoice.id,
        invoiceNo:   lastSaleItem.invoice.invoiceNo,
        invoiceDate: lastSaleItem.invoice.invoiceDate,
        customer:    lastSaleItem.invoice.customer,
        qty:         Number(lastSaleItem.qty ?? 0),
        unitPrice:   Number(lastSaleItem.unitPrice ?? 0),
      } : null,

      // --- Lifetime aggregates ---
      totalSoldQty,
      totalSalesCount: Number(salesTotals._count ?? 0),
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,   // percent

      // --- Lists ---
      salesInvoices: salesItems.map((it) => ({
        invoiceId:   it.invoice.id,
        invoiceNo:   it.invoice.invoiceNo,
        invoiceDate: it.invoice.invoiceDate,
        customer:    it.invoice.customer,
        paymentType: it.invoice.paymentType,
        qty:         Number(it.qty ?? 0),
        unitPrice:   Number(it.unitPrice ?? 0),
        lineTotal:   Number(it.lineTotal ?? 0),
      })),
      purchaseInvoices: purchaseItems.map((it) => ({
        invoiceId:   it.invoice.id,
        invoiceNo:   it.invoice.invoiceNo,
        invoiceDate: it.invoice.invoiceDate,
        supplier:    it.invoice.supplier,
        qty:         Number(it.qty ?? 0),
        unitCost:    Number(it.unitCost ?? 0),
      })),
      movements: movements.map((m) => ({
        id:        m.id.toString(),
        type:      m.type,
        qtyChange: Number(m.qtyChange ?? 0),
        unitCost:  Number(m.unitCost ?? 0),
        refTable:  m.refTable,
        refId:     m.refId,
        branchName: m.branch?.name ?? null,
        userName:  m.user?.fullName ?? null,
        createdAt: m.createdAt,
      })),
      substitutes: part.substitutesA.map((s) => ({
        id:           s.substitute.id,
        sku:          s.substitute.sku,
        name:         s.substitute.name,
        partNumber:   s.substitute.partNumber,
        manufacturer: s.substitute.manufacturer,
        retailPrice:  Number(s.substitute.retailPrice),
      })),
    };
  }

  async create(tenantId: string, userId: string, data: any) {
    // pre-check duplicate SKU within tenant (gives nicer error than raw P2002)
    if (data?.sku) {
      const dup = await this.prisma.part.findFirst({
        where: { tenantId, sku: data.sku, deletedAt: null },
        select: { id: true },
      });
      if (dup) throw new ConflictException(`الـSKU "${data.sku}" مستخدم بالفعل`);
    }
    return this.prisma.part.create({
      data: { ...data, tenantId, createdBy: userId },
    });
  }

  /**
   * Tenant-safe update: verifies the row belongs to this tenant before update.
   * Without this check, a user from tenant A could update a part of tenant B
   * by guessing/leaking the UUID.
   */
  async update(tenantId: string, id: string, data: any) {
    const existing = await this.prisma.part.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, sku: true },
    });
    if (!existing) throw new NotFoundException('الصنف غير موجود');

    // if SKU changed, ensure no other part in this tenant uses the new SKU
    if (data?.sku && data.sku !== existing.sku) {
      const dup = await this.prisma.part.findFirst({
        where: { tenantId, sku: data.sku, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException(`الـSKU "${data.sku}" مستخدم بالفعل`);
    }
    return this.prisma.part.update({
      where: { id },
      data: { ...data, tenantId },
    });
  }

  /**
   * Tenant-safe soft delete: blocks deleting a part owned by a different tenant.
   * Also refuses to delete a part that has open stock or appears on any open
   * transaction (sales/purchases/transfers) — those usages must be settled first.
   */
  async softDelete(tenantId: string, id: string) {
    const existing = await this.prisma.part.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('الصنف غير موجود');

    // safety: don't allow delete while there is positive stock
    const stockSum = await this.prisma.stock.aggregate({
      where: { tenantId, partId: id },
      _sum: { quantity: true },
    });
    const onHand = Number(stockSum._sum.quantity ?? 0);
    if (onHand > 0) {
      throw new BadRequestException(`لا يمكن حذف الصنف وله مخزون متبقّي (${onHand})`);
    }

    return this.prisma.part.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, tenantId },
    });
  }

  /**
   * Bulk import: accepts an array of part rows from an Excel/CSV upload.
   * For each row:
   *   - validates required fields (sku, name)
   *   - on dup SKU within tenant: either skip (skipDuplicates=true) or fail
   *   - returns per-row outcome so the UI can show a summary
   */
  async bulkImport(
    tenantId: string,
    userId: string,
    rows: Array<Record<string, any>>,
    opts: { skipDuplicates?: boolean } = {},
  ) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('لا توجد بيانات للاستيراد');
    }
    if (rows.length > 5000) {
      throw new BadRequestException('الحدّ الأقصى 5000 صنف لكل عملية استيراد');
    }

    // pre-load existing SKUs in this tenant to avoid 5000 SELECTs
    const incomingSkus = Array.from(
      new Set(rows.map((r) => String(r?.sku ?? '').trim()).filter(Boolean)),
    );
    const existing = await this.prisma.part.findMany({
      where: { tenantId, sku: { in: incomingSkus }, deletedAt: null },
      select: { sku: true },
    });
    const existingSet = new Set(existing.map((p) => p.sku));

    const created: Array<{ row: number; sku: string; name: string }> = [];
    const skipped: Array<{ row: number; sku: string; reason: string }> = [];
    const failed:  Array<{ row: number; sku: string; reason: string }> = [];
    const seenSkusInBatch = new Set<string>();

    // wrap everything in a single transaction so a mid-batch DB error doesn't
    // leave the catalog half-populated
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i] ?? {};
        const rowNum = i + 2; // human-friendly row (excel header is row 1)
        const sku = String(raw.sku ?? '').trim();
        const name = String(raw.name ?? '').trim();

        if (!sku) {
          failed.push({ row: rowNum, sku: '', reason: 'SKU فارغ' });
          continue;
        }
        if (!name) {
          failed.push({ row: rowNum, sku, reason: 'اسم الصنف فارغ' });
          continue;
        }
        if (sku.length > 60) {
          failed.push({ row: rowNum, sku, reason: 'SKU أطول من 60 حرفاً' });
          continue;
        }
        if (name.length > 200) {
          failed.push({ row: rowNum, sku, reason: 'اسم الصنف أطول من 200 حرف' });
          continue;
        }
        if (seenSkusInBatch.has(sku)) {
          failed.push({ row: rowNum, sku, reason: 'SKU مكرّر داخل الملف نفسه' });
          continue;
        }
        seenSkusInBatch.add(sku);

        if (existingSet.has(sku)) {
          if (opts.skipDuplicates) {
            skipped.push({ row: rowNum, sku, reason: 'موجود مسبقاً (تم التخطّي)' });
            continue;
          }
          failed.push({ row: rowNum, sku, reason: 'SKU موجود مسبقاً' });
          continue;
        }

        // coerce numerics safely; reject negatives
        const num = (v: any): number | undefined => {
          if (v === undefined || v === null || v === '') return undefined;
          const n = Number(v);
          if (Number.isNaN(n)) return undefined;
          return n;
        };
        const cost     = num(raw.costPrice);
        const retail   = num(raw.retailPrice);
        const whole    = num(raw.wholesalePrice);
        const minStock = num(raw.minStock);
        const warranty = num(raw.warrantyMonths);
        const taxRate  = num(raw.taxRate);

        if ([cost, retail, whole, minStock, warranty, taxRate].some((n) => n !== undefined && n < 0)) {
          failed.push({ row: rowNum, sku, reason: 'قيم رقمية سالبة غير مسموحة' });
          continue;
        }

        try {
          await tx.part.create({
            data: {
              tenantId, createdBy: userId,
              sku, name,
              nameEn:        raw.nameEn ? String(raw.nameEn).slice(0, 200) : undefined,
              partNumber:    raw.partNumber ? String(raw.partNumber).slice(0, 100) : undefined,
              oemNumber:     raw.oemNumber ? String(raw.oemNumber).slice(0, 100) : undefined,
              barcode:       raw.barcode ? String(raw.barcode).slice(0, 80) : undefined,
              manufacturer:  raw.manufacturer ? String(raw.manufacturer).slice(0, 80) : undefined,
              countryOrigin: raw.countryOrigin ? String(raw.countryOrigin).slice(0, 80) : undefined,
              unit:          raw.unit ? String(raw.unit).slice(0, 20) : undefined,
              costPrice:      cost     ?? 0,
              retailPrice:    retail   ?? 0,
              wholesalePrice: whole    ?? 0,
              minStock:       minStock ?? 0,
              warrantyMonths: warranty ?? 0,
              taxRate:        taxRate  ?? 16,
            },
          });
          created.push({ row: rowNum, sku, name });
          existingSet.add(sku); // protect against later dup within same batch
        } catch (e: any) {
          failed.push({ row: rowNum, sku, reason: e?.message ?? 'خطأ غير معروف' });
        }
      }
    }, { timeout: 60_000 });

    return {
      total: rows.length,
      created: created.length,
      skipped: skipped.length,
      failed:  failed.length,
      details: { created, skipped, failed },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  //  Images — managed independently of the main Part DTO
  //  Storage: we accept either an http(s) URL or a base64 data URL.
  //  Limit: 4 MB per image so the DB stays small.
  // ──────────────────────────────────────────────────────────────────

  async listImages(tenantId: string, partId: string) {
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!part) throw new NotFoundException('القطعة غير موجودة');
    return this.prisma.partImage.findMany({
      where: { partId, tenantId },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      select: { id: true, url: true, isPrimary: true },
    });
  }

  async addImage(tenantId: string, partId: string, url: string, isPrimary = false) {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('رابط الصورة مطلوب');
    }
    // size guard: 4 MB max (base64 inflates ~33%, so cap at ~5.5MB string)
    if (url.length > 5_500_000) {
      throw new BadRequestException('حجم الصورة كبير جداً — الحد الأقصى 4 ميغابايت');
    }
    // only allow http(s) or image data URLs
    if (!/^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(url)) {
      throw new BadRequestException('صيغة الصورة غير مدعومة');
    }
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!part) throw new NotFoundException('القطعة غير موجودة');

    return this.prisma.$transaction(async (tx) => {
      // if this is set as primary, demote any existing primary
      if (isPrimary) {
        await tx.partImage.updateMany({
          where: { tenantId, partId, isPrimary: true },
          data:  { isPrimary: false },
        });
      } else {
        // make it primary by default if it's the first image
        const existing = await tx.partImage.count({ where: { tenantId, partId } });
        if (existing === 0) isPrimary = true;
      }
      return tx.partImage.create({
        data: { tenantId, partId, url, isPrimary },
        select: { id: true, url: true, isPrimary: true },
      });
    });
  }

  async setImagePrimary(tenantId: string, partId: string, imageId: string) {
    const img = await this.prisma.partImage.findFirst({
      where: { id: imageId, partId, tenantId },
      select: { id: true },
    });
    if (!img) throw new NotFoundException('الصورة غير موجودة');
    await this.prisma.$transaction([
      this.prisma.partImage.updateMany({
        where: { tenantId, partId, isPrimary: true },
        data:  { isPrimary: false },
      }),
      this.prisma.partImage.update({
        where: { id: imageId },
        data:  { isPrimary: true },
      }),
    ]);
    return { ok: true };
  }

  async deleteImage(tenantId: string, partId: string, imageId: string) {
    const img = await this.prisma.partImage.findFirst({
      where: { id: imageId, partId, tenantId },
      select: { id: true, isPrimary: true },
    });
    if (!img) throw new NotFoundException('الصورة غير موجودة');
    await this.prisma.partImage.delete({ where: { id: imageId } });
    // if we deleted the primary, promote the first remaining image
    if (img.isPrimary) {
      const next = await this.prisma.partImage.findFirst({
        where: { tenantId, partId },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (next) {
        await this.prisma.partImage.update({
          where: { id: next.id },
          data:  { isPrimary: true },
        });
      }
    }
    return { ok: true };
  }
}
