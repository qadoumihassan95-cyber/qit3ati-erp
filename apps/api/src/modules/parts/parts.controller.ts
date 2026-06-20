import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
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

class ImportRowDto {
  @IsOptional() sku?: any;
  @IsOptional() name?: any;
  @IsOptional() nameEn?: any;
  @IsOptional() partNumber?: any;
  @IsOptional() oemNumber?: any;
  @IsOptional() barcode?: any;
  @IsOptional() manufacturer?: any;
  @IsOptional() countryOrigin?: any;
  @IsOptional() unit?: any;
  @IsOptional() costPrice?: any;
  @IsOptional() retailPrice?: any;
  @IsOptional() wholesalePrice?: any;
  @IsOptional() minStock?: any;
  @IsOptional() warrantyMonths?: any;
  @IsOptional() taxRate?: any;
}

class ImportDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
  @IsOptional() @IsBoolean() skipDuplicates?: boolean;
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

  /**
   * Aggregated 360° view for the part-details modal — one call returns
   * stock, last sale/purchase, lifetime totals, sales/purchase history, and
   * stock movements. Heavier than /:id so we expose it as a separate route.
   */
  @Get(':id/full-details')
  @Permissions('parts.view')
  fullDetails(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parts.fullDetails(tenantId, id);
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

  /**
   * Bulk Excel/CSV import. Tightly rate-limited (3 imports/minute/IP) to prevent
   * accidentally hammering the DB with 5000-row uploads in a tight loop.
   */
  @Post('import')
  @HttpCode(200)
  @Permissions('parts.create')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  bulkImport(
    @Tenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportDto,
  ) {
    return this.parts.bulkImport(tenantId, user.sub, dto.rows as any[], {
      skipDuplicates: dto.skipDuplicates ?? true,
    });
  }
}
