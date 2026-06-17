import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global throttler: 120 req/min per IP by default.
    // Strict 5/min on `/auth/login` is applied via the `@Throttle` decorator on
    // that route. Using a single tracker keeps startup simple and predictable
    // (named throttlers were causing edge-case startup issues on Render).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
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
