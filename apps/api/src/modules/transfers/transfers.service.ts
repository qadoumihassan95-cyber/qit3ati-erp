import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface TransferItemInput {
  partId: string;
  qty: number;
}

export interface CreateTransferInput {
  fromBranch: string;
  toBranch: string;
  items: TransferItemInput[];
}

export interface ReceiveTransferItemInput {
  partId: string;
  qtyReceived: number;
}

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create + immediately mark in-transit:
   *  - validates source has enough stock at the source warehouse
   *  - decrements source stock
   *  - records a stock_movement (type=transfer, negative) for audit
   *  - leaves status=in_transit until destination calls receive()
   */
  async create(tenantId: string, createdBy: string, input: CreateTransferInput) {
    if (input.fromBranch === input.toBranch) {
      throw new BadRequestException('source and destination branches must differ');
    }
    if (!input.items?.length) throw new BadRequestException('transfer has no items');

    return this.prisma.$transaction(async (tx) => {
      const fromWarehouse = await tx.warehouse.findFirst({
        where: { tenantId, branchId: input.fromBranch },
        orderBy: { isMain: 'desc' },
      });
      if (!fromWarehouse) throw new BadRequestException('source branch has no warehouse');

      // ensure destination branch exists (and presumably has a warehouse, which we'll need on receive)
      const destBranch = await tx.branch.findFirst({
        where: { id: input.toBranch, tenantId, deletedAt: null },
      });
      if (!destBranch) throw new NotFoundException('destination branch not found');

      const partIds = input.items.map((i) => i.partId);
      const stocks = await tx.stock.findMany({
        where: { tenantId, warehouseId: fromWarehouse.id, partId: { in: partIds } },
      });
      const stockByPart = new Map(stocks.map((s) => [s.partId, s]));

      // pre-validate quantities
      for (const it of input.items) {
        if (it.qty <= 0) throw new BadRequestException('qty must be > 0');
        const st = stockByPart.get(it.partId);
        const available = st ? Number(st.quantity) - Number(st.reserved) : 0;
        if (available < it.qty) {
          throw new BadRequestException(`insufficient stock for part ${it.partId} (available ${available}, requested ${it.qty})`);
        }
      }

      const transfer = await tx.transfer.create({
        data: {
          tenantId,
          fromBranch: input.fromBranch,
          toBranch: input.toBranch,
          status: 'in_transit',
          createdBy,
          items: {
            create: input.items.map((i) => ({ partId: i.partId, qtySent: i.qty })),
          },
        },
        include: { items: true },
      });

      // decrement source stock + log movements
      for (const it of input.items) {
        const st = stockByPart.get(it.partId)!;
        await tx.stock.update({
          where: { id: st.id },
          data: { quantity: { decrement: it.qty } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: input.fromBranch,
            partId: it.partId,
            type: 'transfer',
            qtyChange: -it.qty,
            userId: createdBy,
            refTable: 'transfers',
            refId: transfer.id,
          },
        });
      }

      return transfer;
    });
  }

  /**
   * Destination branch receives the transfer (possibly with adjustments):
   *  - increments stock at destination warehouse for each qtyReceived
   *  - sets transfer status = received
   *  - records stock_movement (type=transfer, positive) at destination
   *  - records discrepancies (if qtyReceived < qtySent) as damage at the destination
   */
  async receive(tenantId: string, userId: string, transferId: string, items: ReceiveTransferItemInput[]) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: { id: transferId, tenantId },
        include: { items: true },
      });
      if (!transfer) throw new NotFoundException('transfer not found');
      if (transfer.status !== 'in_transit' && transfer.status !== 'pending') {
        throw new BadRequestException(`transfer is already ${transfer.status}`);
      }
      const toBranch = transfer.toBranch!;
      const destWarehouse = await tx.warehouse.findFirst({
        where: { tenantId, branchId: toBranch },
        orderBy: { isMain: 'desc' },
      });
      if (!destWarehouse) throw new BadRequestException('destination branch has no warehouse — create one first');

      const receivedByPart = new Map(items.map((i) => [i.partId, i.qtyReceived]));

      for (const line of transfer.items) {
        const recv = receivedByPart.get(line.partId) ?? Number(line.qtySent ?? 0);
        if (recv < 0) throw new BadRequestException('qty received cannot be negative');

        const sent = Number(line.qtySent ?? 0);
        const lost = sent - recv;

        // update transfer line qty_received
        await tx.transferItem.update({
          where: { transferId_partId: { transferId, partId: line.partId } },
          data: { qtyReceived: recv },
        });

        if (recv > 0) {
          // upsert destination stock
          const existing = await tx.stock.findFirst({
            where: { tenantId, warehouseId: destWarehouse.id, partId: line.partId },
          });
          if (existing) {
            await tx.stock.update({
              where: { id: existing.id },
              data: { quantity: { increment: recv }, status: 'available' },
            });
          } else {
            await tx.stock.create({
              data: {
                tenantId,
                branchId: toBranch,
                warehouseId: destWarehouse.id,
                partId: line.partId,
                quantity: recv,
                status: 'available',
              },
            });
          }
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId: toBranch,
              partId: line.partId,
              type: 'transfer',
              qtyChange: recv,
              userId,
              refTable: 'transfers',
              refId: transferId,
            },
          });
        }

        if (lost > 0) {
          // record discrepancy as damage at destination (visible in damaged_items)
          await tx.damagedItem.create({
            data: {
              tenantId,
              branchId: toBranch,
              partId: line.partId,
              qty: lost,
              reason: `transfer shortage (transfer ${transferId})`,
              createdBy: userId,
            },
          });
        }
      }

      return tx.transfer.update({
        where: { id: transferId },
        data: { status: 'received', receivedBy: userId },
        include: { items: true, from: true, to: true },
      });
    });
  }

  async cancel(tenantId: string, userId: string, transferId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: { id: transferId, tenantId },
        include: { items: true },
      });
      if (!transfer) throw new NotFoundException('transfer not found');
      if (transfer.status === 'received' || transfer.status === 'cancelled') {
        throw new BadRequestException(`cannot cancel a ${transfer.status} transfer`);
      }
      const fromBranch = transfer.fromBranch!;
      const fromWarehouse = await tx.warehouse.findFirst({
        where: { tenantId, branchId: fromBranch },
        orderBy: { isMain: 'desc' },
      });
      // refund source stock
      if (fromWarehouse) {
        for (const line of transfer.items) {
          const sent = Number(line.qtySent ?? 0);
          if (sent <= 0) continue;
          const st = await tx.stock.findFirst({
            where: { tenantId, warehouseId: fromWarehouse.id, partId: line.partId },
          });
          if (st) {
            await tx.stock.update({
              where: { id: st.id },
              data: { quantity: { increment: sent } },
            });
          }
          await tx.stockMovement.create({
            data: {
              tenantId, branchId: fromBranch, partId: line.partId,
              type: 'adjust', qtyChange: sent, userId,
              refTable: 'transfers', refId: transferId,
            },
          });
        }
      }
      return tx.transfer.update({
        where: { id: transferId },
        data: { status: 'cancelled' },
      });
    });
  }

  async list(tenantId: string, branchId?: string) {
    return this.prisma.transfer.findMany({
      where: {
        tenantId,
        ...(branchId ? { OR: [{ fromBranch: branchId }, { toBranch: branchId }] } : {}),
      },
      include: {
        from:   { select: { id: true, name: true } },
        to:     { select: { id: true, name: true } },
        items:  { include: { part: { select: { id: true, sku: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(tenantId: string, id: string) {
    const t = await this.prisma.transfer.findFirst({
      where: { id, tenantId },
      include: {
        from:    true,
        to:      true,
        creator: { select: { id: true, fullName: true } },
        receiver:{ select: { id: true, fullName: true } },
        items:   { include: { part: true } },
      },
    });
    if (!t) throw new NotFoundException('transfer not found');
    return t;
  }
}
