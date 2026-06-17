import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PartsService } from './parts.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class CreatePartDto {
  @IsString() @MinLength(1) @MaxLength(60)  sku!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() partNumber?: string;
  @IsOptional() @IsString() oemNumber?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() countryOrigin?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) retailPrice?: number;
  @IsOptional() @IsNumber() @Min(0) wholesalePrice?: number;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsNumber() @Min(0) warrantyMonths?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SearchDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() perPage?: number;
}

@Controller('parts')
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  @Permissions('parts.view')
  list(@Tenant() tenantId: string, @Query() q: SearchDto) {
    return this.parts.search(tenantId, q);
  }

  @Get(':id')
  @Permissions('parts.view')
  one(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parts.findOne(tenantId, id);
  }

  @Post()
  @Permissions('parts.create')
  create(@Tenant() tenantId: string, @CurrentUser() user: JwtUser, @Body() dto: CreatePartDto) {
    return this.parts.create(tenantId, user.sub, dto);
  }

  @Put(':id')
  @Permissions('parts.edit')
  update(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: CreatePartDto) {
    return this.parts.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('parts.delete')
  remove(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parts.softDelete(tenantId, id);
  }
}
