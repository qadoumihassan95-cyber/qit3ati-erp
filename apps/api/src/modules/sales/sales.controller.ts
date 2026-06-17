import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SalesService } from './sales.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class CartItemDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0.01) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

class CreateSaleDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() posSessionId?: string;
  @IsOptional() @IsEnum(['cash','credit','card','bank','cheque']) paymentType?: 'cash'|'credit'|'card'|'bank'|'cheque';
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items!: CartItemDto[];
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @Permissions('sales.view')
  list(@Tenant() tenantId: string,
       @Query('branchId') branchId?: string,
       @Query('page')    page?: string,
       @Query('perPage') perPage?: string) {
    return this.sales.list(tenantId, branchId, page ? +page : 1, perPage ? +perPage : 25);
  }

  @Get(':id')
  @Permissions('sales.view')
  one(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.sales.findOne(tenantId, id);
  }

  @Post()
  @Permissions('sales.create')
  create(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Body() dto: CreateSaleDto) {
    return this.sales.createSale(tenantId, user.sub, dto);
  }
}
