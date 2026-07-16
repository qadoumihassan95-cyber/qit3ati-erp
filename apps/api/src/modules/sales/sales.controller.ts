import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SalesService } from './sales.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/branch-access/branch-access.service';

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
  constructor(
    private readonly sales: SalesService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get()
  @Permissions('sales.view')
  async list(@Tenant() tenantId: string,
             @CurrentUser() user: JwtUser,
             @Query('branchId') branchId?: string,
             @Query('page')    page?: string,
             @Query('perPage') perPage?: string) {
    // scope() validates access if branchId was passed, or returns
    // the user's accessible branches (owners → null → all).
    const scope = await this.branchAccess.scope(user, tenantId, branchId);
    return this.sales.list(tenantId, scope, page ? +page : 1, perPage ? +perPage : 25);
  }

  @Get(':id')
  @Permissions('sales.view')
  async one(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    const invoice = await this.sales.findOne(tenantId, id);
    // block cross-branch reads at the record level: a manager can't
    // fetch invoice by UUID from a branch they don't have access to.
    if (invoice?.branchId) await this.branchAccess.assertWrite(user, tenantId, invoice.branchId);
    return invoice;
  }

  @Post()
  @Permissions('sales.create')
  async create(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Body() dto: CreateSaleDto) {
    await this.branchAccess.assertWrite(user, tenantId, dto.branchId);
    return this.sales.createSale(tenantId, user.sub, dto);
  }
}
