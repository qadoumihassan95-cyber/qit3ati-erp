import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ChequeDirection, ChequeStatus } from '@prisma/client';
import { ChequesService } from './cheques.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

class CreateChequeDto {
  @IsEnum(ChequeDirection) direction!: ChequeDirection;
  @IsString() @MinLength(1) @MaxLength(60) chequeNo!: string;
  @IsOptional() @IsString() bankId?: string;
  @IsOptional() @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @MaxLength(200) partyName?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsNumber() @Min(0.001) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() fileUrl?: string;
}

class UpdateChequeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) chequeNo?: string;
  @IsOptional() @IsString() bankId?: string;
  @IsOptional() @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @MaxLength(200) partyName?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsNumber() @Min(0.001) amount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() fileUrl?: string;
}

class SettleDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class BounceDto {
  @IsString() @MinLength(2) @MaxLength(300) reason!: string;
}

class CancelDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

class SearchChequeDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() direction?: string;     // 'all' | ChequeDirection
  @IsOptional() @IsString() status?: string;        // 'all' | ChequeStatus
  @IsOptional() @IsString() bankId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsInt() page?: number;
  @IsOptional() @IsInt() perPage?: number;
}

@Controller('cheques')
export class ChequesController {
  constructor(private readonly svc: ChequesService) {}

  @Get()
  @Permissions('cheques.view')
  list(@Tenant() tenantId: string, @Query() q: SearchChequeDto) {
    return this.svc.list(tenantId, q as any);
  }

  @Get('dashboard')
  @Permissions('cheques.view')
  dashboard(@Tenant() tenantId: string) {
    return this.svc.dashboard(tenantId);
  }

  @Get(':id')
  @Permissions('cheques.view')
  findOne(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.findOne(tenantId, id);
  }

  @Post()
  @Permissions('cheques.manage')
  create(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Body() dto: CreateChequeDto) {
    return this.svc.create(tenantId, u.sub, dto);
  }

  @Put(':id')
  @Permissions('cheques.manage')
  update(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateChequeDto) {
    return this.svc.update(tenantId, u.sub, id, dto);
  }

  @Patch(':id/collect')
  @Permissions('cheques.collect')
  collect(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: SettleDto) {
    return this.svc.collect(tenantId, u.sub, id, body);
  }

  @Patch(':id/pay')
  @Permissions('cheques.collect')
  pay(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: SettleDto) {
    return this.svc.pay(tenantId, u.sub, id, body);
  }

  @Patch(':id/bounce')
  @Permissions('cheques.manage')
  bounce(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: BounceDto) {
    return this.svc.bounce(tenantId, u.sub, id, body);
  }

  @Patch(':id/cancel')
  @Permissions('cheques.manage')
  cancel(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: CancelDto) {
    return this.svc.cancel(tenantId, u.sub, id, body);
  }

  @Delete(':id')
  @Permissions('cheques.manage')
  remove(@Tenant() tenantId: string, @CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.svc.remove(tenantId, u.sub, id);
  }
}
