import { Module, Controller, Get, Query, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

@Injectable()
class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, entity?: string, userId?: string, limit = 100) {
    const items = await this.prisma.auditLog.findMany({
      where: { tenantId, ...(entity ? { entity } : {}), ...(userId ? { userId } : {}) },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 10), 500),
    });
    // Convert BigInt id to string for JSON safety
    return items.map((i) => {
      const { id, ...rest } = i;
      return { id: id.toString(), ...rest };
    });
  }
}

@Controller('audit')
class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  @Permissions('users.manage')
  list(
    @Tenant() tid: string,
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.svc.list(tid, entity, userId, limit ? +limit : 100);
  }
}

@Module({ controllers: [AuditController], providers: [AuditService] })
export class AuditModule {}
