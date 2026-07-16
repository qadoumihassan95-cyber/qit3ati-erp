/**
 * Workshop module — job cards (repair orders).
 *
 * A card has:
 *   • header    — customer, vehicle, mileage, complaint, diagnosis
 *   • parts     — Part × qty × unitPrice → lineTotal
 *   • labor     — description × hours × ratePerHour → lineTotal
 *   • status    — draft / in_progress / waiting_parts / completed /
 *                 delivered / cancelled
 *
 * Rules of the road:
 *   1. Stock is NOT deducted while a card is open. Parts are logically
 *      reserved and shown as "on cards" in the future. This lets a
 *      service advisor pencil in three cards in the morning without
 *      accidentally showing three unsellable parts on the counter.
 *
 *   2. On "complete + convert to invoice" we hand the assembled cart
 *      to SalesService.createSale() — the SAME code path POS uses.
 *      That gives us for free:
 *          - atomic stock decrement (race-safe)
 *          - FIFO layer consumption
 *          - avgCost refinement
 *          - customer balance update
 *          - invoice numbering
 *          - JoFotara auto-submit
 *
 *   3. Multi-branch: every write asserts branch access via
 *      BranchAccessService. GET list scopes to the user's accessible
 *      branches (owners see all).
 */
import { Module, Controller, Get, Post, Patch, Delete, Body, Param, Query, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma, JobCardStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/branch-access/branch-access.service';
import { SalesService } from '../sales/sales.service';
import { SalesModule } from '../sales/sales.module';

// ============================ DTOs ============================

class JobCardPartDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

class JobCardLaborDto {
  @IsString() @MaxLength(300) description!: string;
  @IsOptional() @IsNumber() @Min(0.01) hours?: number;
  @IsNumber() @Min(0) ratePerHour!: number;
  @IsOptional() @IsString() performedBy?: string;
}

class CreateJobCardDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(2000) complaint?: string;
  @IsOptional() @IsString() @MaxLength(2000) diagnosis?: string;
  @IsOptional() @IsInt() @Min(0) mileageIn?: number;
  @IsOptional() @IsString() mechanicId?: string;
  @IsOptional() @IsEnum(JobCardStatus) status?: JobCardStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JobCardPartDto)  parts?: JobCardPartDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JobCardLaborDto) labors?: JobCardLaborDto[];
}

class UpdateJobCardDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(2000) complaint?: string;
  @IsOptional() @IsString() @MaxLength(2000) diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(2000) workDone?: string;
  @IsOptional() @IsInt() @Min(0) mileageIn?: number;
  @IsOptional() @IsInt() @Min(0) mileageOut?: number;
  @IsOptional() @IsString() mechanicId?: string;
  @IsOptional() @IsEnum(JobCardStatus) status?: JobCardStatus;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

class AddPartDto extends JobCardPartDto {}
class AddLaborDto extends JobCardLaborDto {}

class ConvertToInvoiceDto {
  @IsOptional() @IsEnum(['cash','credit','card','bank','cheque']) paymentType?: 'cash'|'credit'|'card'|'bank'|'cheque';
}

// ============================ Service ============================

