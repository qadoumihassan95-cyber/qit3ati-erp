import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PurchasesService } from './purchases.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class PurchaseItemDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0.01) qty!: number;
  @IsNumber() @Min(0) unitCost!: number;
}

class CreatePurchaseDto {
  @IsString() branchId!: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() invoiceNo?: string;
  @IsOptional() @IsString() supplierRef?: string;
  @IsOptional() @IsISO8601() invoiceDate?: string;
  @IsOptional() @IsEnum(['cash','credit','card','bank','cheque'])
  paymentType?: 'cash'|'credit'|'card'|'bank'|'cheque';
  @IsOptional() @IsString() attachmentUrl?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @Permissions('purchase.view')
  list(
    @Tenant() tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.purchases.list(
      tenantId,
      branchId,
      page ? +page : 1,
      perPage ? +perPage : 25,
    );
  }

  @Get(':id')
  @Permissions('purchase.view')
  one(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.purchases.findOne(tenantId, id);
  }

  @Post()
  @Permissions('purchase.create')
  create(
    @Tenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.purchases.createPurchase(tenantId, user.sub, dto);
  }
}
