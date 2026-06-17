import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Two named throttlers:
    //   - default: 120 req/min per IP (generous, for normal app usage)
    //   - auth:    5  req/min per IP (strict, brute-force protection on login)
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth',    ttl: 60_000, limit: 5   },
    ]),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
