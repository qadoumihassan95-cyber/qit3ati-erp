import { Module, Controller, Get, Put, Body, Injectable } from '@nestjs/common';
import { IsBoolean, IsHexColor, IsNumber, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class SettingsDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(50)  taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) @IsUrl({ require_tld: false }) logoUrl?: string;
  // 7-char hex like #1E5F74 (Prisma column is VarChar(9))
  @IsOptional() @IsString() @Length(4, 9) @Matches(/^#[0-9A-Fa-f]{3,8}$/, { message: 'colorPrimary يجب أن يكون لون hex مثل #1E5F74' })
  colorPrimary?: string;
  @IsOptional() @IsString() @Length(4, 9) @Matches(/^#[0-9A-Fa-f]{3,8}$/, { message: 'colorSecondary يجب أن يكون لون hex مثل #FF7A00' })
  colorSecondary?: string;
  // ISO 4217 currency code (3 chars), e.g. JOD, USD
  @IsOptional() @IsString() @Length(3, 3, { message: 'currency يجب 3 أحرف (ISO 4217) مثل JOD' })
  currency?: string;
  @IsOptional() @IsNumber() @Min(0, { message: 'tax_rate يجب ألا يكون سالباً' }) @Max(100, { message: 'tax_rate لا يتجاوز 100' })
  taxRate?: number;
  @IsOptional() @IsString() @Length(2, 5) language?: string;
  @IsOptional() @IsString() @MaxLength(2000) invoiceHeader?: string;
  @IsOptional() @IsString() @MaxLength(2000) invoiceFooter?: string;
  @IsOptional() @IsString() @MaxLength(30)  phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsBoolean() jofotaraEnabled?: boolean;
}

@Injectable()
class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  get(tenantId: string) { return this.prisma.tenantSettings.findUnique({ where: { tenantId } }); }
  update(tenantId: string, d: SettingsDto) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId }, update: d, create: { tenantId, ...d },
    });
  }
}

@Controller('settings')
class SettingsController {
  constructor(private readonly svc: SettingsService) {}
  @Get() get(@Tenant() tid: string) { return this.svc.get(tid); }
  @Put() @Permissions('settings.edit')
  update(@Tenant() tid: string, @Body() d: SettingsDto) { return this.svc.update(tid, d); }
}

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
