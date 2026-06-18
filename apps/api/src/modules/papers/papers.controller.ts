import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { OfficialPaperStatus, OfficialPaperType } from '@prisma/client';
import { PapersService } from './papers.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class CreatePaperDto {
  @IsEnum(OfficialPaperType) type!: OfficialPaperType;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) docNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) issuer?: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEnum(OfficialPaperStatus) statusOverride?: OfficialPaperStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() fileUrl?: string;
}

class UpdatePaperDto {
  @IsOptional() @IsEnum(OfficialPaperType) type?: OfficialPaperType;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) docNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) issuer?: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEnum(OfficialPaperStatus) statusOverride?: OfficialPaperStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() fileUrl?: string;
}

class RenewPaperDto {
  @IsDateString() issuedAt!: string;
  @IsDateString() expiresAt!: string;
  @IsOptional() @IsString() notes?: string;
}

class SetStatusDto {
  @IsEnum(OfficialPaperStatus) status!: OfficialPaperStatus;
}

class SearchPaperDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(OfficialPaperType) type?: OfficialPaperType;
  @IsOptional() @IsString() status?: string;            // 'all' | OfficialPaperStatus
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsInt() expiringWithinDays?: number;
  @IsOptional() @IsInt() page?: number;
  @IsOptional() @IsInt() perPage?: number;
}

@Controller('papers')
export class PapersController {
  constructor(private readonly svc: PapersService) {}

  @Get()
  @Permissions('documents.view')
  list(@Tenant() tenantId: string, @Query() q: SearchPaperDto) {
    return this.svc.list(tenantId, q as any);
  }

  @Get('summary')
  @Permissions('documents.view')
  summary(@Tenant() tenantId: string) {
    return this.svc.summary(tenantId);
  }

  @Get(':id')
  @Permissions('documents.view')
  findOne(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.findOne(tenantId, id);
  }

  @Post()
  @Permissions('documents.manage')
  create(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Body() dto: CreatePaperDto) {
    return this.svc.create(tenantId, u.sub, dto);
  }

  @Put(':id')
  @Permissions('documents.manage')
  update(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdatePaperDto) {
    return this.svc.update(tenantId, u.sub, id, dto);
  }

  @Patch(':id/renew')
  @Permissions('documents.manage')
  renew(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: RenewPaperDto) {
    return this.svc.renew(tenantId, u.sub, id, dto);
  }

  @Patch(':id/status')
  @Permissions('documents.manage')
  setStatus(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.svc.setStatus(tenantId, u.sub, id, dto.status);
  }

  @Delete(':id')
  @Permissions('documents.manage')
  remove(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.svc.remove(tenantId, u.sub, id);
  }
}
