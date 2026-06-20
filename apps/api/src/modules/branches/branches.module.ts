import { Module, Controller, Get, Post, Put, Param, Body, Injectable } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class BranchDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isMain?: boolean;
}

@Injectable()
class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Create a branch AND auto-provision a default warehouse for it.
   * Without a warehouse the branch cannot receive transfers or hold stock.
   */
  async create(tenantId: string, d: BranchDto) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: { ...d, tenantId } });
      await tx.warehouse.create({
        data: {
          tenantId,
          branchId: branch.id,
          name: `${branch.name} — المستودع الرئيسي`,
          isMain: true,
        },
      });
      return branch;
    });
  }

  update(tenantId: string, id: string, d: BranchDto) {
    return this.prisma.branch.update({ where: { id }, data: { ...d, tenantId } });
  }

  /**
   * Backfill: ensure every branch has at least one warehouse.
   * Idempotent — only creates warehouses for branches that lack any.
   */
  async ensureWarehouses(tenantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
    });
    const created: string[] = [];
    for (const b of branches) {
      const whCount = await this.prisma.warehouse.count({
        where: { tenantId, branchId: b.id, deletedAt: null },
      });
      if (whCount === 0) {
        await this.prisma.warehouse.create({
          data: {
            tenantId,
            branchId: b.id,
            name: `${b.name} — المستودع الرئيسي`,
            isMain: true,
          },
        });
        created.push(b.name);
      }
    }
    return { ok: true, createdFor: created, count: created.length };
  }
}

@Controller('branches')
class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  @Get() list(@Tenant() tid: string) { return this.svc.list(tid); }

  @Post() @Permissions('settings.edit')
  create(@Tenant() tid: string, @Body() d: BranchDto) { return this.svc.create(tid, d); }

  @Put(':id') @Permissions('settings.edit')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() d: BranchDto) {
    return this.svc.update(tid, id, d);
  }

  /** Maintenance: provision a warehouse for any branch that doesn't have one yet. */
  @Post('ensure-warehouses') @Permissions('settings.edit')
  ensureWarehouses(@Tenant() tid: string) { return this.svc.ensureWarehouses(tid); }
}

@Module({ controllers: [BranchesController], providers: [BranchesService] })
export class BranchesModule {}
