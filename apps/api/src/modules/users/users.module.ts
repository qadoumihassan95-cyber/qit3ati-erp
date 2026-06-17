import { Module, Controller, Get, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

@Injectable()
class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: { role: true, userBranches: { include: { branch: true } } },
      orderBy: { fullName: 'asc' },
    });
  }
}

@Controller('users')
class UsersController {
  constructor(private readonly svc: UsersService) {}
  @Get() @Permissions('users.manage')
  list(@Tenant() tid: string) { return this.svc.list(tid); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
