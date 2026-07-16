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
  // wizard extras
  @IsOptional() supplier?: any;
  @IsOptional() branch?: any;
  @IsOptional() quantity?: any;
  @IsOptional() notes?: any;
}

class ImportDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
  @IsOptional() @IsBoolean() skipDuplicates?: boolean;
  @IsOptional() @IsString() mode?: 'create-only' | 'update-existing' | 'upsert';
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() autoCreateSuppliers?: boolean;
}

class AddImageDto {
  @IsString() @MinLength(1) @MaxLength(6_000_000) url!: string; // http(s) URL or data: URL
  @IsOptional() @IsBoolean() isPrimary?: boolean;
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
   * Barcode lookup for the scanner UI (mobile camera + USB scanner).
   * Returns the part with per-branch stock, or 404 if the barcode isn't
   * registered — the frontend uses the 404 to prompt "Create new product?".
   *
   * Case-insensitive exact match. We deliberately do NOT fall back to a
   * fuzzy search here; the scanner needs an unambiguous lookup so the
   * user isn't tricked into scanning to the wrong SKU.
   */
  @Get('by-barcode/:code')
  @Permissions('parts.view')
  byBarcode(@Tenant() tenantId: string, @Param('code') code: string) {
    return this.parts.findByBarcode(tenantId, code);
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
      skipDuplicates:      dto.skipDuplicates ?? true,
      mode:                dto.mode,
      branchId:            dto.branchId ?? null,
      autoCreateSuppliers: dto.autoCreateSuppliers ?? false,
    });
  }

  // ─── Part images ───────────────────────────────────────────────
  @Get(':id/images')
  @Permissions('parts.view')
  listImages(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parts.listImages(tenantId, id);
  }

  @Post(':id/images')
  @Permissions('parts.edit')
  addImage(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddImageDto,
  ) {
    return this.parts.addImage(tenantId, id, dto.url, dto.isPrimary ?? false);
  }

  @Put(':id/images/:imageId/primary')
  @Permissions('parts.edit')
  setImagePrimary(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.parts.setImagePrimary(tenantId, id, imageId);
  }

  @Delete(':id/images/:imageId')
  @Permissions('parts.edit')
  deleteImage(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.parts.deleteImage(tenantId, id, imageId);
  }
}
