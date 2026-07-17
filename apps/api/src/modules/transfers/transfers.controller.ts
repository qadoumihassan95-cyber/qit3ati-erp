import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { TransfersService } from './transfers.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BranchAccessService } from '../../common/branch-access/branch-access.service';

class TransferItemDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0.01) qty!: number;
}

class CreateTransferDto {
  @IsString() fromBranch!: string;
  @IsString() toBranch!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TransferItemDto)
  items!: TransferItemDto[];
}

class ReceiveItemDto {
  @IsString() partId!: string;
  @IsNumber() @Min(0) qtyReceived!: number;
}

class ReceiveTransferDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];
}

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Get()
  @Permissions('stock.view')
  async list(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    const scope = await this.branchAccess.scope(user, tid, branchId);
    return this.transfers.list(tid, scope);
  }

  @Get(':id')
  @Permissions('stock.view')
  async one(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    const t = await this.transfers.findOne(tid, id);
    // A user needs access to EITHER source OR target branch to
    // view the transfer (both parties in a legitimate transfer
    // typically see the paperwork).
    if (t?.fromBranch && t?.toBranch && !this.branchAccess.isOwner(user)) {
      const accessible = (await this.branchAccess.getAccessibleBranchIds(user, tid)) ?? [];
      const sees = accessible.includes(t.fromBranch) || accessible.includes(t.toBranch);
      if (!sees) throw new ForbiddenException('no branch access to this transfer');
    }
    return t;
  }

  @Post()
  @Permissions('transfer.create')
  async create(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Body() dto: CreateTransferDto) {
    // Transfer creator must have access to the source branch (they're
    // moving stock OUT of it). Target branch access is not required —
    // the receiver on the other end is a different person, and their
    // access is checked at receive() time.
    await this.branchAccess.assertWrite(user, tid, dto.fromBranch);
    // Target branch — validate it belongs to tenant + active, but
    // don't require the user to be assigned to it (they're only
    // sending; the receive() call is the target-side gate).
    await this.branchAccess.assertBranchInTenant(tid, dto.toBranch);
    return this.transfers.create(tid, user.sub, dto);
  }

  @Post(':id/receive')
  @Permissions('transfer.approve')
  async receive(
    @Tenant() tid: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    // Receiver must have access to the target branch (stock going IN).
    const t = await this.transfers.findOne(tid, id);
    if (!t) return null;
    // Transfer.toBranch is nullable in the schema (String?); reject if
    // the record is missing its target branch (would be an inconsistent
    // row anyway) rather than crashing the narrow.
    if (!t.toBranch)   throw new BadRequestException('transfer has no target branch');
    await this.branchAccess.assertWrite(user, tid, t.toBranch);
    return this.transfers.receive(tid, user.sub, id, dto.items);
  }

  @Post(':id/cancel')
  @Permissions('transfer.approve')
  async cancel(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    // Canceller must have access to the source branch (stock returning to it).
    const t = await this.transfers.findOne(tid, id);
    if (!t) return null;
    if (!t.fromBranch) throw new BadRequestException('transfer has no source branch');
    await this.branchAccess.assertWrite(user, tid, t.fromBranch);
    return this.transfers.cancel(tid, user.sub, id);
  }
}