@Injectable()
class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly sales: SalesService,
  ) {}

  // -------- helpers --------

  private computeTotals(
    parts: { qty: any; unitPrice: any; discount?: any }[],
    labors: { hours: any; ratePerHour: any }[],
    cardDiscount = 0,
  ) {
    const partsTotal = parts.reduce((s, p) => {
      const q = Number(p.qty);
      const up = Number(p.unitPrice);
      const d = Number(p.discount ?? 0);
      return s + Math.max(0, q * up - d);
    }, 0);
    const laborTotal = labors.reduce((s, l) => s + Number(l.hours) * Number(l.ratePerHour), 0);
    const total = Math.max(0, partsTotal + laborTotal - Number(cardDiscount || 0));
    return { partsTotal, laborTotal, total };
  }

  private async recomputeAndPersist(tx: Prisma.TransactionClient, jobCardId: string) {
    const parts  = await tx.jobCardPart.findMany({ where: { jobCardId } });
    const labors = await tx.jobCardLabor.findMany({ where: { jobCardId } });
    const card   = await tx.jobCard.findUnique({ where: { id: jobCardId }, select: { discount: true } });
    const t = this.computeTotals(parts, labors, Number(card?.discount ?? 0));
    await tx.jobCard.update({
      where: { id: jobCardId },
      data:  { partsTotal: t.partsTotal, laborTotal: t.laborTotal, total: t.total },
    });
    return t;
  }

  private async nextCardNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `job_cards:${year}`;
    const counter = await tx.tenantCounter.upsert({
      where:  { tenantId_counterKey: { tenantId, counterKey: key } },
      update: { value: { increment: 1 } },
      create: { tenantId, counterKey: key, value: 1 },
    });
    return `JOB-${year}-${String(counter.value).padStart(5, '0')}`;
  }

  // -------- queries --------

  async list(
    tenantId: string,
    scope: string | string[] | null,
    status?: JobCardStatus,
    vehicleId?: string,
    customerId?: string,
  ) {
    const branchFilter =
      scope == null       ? {} :
      Array.isArray(scope) ? { branchId: { in: scope } } :
                             { branchId: scope };
    const where: Prisma.JobCardWhereInput = {
      tenantId, deletedAt: null,
      ...branchFilter,
      ...(status     ? { status }     : {}),
      ...(vehicleId  ? { vehicleId }  : {}),
      ...(customerId ? { customerId } : {}),
    };
    return this.prisma.jobCard.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle:  { select: { id: true, plate: true, make: true, model: true, year: true } },
        mechanic: { select: { id: true, fullName: true } },
        branch:   { select: { id: true, name: true } },
        _count:   { select: { parts: true, labors: true } },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
      take: 300,
    });
  }

  async findOne(tenantId: string, id: string) {
    const card = await this.prisma.jobCard.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        customer: true,
        vehicle:  true,
        branch:   { select: { id: true, name: true } },
        opener:   { select: { id: true, fullName: true } },
        mechanic: { select: { id: true, fullName: true } },
        parts:    { include: { part: { select: { id: true, sku: true, name: true, unit: true } } } },
        labors:   { include: { performer: { select: { id: true, fullName: true } } } },
        invoice:  { select: { id: true, invoiceNo: true, total: true } },
      },
    });
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  // -------- writes --------

  async create(tenantId: string, userId: string, dto: CreateJobCardDto) {
    return this.prisma.$transaction(async (tx) => {
      // Validate optional customer/vehicle links exist in tenant
      if (dto.customerId) {
        const c = await tx.customer.findFirst({ where: { id: dto.customerId, tenantId, deletedAt: null }, select: { id: true } });
        if (!c) throw new BadRequestException('customer not found');
      }
      if (dto.vehicleId) {
        const v = await tx.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId, deletedAt: null }, select: { id: true, customerId: true } });
        if (!v) throw new BadRequestException('vehicle not found');
        // If a customer was set, make sure the vehicle belongs to them
        if (dto.customerId && v.customerId !== dto.customerId) {
          throw new BadRequestException('vehicle does not belong to this customer');
        }
      }
      const cardNo = await this.nextCardNo(tx, tenantId);
      // Fetch part unit prices when unitPrice omitted (default to retailPrice)
      const parts = dto.parts ?? [];
      let partDetails = new Map<string, { retailPrice: any }>();
      if (parts.length) {
        const rows = await tx.part.findMany({
          where: { id: { in: parts.map(p => p.partId) }, tenantId, deletedAt: null },
          select: { id: true, retailPrice: true },
        });
        partDetails = new Map(rows.map(r => [r.id, r]));
      }
      const partRows = parts.map(p => {
        const up = p.unitPrice ?? Number(partDetails.get(p.partId)?.retailPrice ?? 0);
        const line = Math.max(0, p.qty * up - (p.discount ?? 0));
        return { tenantId, partId: p.partId, qty: p.qty, unitPrice: up, discount: p.discount ?? 0, lineTotal: line };
      });
      const labors = dto.labors ?? [];
      const laborRows = labors.map(l => {
        const h = l.hours ?? 1;
        const line = h * l.ratePerHour;
        return { tenantId, description: l.description, hours: h, ratePerHour: l.ratePerHour, lineTotal: line, performedBy: l.performedBy ?? null };
      });
      const totals = this.computeTotals(partRows, laborRows, 0);

      const card = await tx.jobCard.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          cardNo,
          customerId: dto.customerId ?? null,
          vehicleId:  dto.vehicleId  ?? null,
          complaint:  dto.complaint  ?? null,
          mileageIn:  dto.mileageIn  ?? null,
          mechanicId: dto.mechanicId ?? null,
          openedBy:   userId,
          status:     dto.status ?? 'draft',
          partsTotal: totals.partsTotal,
          laborTotal: totals.laborTotal,
          total:      totals.total,
          parts:  { create: partRows },
          labors: { create: laborRows },
        },
        include: {
          parts: true, labors: true,
          vehicle: { select: { plate: true, make: true, model: true } },
          customer:{ select: { id: true, name: true } },
        },
      });
      return card;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateJobCardDto, user: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.jobCard.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true, branchId: true, status: true, invoiceId: true },
      });
      if (!card) throw new NotFoundException('job card not found');
      // Once converted to invoice, block header edits (invoice is the record of truth)
      if (card.invoiceId) throw new BadRequestException('card already converted to invoice — edit the invoice instead');
      await this.branchAccess.assertWrite(user, tenantId, card.branchId);
      const patch: Prisma.JobCardUpdateInput = { ...dto } as any;
      // If moving into `completed` without going through convertToInvoice(),
      // we still allow it — the UI shows "Convert to invoice" as the follow-up
      // action, and closedAt is stamped here.
      if (dto.status && ['completed','delivered','cancelled'].includes(dto.status) && !card.status.includes(dto.status)) {
        patch.closedAt = new Date();
      }
      await tx.jobCard.update({ where: { id }, data: patch });
      if (dto.discount != null) await this.recomputeAndPersist(tx, id);
      return tx.jobCard.findUnique({
        where: { id },
        include: {
          parts:  { include: { part: { select: { id: true, sku: true, name: true } } } },
          labors: true,
        },
      });
    });
  }

  async addPart(tenantId: string, cardId: string, dto: AddPartDto, user: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.jobCard.findFirst({
        where: { id: cardId, tenantId, deletedAt: null },
        select: { branchId: true, invoiceId: true },
      });
      if (!card) throw new NotFoundException('job card not found');
      if (card.invoiceId) throw new BadRequestException('card already invoiced — cannot add parts');
      await this.branchAccess.assertWrite(user, tenantId, card.branchId);
      const part = await tx.part.findFirst({
        where: { id: dto.partId, tenantId, deletedAt: null },
        select: { id: true, retailPrice: true },
      });
      if (!part) throw new BadRequestException('part not found');
      const up = dto.unitPrice ?? Number(part.retailPrice);
      const line = Math.max(0, dto.qty * up - (dto.discount ?? 0));
      const row = await tx.jobCardPart.create({
        data: { tenantId, jobCardId: cardId, partId: dto.partId, qty: dto.qty, unitPrice: up, discount: dto.discount ?? 0, lineTotal: line },
        include: { part: { select: { id: true, sku: true, name: true } } },
      });
      await this.recomputeAndPersist(tx, cardId);
      return row;
    });
  }

  async removePart(tenantId: string, cardId: string, partRowId: string, user: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.jobCard.findFirst({
        where: { id: cardId, tenantId, deletedAt: null },
        select: { branchId: true, invoiceId: true },
      });
      if (!card) throw new NotFoundException('job card not found');
      if (card.invoiceId) throw new BadRequestException('card already invoiced');
      await this.branchAccess.assertWrite(user, tenantId, card.branchId);
      await tx.jobCardPart.delete({ where: { id: partRowId } });
      await this.recomputeAndPersist(tx, cardId);
      return { ok: true };
    });
  }

  async addLabor(tenantId: string, cardId: string, dto: AddLaborDto, user: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.jobCard.findFirst({
        where: { id: cardId, tenantId, deletedAt: null },
        select: { branchId: true, invoiceId: true },
      });
      if (!card) throw new NotFoundException('job card not found');
      if (card.invoiceId) throw new BadRequestException('card already invoiced');
      await this.branchAccess.assertWrite(user, tenantId, card.branchId);
      const h = dto.hours ?? 1;
      const line = h * dto.ratePerHour;
      const row = await tx.jobCardLabor.create({
        data: { tenantId, jobCardId: cardId, description: dto.description, hours: h, ratePerHour: dto.ratePerHour, lineTotal: line, performedBy: dto.performedBy ?? null },
      });
      await this.recomputeAndPersist(tx, cardId);
      return row;
    });
  }

  async removeLabor(tenantId: string, cardId: string, laborRowId: string, user: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.jobCard.findFirst({
        where: { id: cardId, tenantId, deletedAt: null },
        select: { branchId: true, invoiceId: true },
      });
      if (!card) throw new NotFoundException('job card not found');
      if (card.invoiceId) throw new BadRequestException('card already invoiced');
      await this.branchAccess.assertWrite(user, tenantId, card.branchId);
      await tx.jobCardLabor.delete({ where: { id: laborRowId } });
      await this.recomputeAndPersist(tx, cardId);
      return { ok: true };
    });
  }

  async remove(tenantId: string, id: string, user: JwtUser) {
    const card = await this.prisma.jobCard.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { branchId: true, invoiceId: true },
    });
    if (!card) throw new NotFoundException('job card not found');
    if (card.invoiceId) throw new BadRequestException('cannot delete a card already invoiced — cancel the invoice via a sales return instead');
    await this.branchAccess.assertWrite(user, tenantId, card.branchId);
    await this.prisma.jobCard.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Convert the card into a real SalesInvoice using the tested
   * SalesService.createSale() path — which handles stock decrement,
   * FIFO consumption, avgCost refinement, customer balance, invoice
   * numbering, and JoFotara submission.
   *
   * Labor lines are represented as extra SalesItem rows with partId=null
   * (SalesItem's partId is nullable — used for POS "misc charge" already).
   */
  async convertToInvoice(tenantId: string, cardId: string, user: JwtUser, dto: ConvertToInvoiceDto) {
    // Fetch the card outside the sale transaction so createSale can
    // manage its own transactional boundary safely.
    const card = await this.prisma.jobCard.findFirst({
      where: { id: cardId, tenantId, deletedAt: null },
      include: { parts: true, labors: true },
    });
    if (!card) throw new NotFoundException('job card not found');
    if (card.invoiceId) throw new BadRequestException('card already converted');
    await this.branchAccess.assertWrite(user, tenantId, card.branchId);
    if (!card.parts.length && !card.labors.length) {
      throw new BadRequestException('cannot invoice an empty card');
    }

    // Assemble a sale payload. Parts become normal items; labors become
    // partId=null items with unitPrice=hours*rate and qty=1 (or hours, if
    // preferred — we use qty=1 so the printed invoice reads cleanly).
    const items: any[] = card.parts.map(p => ({
      partId:    p.partId,
      qty:       Number(p.qty),
      unitPrice: Number(p.unitPrice),
      discount:  Number(p.discount ?? 0),
    }));
    for (const l of card.labors) {
      items.push({
        partId:      null,
        qty:         1,
        unitPrice:   Number(l.lineTotal),
        description: l.description, // SalesService already tolerates extra fields via strip validator
      });
    }

    const sale = await this.sales.createSale(tenantId, user.sub, {
      branchId:    card.branchId,
      customerId:  card.customerId ?? undefined,
      paymentType: dto.paymentType ?? 'credit',
      discount:    Number(card.discount ?? 0),
      items,
    });

    // Link them
    await this.prisma.jobCard.update({
      where: { id: cardId },
      data:  { invoiceId: sale.id, status: 'completed', closedAt: new Date() },
    });
    await this.prisma.salesInvoice.update({
      where: { id: sale.id },
      data:  { jobCardId: cardId },
    });

    return { jobCardId: cardId, invoiceId: sale.id, invoiceNo: sale.invoiceNo };
  }
}

