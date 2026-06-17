import { Module, Controller, Get, Query, Injectable } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

@Injectable()
class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, branchId?: string) {
    const stocks = await this.prisma.stock.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
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

  async lowStock(tenantId: string) {
    const all = await this.list(tenantId);
    return all.filter((s) => s.quantity <= s.minStock);
  }
}

class QueryStockDto {
  @IsOptional() @IsString() branchId?: string;
}

@Controller('stock')
class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('stock.view')
  list(@Tenant() tenantId: string, @Query() q: QueryStockDto) {
    return this.stock.list(tenantId, q.branchId);
  }

  @Get('low')
  @Permissions('stock.view')
  low(@Tenant() tenantId: string) {
    return this.stock.lowStock(tenantId);
  }
}

@Module({ controllers: [StockController], providers: [StockService], exports: [StockService] })
export class StockModule {}
