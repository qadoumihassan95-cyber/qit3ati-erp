import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { BranchAccessModule } from './common/branch-access/branch-access.module';

import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { PartsModule } from './modules/parts/parts.module';
import { StockModule } from './modules/stock/stock.module';
import { SalesModule } from './modules/sales/sales.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { FinanceModule }   from './modules/finance/finance.module';
import { ReturnsModule }   from './modules/returns/returns.module';
import { ReportsModule }   from './modules/reports/reports.module';
import { InvoicesModule }  from './modules/invoices/invoices.module';
import { AuditModule }     from './modules/audit/audit.module';
import { PapersModule }    from './modules/papers/papers.module';
import { ChequesModule }   from './modules/cheques/cheques.module';
import { JofotaraModule }  from './modules/jofotara/jofotara.module';
import { SearchModule }    from './modules/search/search.module';
import { TelegramModule }  from './modules/telegram/telegram.module';
import { FifoModule }      from './modules/fifo/fifo.module';
import { VehiclesModule }  from './modules/vehicles/vehicles.module';
import { WorkshopModule }  from './modules/workshop/workshop.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Two named throttlers. Both apply globally to every route, but their global
    // limits are loose. The strict 5/min on /auth/login is achieved by
    // OVERRIDING the 'short' tracker on that route via @Throttle({ short: {...} }).
    //   - default: 120 req/min per IP (caps normal app usage)
    //   - short:   1000 req/min per IP (effectively unlimited globally;
    //              overridden down to 5/min on the login endpoint only)
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120  },
      { name: 'short',   ttl: 60_000, limit: 1000 },
    ]),
    PrismaModule,
    BranchAccessModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    BranchesModule,
    PartsModule,
    StockModule,
    SalesModule,
    CustomersModule,
    SuppliersModule,
    SettingsModule,
    PurchasesModule,
    TransfersModule,
    FinanceModule,
    ReturnsModule,
    ReportsModule,
    InvoicesModule,
    AuditModule,
    PapersModule,
    ChequesModule,
    JofotaraModule,
    SearchModule,
    TelegramModule,
    FifoModule,
    VehiclesModule,
    WorkshopModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: ThrottlerGuard   },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
