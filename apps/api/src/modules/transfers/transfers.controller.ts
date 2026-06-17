import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { TransfersService } from './transfers.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

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
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @Permissions('stock.view')
  list(@Tenant() tid: string, @Query('branchId') branchId?: string) {
    return this.transfers.list(tid, branchId);
  }

  @Get(':id')
  @Permissions('stock.view')
  one(@Tenant() tid: string, @Param('id') id: string) {
    return this.transfers.findOne(tid, id);
  }

  @Post()
  @Permissions('transfer.create')
  create(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Body() dto: CreateTransferDto) {
    return this.transfers.create(tid, user.sub, dto);
  }

  @Post(':id/receive')
  @Permissions('transfer.approve')
  receive(
    @Tenant() tid: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    return this.transfers.receive(tid, user.sub, id, dto.items);
  }

  @Post(':id/cancel')
  @Permissions('transfer.approve')
  cancel(@Tenant() tid: string, @CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.transfers.cancel(tid, user.sub, id);
  }
}
