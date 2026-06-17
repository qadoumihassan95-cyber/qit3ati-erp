import { Module, Controller, Get, Put, Body, Injectable } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

class SettingsDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(50)  taxNumber?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() colorPrimary?: string;
  @IsOptional() @IsString() colorSecondary?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() taxRate?: number;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() invoiceHeader?: string;
  @IsOptional() @IsString() invoiceFooter?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
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
