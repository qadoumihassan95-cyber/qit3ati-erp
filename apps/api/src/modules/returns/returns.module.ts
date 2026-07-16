import { Module, Controller, Get, Post, Param, Body, Query, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/branch-access/branch-access.service';

class ReturnItemDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0.01) qty!: number;
  @IsOptional() @IsEnum(['good', 'damaged']) condition?: 'good' | 'damaged';
  @IsOptional() @IsBoolean() backToStock?: boolean;
}

class CreateSalesReturnDto {
  @IsOptional() @IsString() invoiceId?: string;
  @IsString() branchId!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsEnum(['cash', 'bank', 'credit']) refundMethod?: 'cash' | 'bank' | 'credit';
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

@Injectable()
class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sales return atomic flow:
   *  - validate branch + (optional) original invoice
   *  - for each item: if backToStock=true & condition=good → increment stock
   *                   if condition=damaged → record damaged_items
   *  - record stock_movements (type=return_in) for the increments
   *  - decrement customer balance for credit refund / record refund payment for cash/bank
   *  - return total refunded
   */
  async create(tenantId: string, userId: string, d: CreateSalesReturnDto) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: d.branchId, tenantId, deletedAt: null } });
      if (!branch) throw new NotFoundException('الفرع غير موجود');

      const warehouse = await tx.warehouse.findFirst({
        where: { tenantId, branchId: d.branchId },
        orderBy: { isMain: 'desc' },
      });
      if (!warehouse) throw new BadRequestException('لا يوجد مستودع لهذا الفرع');

      let originalInvoice: any = null;
      if (d.invoiceId) {
        originalInvoice = await tx.salesInvoice.findFirst({
          where: { id: d.invoiceId, tenantId },
          include: { items: true, customer: true },
        });
        if (!originalInvoice) throw new NotFoundException('الفاتورة الأصلية غير موجودة');
      }

      // Pull all parts at once
      const partIds = d.items.map((i) => i.partId);
      const parts = await tx.part.findMany({ where: { id: { in: partIds }, tenantId } });
      const partsById = new Map(parts.map((p) => [p.id, p]));

      let totalRefund = 0;
      const lineRows = d.items.map((it) => {
        const part = partsById.get(it.partId);
        if (!part) throw new NotFoundException(`القطعة ${it.partId} غير موجودة`);
        // unit price: use original invoice line if available, else retail
        let unitPrice = Number(part.retailPrice);
        if (originalInvoice) {
          const origLine = originalInvoice.items.find((l: any) => l.partId === it.partId);
          if (origLine) unitPrice = Number(origLine.unitPrice);
        }
        const lineTotal = +(unitPrice * it.qty).toFixed(3);
        totalRefund += lineTotal;
        return {
          partId: part.id,
          qty: it.qty,
          unitPrice,
          condition: it.condition ?? 'good',
          backToStock: it.backToStock ?? (it.condition !== 'damaged'),
        };
      });
      totalRefund = +totalRefund.toFixed(3);

      const ret = await tx.salesReturn.create({
        data: {
          tenantId,
          branchId: d.branchId,
          invoiceId: d.invoiceId ?? null,
          reason: d.reason ?? null,
          refundMethod: d.refundMethod ?? 'cash',
          total: totalRefund,
          createdBy: userId,
          items: { create: lineRows },
        },
        include: { items: true, invoice: { select: { id: true, invoiceNo: true } } },
      });

      // apply stock effects + log damaged items
      for (const it of lineRows) {
        if (it.backToStock && it.condition === 'good') {
          const existing = await tx.stock.findFirst({
            where: { tenantId, warehouseId: warehouse.id, partId: it.partId },
          });
          if (existing) {
            await tx.stock.update({
              where: { id: existing.id },
              data: { quantity: { increment: it.qty }, status: 'available' },
            });
          } else {
            await tx.stock.create({
              data: { tenantId, branchId: d.branchId, warehouseId: warehouse.id, partId: it.partId, quantity: it.qty, status: 'available' },
            });
          }
          await tx.stockMovement.create({
            data: {
              tenantId, branchId: d.branchId, partId: it.partId,
              type: 'return_in', qtyChange: it.qty, userId,
              refTable: 'sales_returns', refId: ret.id,
            },
          });
        } else if (it.condition === 'damaged') {
          await tx.damagedItem.create({
            data: { tenantId, branchId: d.branchId, partId: it.partId, qty: it.qty,
              reason: `مرتجع تالف — ${d.reason ?? ''}`.slice(0, 500), createdBy: userId },
          });
        }
      }

      // Refund effects on customer balance
      if (originalInvoice?.customer) {
        if (d.refundMethod === 'credit') {
          // credit refund → reduces customer balance (he owes us less)
          await tx.customer.update({
            where: { id: originalInvoice.customer.id },
            data: { balance: { decrement: totalRefund } },
          });
        } else if (d.refundMethod === 'cash' || d.refundMethod === 'bank') {
          // cash/bank refund → record as a negative receipt (we paid them back)
          // simplest: create a "refund" receipt with negative amount tracked
          await tx.payment.create({
            data: {
              tenantId, branchId: d.branchId, supplierId: null as any,
              amount: totalRefund, method: d.refundMethod === 'bank' ? 'bank' : 'cash',
              paymentDate: new Date(), createdBy: userId,
            },
          });
        }
      }

      return ret;
    });
  }

  list(tenantId: string, scope?: string | string[] | null) {
    const branchFilter =
      scope == null       ? {} :
      Array.isArray(scope) ? { branchId: { in: scope } } :
                             { branchId: scope };
    return this.prisma.salesReturn.findMany({
      where: { tenantId, ...branchFilter },
      include: {
        items: { include: { part: { select: { id: true, sku: true, name: true } } } },
        invoice: { select: { id: true, invoiceNo: true } },
        branch:  { select: { id: true, name: true } },
        creator: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  findOne(tenantId: string, id: string) {
    return this.prisma.salesReturn.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { part: true } },
        invoice: { include: { customer: true } },
        branch: true,
        creator: { select: { id: true, fullName: true } },
      },
    });
  }
}

@Controller('returns/sales')
class SalesReturnsController {
  constructor(
    private readonly svc: ReturnsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get()
  @Permissions('sales.view')
  async list(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Query('branchId') branchId?: string) {
    const scope = await this.branchAccess.scope(u, tid, branchId);
    return this.svc.list(tid, scope);
  }

  @Get(':id')
  @Permissions('sales.view')
  async one(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Param('id') id: string) {
    const ret = await this.svc.findOne(tid, id);
    if (ret?.branchId) await this.branchAccess.assertWrite(u, tid, ret.branchId);
    return ret;
  }

  @Post()
  @Permissions('sales.cancel')
  async create(@Tenant() tid: string, @CurrentUser() u: JwtUser, @Body() d: CreateSalesReturnDto) {
    await this.branchAccess.assertWrite(u, tid, d.branchId);
    return this.svc.create(tid, u.sub, d);
  }
}

@Module({ controllers: [SalesReturnsController], providers: [ReturnsService] })
export class ReturnsModule {}
