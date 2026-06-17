import { Module, Controller, Get, Post, Put, Param, Body, Injectable } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class BranchDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isMain?: boolean;
}

@Injectable()
class BranchesService {
  constructor(private readonly prisma: PrismaService) {}
  list(tenantId: string) {
    return this.prisma.branch.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ isMain: 'desc' }, { name: 'asc' }] });
  }
  create(tenantId: string, d: BranchDto) { return this.prisma.branch.create({ data: { ...d, tenantId } }); }
  update(tenantId: string, id: string, d: BranchDto) { return this.prisma.branch.update({ where: { id }, data: { ...d, tenantId } }); }
}

@Controller('branches')
class BranchesController {
  constructor(private readonly svc: BranchesService) {}
  @Get() list(@Tenant() tid: string) { return this.svc.list(tid); }
  @Post() @Permissions('settings.edit')
  create(@Tenant() tid: string, @Body() d: BranchDto) { return this.svc.create(tid, d); }
  @Put(':id') @Permissions('settings.edit')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() d: BranchDto) { return this.svc.update(tid, id, d); }
}

@Module({ controllers: [BranchesController], providers: [BranchesService] })
export class BranchesModule {}
