import { Module, Controller, Get, Query, Injectable } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/branch-access/branch-access.service';

@Injectable()
class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, scope?: string | string[] | null) {
    const branchFilter =
      scope == null       ? {} :
      Array.isArray(scope) ? { branchId: { in: scope } } :
                             { branchId: scope };
    const stocks = await this.prisma.stock.findMany({
      where: { tenantId, ...branchFilter },
      include: { part: true, branch: { select: { id: true, name: true } } },
      orderBy: { quantity: 'asc' },
      take: 500,
    });
    return stocks.map((s) => ({
      id: s.id, branchId: s.branchId, branchName: s.branch.name,
      partId: s.partId, sku: s.part.sku, name: s.part.name,
      partNumber: s.part.partNumber, oemNumber: s.part.oemNumber,
      quantity: Number(s.quantity), minStock: Number(s.part.minStock),
      location: s.location, status: s.status,
    }));
  }

  async lowStock(tenantId: string, scope?: string | string[] | null) {
    const all = await this.list(tenantId, scope);
    return all.filter((s) => s.quantity <= s.minStock);
  }
}

class QueryStockDto {
  @IsOptional() @IsString() branchId?: string;
}

@Controller('stock')
class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get()
  @Permissions('stock.view')
  async list(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Query() q: QueryStockDto) {
    const scope = await this.branchAccess.scope(user, tenantId, q.branchId);
    return this.stock.list(tenantId, scope);
  }

  @Get('low')
  @Permissions('stock.view')
  async low(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    const scope = await this.branchAccess.scope(user, tenantId, branchId);
    return this.stock.lowStock(tenantId, scope);
  }
}

@Module({ controllers: [StockController], providers: [StockService], exports: [StockService] })
export class StockModule {}
