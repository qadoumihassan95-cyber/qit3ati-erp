import { Module, Controller, Get, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant } from '../../common/decorators/tenant.decorator';

@Injectable()
class TenantsService {
  constructor(private readonly prisma: PrismaService) {}
  dashboard(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [
        salesToday, salesMonth, invoiceCount, lowStock, customers, openCustomerBalance,
      ] = await Promise.all([
        tx.salesInvoice.aggregate({
          where: { tenantId, invoiceDate: { gte: new Date(new Date().toDateString()) }, status: 'completed' },
          _sum: { total: true }, _count: true,
        }),
        tx.salesInvoice.aggregate({
          where: { tenantId, invoiceDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: 'completed' },
          _sum: { total: true },
        }),
        tx.salesInvoice.count({ where: { tenantId, status: 'completed' } }),
        tx.stock.findMany({
          where: { tenantId, status: { in: ['low','out'] } },
          take: 10, include: { part: { select: { name: true, partNumber: true, oemNumber: true, minStock: true } }, branch: { select: { name: true } } },
        }),
        tx.customer.count({ where: { tenantId, deletedAt: null } }),
        tx.customer.aggregate({ where: { tenantId, balance: { gt: 0 } }, _sum: { balance: true } }),
      ]);
      return {
        salesTodayTotal:   Number(salesToday._sum.total ?? 0),
        salesTodayCount:   salesToday._count,
        salesMonthTotal:   Number(salesMonth._sum.total ?? 0),
        invoiceCountTotal: invoiceCount,
        lowStockAlerts:    lowStock,
        customersCount:    customers,
        receivables:       Number(openCustomerBalance._sum.balance ?? 0),
      };
    });
  }
}

@Controller('tenants')
class TenantsController {
  constructor(private readonly svc: TenantsService) {}
  @Get('dashboard') dash(@Tenant() tid: string) { return this.svc.dashboard(tid); }
}

@Module({ controllers: [TenantsController], providers: [TenantsService] })
export class TenantsModule {}
