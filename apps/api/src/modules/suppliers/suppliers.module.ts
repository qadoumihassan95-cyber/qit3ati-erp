import { Module, Controller, Get, Post, Put, Param, Body, Query, Injectable } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class SupplierDto {
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() address?: string;
}

@Injectable()
class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}
  list(tenantId: string, q?: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: { name: 'asc' }, take: 200,
    });
  }
  create(tenantId: string, d: SupplierDto) { return this.prisma.supplier.create({ data: { ...d, tenantId } }); }
  update(tenantId: string, id: string, d: SupplierDto) { return this.prisma.supplier.update({ where: { id }, data: { ...d, tenantId } }); }
}

@Controller('suppliers')
class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}
  @Get() @Permissions('purchase.view')
  list(@Tenant() tid: string, @Query('q') q?: string) { return this.svc.list(tid, q); }
  @Post() @Permissions('purchase.create')
  create(@Tenant() tid: string, @Body() d: SupplierDto) { return this.svc.create(tid, d); }
  @Put(':id') @Permissions('purchase.create')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() d: SupplierDto) { return this.svc.update(tid, id, d); }
}

@Module({ controllers: [SuppliersController], providers: [SuppliersService] })
export class SuppliersModule {}
