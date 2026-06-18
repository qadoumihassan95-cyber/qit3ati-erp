import { Body, Controller, Get, Param, Post, Put, Query, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JofotaraEnvironment, JofotaraStatus, JofotaraDocumentType } from '@prisma/client';
import { JofotaraService } from './jofotara.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class SaveConfigDto {
  @IsOptional() @IsString() @MaxLength(120) clientId?: string;
  /** Plain secret — encrypted server-side before storage. Empty/omitted = unchanged. */
  @IsOptional() @IsString() @MaxLength(500) secret?: string;
  @IsOptional() @IsString() @MaxLength(40)  activityNumber?: string;
  @IsOptional() @IsString() @MaxLength(40)  taxpayerNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsEnum(JofotaraEnvironment) environment?: JofotaraEnvironment;
  @IsOptional() @IsString() @MaxLength(300) baseUrlOverride?: string;
  @IsOptional() @IsBoolean() autoSendOnSale?: boolean;
  @IsOptional() @IsInt() timeoutMs?: number;
}

class SubmitOptsDto {
  @IsOptional() @IsBoolean() forceResubmit?: boolean;
  @IsOptional() @IsEnum(JofotaraDocumentType) documentType?: JofotaraDocumentType;
}

class ListSubmissionsDto {
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsEnum(JofotaraStatus) status?: JofotaraStatus;
  @IsOptional() @IsInt() limit?: number;
}

@Controller('jofotara')
export class JofotaraController {
  constructor(private readonly svc: JofotaraService) {}

  // -------- Config --------

  @Get('config')
  @Permissions('jofotara.view')
  getConfig(@Tenant() tenantId: string) {
    return this.svc.getConfig(tenantId);
  }

  @Put('config')
  @Permissions('jofotara.config')
  saveConfig(@Tenant() tenantId: string, @Body() dto: SaveConfigDto) {
    return this.svc.saveConfig(tenantId, dto);
  }

  // -------- Test connection (rate-limited — outbound HTTP) --------

  @Post('test-connection')
  @HttpCode(200)
  @Permissions('jofotara.config')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  testConnection(@Tenant() tenantId: string) {
    return this.svc.testConnection(tenantId);
  }

  // -------- Submit / resubmit --------

  @Post('submit/:invoiceId')
  @HttpCode(200)
  @Permissions('jofotara.send')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submit(
    @Tenant() tenantId: string,
    @CurrentUser() u: JwtUser,
    @Param('invoiceId') invoiceId: string,
    @Body() opts: SubmitOptsDto,
  ) {
    return this.svc.submitInvoice(tenantId, u.sub, invoiceId, opts);
  }

  @Post('resubmit/:invoiceId')
  @HttpCode(200)
  @Permissions('jofotara.send')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  resubmit(
    @Tenant() tenantId: string,
    @CurrentUser() u: JwtUser,
    @Param('invoiceId') invoiceId: string,
    @Body() opts: SubmitOptsDto,
  ) {
    return this.svc.submitInvoice(tenantId, u.sub, invoiceId, { ...opts, forceResubmit: true });
  }

  // -------- XML download --------

  @Get('xml/:invoiceId')
  @Permissions('jofotara.view')
  getXml(@Tenant() tenantId: string, @Param('invoiceId') invoiceId: string) {
    return this.svc.getInvoiceXml(tenantId, invoiceId);
  }

  // -------- Submissions list (audit log) --------

  @Get('submissions')
  @Permissions('jofotara.view')
  listSubmissions(@Tenant() tenantId: string, @Query() q: ListSubmissionsDto) {
    return this.svc.listSubmissions(tenantId, q);
  }

  // -------- Dashboard --------

  @Get('dashboard')
  @Permissions('jofotara.view')
  dashboard(@Tenant() tenantId: string) {
    return this.svc.dashboard(tenantId);
  }
}
