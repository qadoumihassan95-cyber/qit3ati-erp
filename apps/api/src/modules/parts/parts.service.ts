import { Injectable, NotFoundException } from '@nestjs/common';
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

    const text = (q.q ?? '').trim();
    const where: Prisma.PartWhereInput = {
      tenantId,
      deletedAt: null,
      isActive: true,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(text
        ? {
            OR: [
              { name:       { contains: text, mode: 'insensitive' } },
              { nameEn:     { contains: text, mode: 'insensitive' } },
              { sku:        { contains: text, mode: 'insensitive' } },
              { partNumber: { contains: text, mode: 'insensitive' } },
              { oemNumber:  { contains: text, mode: 'insensitive' } },
              { barcode:    { contains: text, mode: 'insensitive' } },
              { numbers:    { some: { number: { contains: text, mode: 'insensitive' } } } },
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
        };
      }),
      page, perPage, total,
      pages: Math.ceil(total / perPage),
    };
  }

  async findOne(tenantId: string, id: string) {
    const part = await this.prisma.part.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        numbers: true,
        compats: { include: { make: true, model: true } },
        images: true,
        stocks: { include: { branch: true, warehouse: true } },
        substitutesA: { include: { substitute: { select: { id: true, sku: true, name: true, retailPrice: true } } } },
      },
    });
    if (!part) throw new NotFoundException('part not found');
    return part;
  }

  async create(tenantId: string, userId: string, data: any) {
    return this.prisma.part.create({
      data: {
        ...data,
        tenantId,
        createdBy: userId,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    return this.prisma.part.update({
      where: { id },
      data: { ...data, tenantId },
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.prisma.part.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, tenantId },
    });
  }
}
