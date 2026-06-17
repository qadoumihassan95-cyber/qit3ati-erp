import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let db = 'down';
    try { await this.prisma.$queryRaw`SELECT 1`; db = 'up'; } catch { /* */ }
    return { ok: true, service: 'qit3ati-api', db, uptime: process.uptime(), ts: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
