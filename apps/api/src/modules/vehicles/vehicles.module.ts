/**
 * Vehicles module — every customer's car(s).
 *
 * Endpoints:
 *   GET    /vehicles                  — list, filter by ?customerId or ?q
 *   GET    /vehicles/:id              — one
 *   GET    /customers/:id/vehicles    — convenience: cars for a customer
 *   POST   /vehicles                  — create
 *   PATCH  /vehicles/:id              — update
 *   DELETE /vehicles/:id              — soft-delete
 *
 * The Vehicle model itself has no branchId (a customer's car isn't
 * "owned" by a specific branch — service can happen at any branch),
 * so multi-branch enforcement is a no-op here. The controller still
 * scopes everything to the current tenant.
 */
import { Module, Controller, Get, Post, Patch, Delete, Body, Param, Query, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class CreateVehicleDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() @MaxLength(30) plate?: string;
  @IsOptional() @IsString() @MaxLength(30) vin?: string;
  @IsOptional() @IsString() @MaxLength(60) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) year?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(60) engine?: string;
  @IsOptional() @IsString() @MaxLength(30) transmission?: string;
  @IsOptional() @IsInt() @Min(0) @Max(9_999_999) mileage?: number;
  @IsOptional() @IsString() notes?: string;
}

class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(30) plate?: string;
  @IsOptional() @IsString() @MaxLength(30) vin?: string;
  @IsOptional() @IsString() @MaxLength(60) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) year?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(60) engine?: string;
  @IsOptional() @IsString() @MaxLength(30) transmission?: string;
  @IsOptional() @IsInt() @Min(0) @Max(9_999_999) mileage?: number;
  @IsOptional() @IsString() notes?: string;
}

@Injectable()
class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize<T extends Partial<{ plate?: string; vin?: string }>>(dto: T): T {
    // Empty strings for plate/vin become NULL — otherwise the tenantId+plate
    // unique index treats "" as a duplicate value across multiple rows.
    if (dto.plate !== undefined) dto.plate = dto.plate?.trim() || (undefined as any);
    if (dto.vin   !== undefined) dto.vin   = dto.vin?.trim()   || (undefined as any);
    return dto;
  }

  async list(tenantId: string, customerId?: string, q?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (customerId) where.customerId = customerId;
    if (q && q.trim()) {
      const s = q.trim();
      where.OR = [
        { plate: { contains: s, mode: 'insensitive' } },
        { vin:   { contains: s, mode: 'insensitive' } },
        { make:  { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.vehicle.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
  }

  async listByCustomer(tenantId: string, customerId: string) {
    return this.prisma.vehicle.findMany({
      where: { tenantId, customerId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        jobCards: {
          where: { deletedAt: null },
          orderBy: { openedAt: 'desc' },
          take: 20,
          select: { id: true, cardNo: true, status: true, openedAt: true, closedAt: true, total: true },
        },
      },
    });
    if (!v) throw new NotFoundException('vehicle not found');
    return v;
  }

  async create(tenantId: string, dto: CreateVehicleDto) {
    this.normalize(dto);
    // Verify customer exists in tenant
    const cust = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!cust) throw new BadRequestException('customer not found in tenant');
    return this.prisma.vehicle.create({
      data: { tenantId, ...dto } as any,
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateVehicleDto) {
    this.normalize(dto);
    const found = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('vehicle not found');
    return this.prisma.vehicle.update({ where: { id }, data: dto as any });
  }

  async remove(tenantId: string, id: string) {
    const found = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('vehicle not found');
    await this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

@Controller('vehicles')
class VehiclesController {
  constructor(private readonly svc: VehiclesService) {}

  @Get()
  @Permissions('workshop.view')
  list(@Tenant() tid: string, @Query('customerId') customerId?: string, @Query('q') q?: string) {
    return this.svc.list(tid, customerId, q);
  }

  @Get(':id')
  @Permissions('workshop.view')
  one(@Tenant() tid: string, @Param('id') id: string) {
    return this.svc.findOne(tid, id);
  }

  @Post()
  @Permissions('workshop.create')
  create(@Tenant() tid: string, @Body() dto: CreateVehicleDto) {
    return this.svc.create(tid, dto);
  }

  @Patch(':id')
  @Permissions('workshop.edit')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.svc.update(tid, id, dto);
  }

  @Delete(':id')
  @Permissions('workshop.edit')
  remove(@Tenant() tid: string, @Param('id') id: string) {
    return this.svc.remove(tid, id);
  }
}

// Sub-controller mounted at /customers/:id/vehicles so the customer
// detail modal doesn't need to know about the vehicles endpoint's
// filter param — it just hits the natural REST URL.
@Controller('customers')
class CustomerVehiclesController {
  constructor(private readonly svc: VehiclesService) {}

  @Get(':id/vehicles')
  @Permissions('workshop.view')
  byCustomer(@Tenant() tid: string, @Param('id') id: string) {
    return this.svc.listByCustomer(tid, id);
  }
}

@Module({
  controllers: [VehiclesController, CustomerVehiclesController],
  providers:   [VehiclesService],
  exports:     [VehiclesService],
})
export class VehiclesModule {}