// ============================ Controllers ============================

@Controller('workshop/job-cards')
class JobCardsController {
  constructor(
    private readonly svc: WorkshopService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get()
  @Permissions('workshop.view')
  async list(
    @Tenant() tid: string,
    @CurrentUser() user: JwtUser,
    @Query('branchId')   branchId?: string,
    @Query('status')     status?: JobCardStatus,
    @Query('vehicleId')  vehicleId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const scope = await this.branchAccess.scope(user, tid, branchId);
    return this.svc.list(tid, scope, status, vehicleId, customerId);
  }

  @Get(':id')
  @Permissions('workshop.view')
  async one(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    const card = await this.svc.findOne(tid, id);
    if (card.branchId) await this.branchAccess.assertWrite(user, tid, card.branchId);
    return card;
  }

  @Post()
  @Permissions('workshop.create')
  async create(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Body() dto: CreateJobCardDto) {
    await this.branchAccess.assertWrite(user, tid, dto.branchId);
    return this.svc.create(tid, user.sub, dto);
  }

  @Patch(':id')
  @Permissions('workshop.edit')
  update(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateJobCardDto) {
    return this.svc.update(tid, id, dto, user);
  }

  @Delete(':id')
  @Permissions('workshop.edit')
  remove(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.svc.remove(tid, id, user);
  }

  // ----- parts on a card -----
  @Post(':id/parts')
  @Permissions('workshop.edit')
  addPart(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AddPartDto) {
    return this.svc.addPart(tid, id, dto, user);
  }

  @Delete(':id/parts/:rowId')
  @Permissions('workshop.edit')
  removePart(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Param('rowId') rowId: string) {
    return this.svc.removePart(tid, id, rowId, user);
  }

  // ----- labor on a card -----
  @Post(':id/labors')
  @Permissions('workshop.edit')
  addLabor(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AddLaborDto) {
    return this.svc.addLabor(tid, id, dto, user);
  }

  @Delete(':id/labors/:rowId')
  @Permissions('workshop.edit')
  removeLabor(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Param('rowId') rowId: string) {
    return this.svc.removeLabor(tid, id, rowId, user);
  }

  // ----- convert to invoice -----
  @Post(':id/convert-to-invoice')
  @Permissions('workshop.close')
  convert(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ConvertToInvoiceDto) {
    return this.svc.convertToInvoice(tid, id, user, dto);
  }
}

@Module({
  imports:     [SalesModule],   // for SalesService injection into convertToInvoice()
  controllers: [JobCardsController],
  providers:   [WorkshopService],
  exports:     [WorkshopService],
})
export class WorkshopModule {}
