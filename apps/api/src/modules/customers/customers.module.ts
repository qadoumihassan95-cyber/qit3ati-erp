import { Module, Controller, Get, Post, Put, Param, Body, Query, Injectable } from '@nestjs/common';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class CustomerDto {
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail()  email?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(['retail','wholesale','special']) priceTier?: 'retail'|'wholesale'|'special';
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
}

@Injectable()
class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
  list(tenantId: string, q?: string) {
    return this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}) },
      orderBy: { name: 'asc' }, take: 200,
    });
  }
  create(tenantId: string, d: CustomerDto) { return this.prisma.customer.create({ data: { ...d, tenantId } }); }
  update(tenantId: string, id: string, d: CustomerDto) { return this.prisma.customer.update({ where: { id }, data: { ...d, tenantId } }); }
  remove(tenantId: string, id: string) { return this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), tenantId } }); }
}

@Controller('customers')
class CustomersController {
  constructor(private readonly svc: CustomersService) {}
  @Get() @Permissions('sales.view')
  list(@Tenant() tid: string, @Query('q') q?: string) { return this.svc.list(tid, q); }
  @Post() @Permissions('sales.create')
  create(@Tenant() tid: string, @Body() d: CustomerDto) { return this.svc.create(tid, d); }
  @Put(':id') @Permissions('sales.create')
  update(@Tenant() tid: string, @Param('id') id: string, @Body() d: CustomerDto) { return this.svc.update(tid, id, d); }
}

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}
