import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'production'
        ? [{ emit: 'event', level: 'error' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns a Prisma client scoped to a tenant.
   * All read/write queries on tenant-owned tables are auto-filtered/injected with tenant_id.
   */
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query, model, operation }) {
            const TENANT_AWARE = new Set([
              'Branch','Warehouse','Category','Part','PartNumber','PartCompatibility','PartImage',
              'Stock','StockMovement','StockCount','Transfer','Supplier','Customer','PurchaseInvoice',
              'SalesInvoice','PosSession','Quotation','ChartAccount','JournalEntry','CashBox','Bank',
              'Receipt','Payment','Expense','ExpenseCategory','SalesReturn','PurchaseReturn',
              'DamagedItem','Warranty','WarrantyClaim','Employee','Attendance','Task','Payroll',
              'Document','Notification','TelegramLink','AuditLog','User','Role','TenantSettings',
            ]);
            if (!TENANT_AWARE.has(model)) return query(args);
            if (['create','createMany'].includes(operation)) {
              if (Array.isArray((args as any).data)) {
                (args as any).data = (args as any).data.map((d: any) => ({ ...d, tenantId }));
              } else {
                (args as any).data = { ...(args as any).data, tenantId };
              }
            } else if (['findMany','findFirst','findUnique','count','aggregate','groupBy','update','updateMany','delete','deleteMany'].includes(operation)) {
              (args as any).where = { ...(args as any).where, tenantId };
            }
            return query(args);
          },
        },
      },
    });
  }
}
