import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChequeDirection, ChequeStatus, Prisma } from '@prisma/client';

export interface ChequeSearchQuery {
  q?: string;
  direction?: ChequeDirection | 'all';
  status?: ChequeStatus | 'all';
  bankId?: string;
  customerId?: string;
  supplierId?: string;
  branchId?: string;
  from?: string;          // due-date range from
  to?: string;            // due-date range to
  page?: number;
  perPage?: number;
}

export interface CreateChequeInput {
  direction:  ChequeDirection;
  chequeNo:   string;
  bankId?:    string | null;
  bankName?:  string | null;
  partyName?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  amount:     number;
  dueDate:    string | Date;
  branchId?:  string | null;
  notes?:     string | null;
  fileUrl?:   string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayDiff = (d: Date) => Math.ceil((new Date(d).getTime() - Date.now()) / DAY_MS);

/** Live status: keep persisted status if terminal; otherwise derive from due date. */
export function computeChequeStatus(c: {
  status: ChequeStatus;
  dueDate: Date;
}): ChequeStatus {
  // terminal states stay as-is
  if (['collected', 'paid', 'bounced', 'cancelled'].includes(c.status)) return c.status;
  const diff = dayDiff(c.dueDate);
  if (diff < 0) return 'due_today';   // overdue still shows as due_today badge; UI flags lateness via daysLeft<0
  if (diff === 0) return 'due_today';
  if (diff <= 7) return 'due_soon';
  return 'new';
}

@Injectable()
export class ChequesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: ChequeSearchQuery) {
    const page    = Math.max(1, q.page ?? 1);
    const perPage = Math.min(200, Math.max(5, q.perPage ?? 50));

    const text = (q.q ?? '')
      .toString()
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 120)
      .trim();

    const where: Prisma.ChequeWhereInput = {
      tenantId,
      deletedAt: null,
      ...(q.direction && q.direction !== 'all' ? { direction: q.direction } : {}),
      ...(q.status    && q.status    !== 'all' ? { status:    q.status    } : {}),
      ...(q.bankId     ? { bankId:     q.bankId } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.branchId   ? { branchId:   q.branchId } : {}),
      ...(q.from || q.to
        ? {
            dueDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to   ? { lte: new Date(q.to)   } : {}),
            },
          }
        : {}),
      ...(text
        ? {
            OR: [
              { chequeNo:  { contains: text, mode: 'insensitive' } },
              { bankName:  { contains: text, mode: 'insensitive' } },
              { partyName: { contains: text, mode: 'insensitive' } },
              { notes:     { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        include: {
          branch:   { select: { id: true, name: true } },
          bank:     { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          creator:  { select: { id: true, fullName: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.cheque.count({ where }),
    ]);

    const augmented = items.map((c) => ({
      ...c,
      liveStatus: computeChequeStatus(c),
      daysLeft:   dayDiff(c.dueDate),
    }));

    return { items: augmented, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  async findOne(tenantId: string, id: string) {
    const c = await this.prisma.cheque.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch:   { select: { id: true, name: true } },
        bank:     { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        creator:  { select: { id: true, fullName: true } },
        receipt:  true,
        payment:  true,
        logs:     {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!c) throw new NotFoundException('الشيك غير موجود');
    return { ...c, liveStatus: computeChequeStatus(c), daysLeft: dayDiff(c.dueDate) };
  }

  /** Dashboard widget summary. */
  async dashboard(tenantId: string) {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * DAY_MS);

    const [incomingAll, outgoingAll, dueWeek, overdue, bounced] = await Promise.all([
      // total amount of all open incoming cheques (NOT collected/cancelled/bounced)
      this.prisma.cheque.aggregate({
        where: { tenantId, deletedAt: null, direction: 'incoming',
                 status: { notIn: ['collected', 'cancelled', 'bounced'] } },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.cheque.aggregate({
        where: { tenantId, deletedAt: null, direction: 'outgoing',
                 status: { notIn: ['paid', 'cancelled', 'bounced'] } },
        _sum: { amount: true }, _count: true,
      }),
      // cheques due this week (next 7 days, both directions, still open)
      this.prisma.cheque.aggregate({
        where: { tenantId, deletedAt: null,
                 status: { notIn: ['collected', 'paid', 'cancelled', 'bounced'] },
                 dueDate: { gte: now, lte: in7 } },
        _sum: { amount: true }, _count: true,
      }),
      // overdue (due in past, not yet settled)
      this.prisma.cheque.aggregate({
        where: { tenantId, deletedAt: null,
                 status: { notIn: ['collected', 'paid', 'cancelled', 'bounced'] },
                 dueDate: { lt: now } },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.cheque.aggregate({
        where: { tenantId, deletedAt: null, status: 'bounced' },
        _sum: { amount: true }, _count: true,
      }),
    ]);
    const toN = (v: any) => Number(v ?? 0);
    return {
      incoming: { count: incomingAll._count ?? 0, amount: toN(incomingAll._sum.amount) },
      outgoing: { count: outgoingAll._count ?? 0, amount: toN(outgoingAll._sum.amount) },
      dueThisWeek: { count: dueWeek._count ?? 0, amount: toN(dueWeek._sum.amount) },
      overdue:    { count: overdue._count ?? 0,  amount: toN(overdue._sum.amount) },
      bounced:    { count: bounced._count ?? 0,  amount: toN(bounced._sum.amount) },
    };
  }

  async create(tenantId: string, userId: string, dto: CreateChequeInput) {
    if (!dto.chequeNo?.trim()) throw new BadRequestException('رقم الشيك مطلوب');
    if (!dto.direction)        throw new BadRequestException('نوع الشيك مطلوب (لنا/علينا)');
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    if (!dto.dueDate)          throw new BadRequestException('تاريخ الاستحقاق مطلوب');

    // direction → party sanity: incoming should normally reference a customer,
    // outgoing a supplier (but partyName free-text fallback is OK).
    if (dto.direction === 'incoming' && dto.supplierId)
      throw new BadRequestException('شيك "لنا" يربط بعميل، ليس بمورد');
    if (dto.direction === 'outgoing' && dto.customerId)
      throw new BadRequestException('شيك "علينا" يربط بمورد، ليس بعميل');

    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId, deletedAt: null }, select: { id: true },
      });
      if (!b) throw new NotFoundException('الفرع غير موجود');
    }
    if (dto.bankId) {
      const bk = await this.prisma.bank.findFirst({
        where: { id: dto.bankId, tenantId }, select: { id: true },
      });
      if (!bk) throw new NotFoundException('البنك غير موجود');
    }
    if (dto.customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId, deletedAt: null }, select: { id: true },
      });
      if (!c) throw new NotFoundException('العميل غير موجود');
    }
    if (dto.supplierId) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null }, select: { id: true },
      });
      if (!s) throw new NotFoundException('المورد غير موجود');
    }

    // dup-chequeNo guard within same tenant + bank (a real cheque-book restriction)
    const dup = await this.prisma.cheque.findFirst({
      where: { tenantId, chequeNo: dto.chequeNo.trim(),
               ...(dto.bankId ? { bankId: dto.bankId } : {}),
               deletedAt: null },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`رقم الشيك "${dto.chequeNo}" مستخدم بالفعل لنفس البنك`);

    const created = await this.prisma.cheque.create({
      data: {
        tenantId, createdBy: userId,
        direction: dto.direction,
        chequeNo:  dto.chequeNo.trim().slice(0, 60),
        bankId:    dto.bankId    || null,
        bankName:  dto.bankName?.toString().slice(0, 150) || null,
        partyName: dto.partyName?.toString().slice(0, 200) || null,
        customerId: dto.customerId || null,
        supplierId: dto.supplierId || null,
        amount:    new Prisma.Decimal(dto.amount),
        dueDate:   new Date(dto.dueDate),
        branchId:  dto.branchId || null,
        notes:     dto.notes ?? null,
        fileUrl:   dto.fileUrl ?? null,
        status:    'new',
      },
    });
    await this.log(created.id, userId, null, 'new', 'تم إنشاء الشيك');
    return { ...created, liveStatus: computeChequeStatus(created), daysLeft: dayDiff(created.dueDate) };
  }

  async update(tenantId: string, userId: string, id: string, dto: Partial<CreateChequeInput>) {
    const existing = await this.prisma.cheque.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('الشيك غير موجود');
    // can't edit a settled cheque — must cancel/un-cancel first
    if (['collected', 'paid'].includes(existing.status)) {
      throw new BadRequestException('لا يمكن تعديل شيك تمّت تسويته');
    }
    if (dto.amount !== undefined && !(Number(dto.amount) > 0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }
    const updated = await this.prisma.cheque.update({
      where: { id },
      data: {
        ...(dto.chequeNo  !== undefined ? { chequeNo: dto.chequeNo.trim().slice(0, 60) } : {}),
        ...(dto.bankId    !== undefined ? { bankId:   dto.bankId || null } : {}),
        ...(dto.bankName  !== undefined ? { bankName: dto.bankName?.toString().slice(0, 150) || null } : {}),
        ...(dto.partyName !== undefined ? { partyName: dto.partyName?.toString().slice(0, 200) || null } : {}),
        ...(dto.customerId !== undefined ? { customerId: dto.customerId || null } : {}),
        ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId || null } : {}),
        ...(dto.amount    !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(dto.dueDate   !== undefined ? { dueDate: new Date(dto.dueDate), alertedDays: null } : {}),
        ...(dto.branchId  !== undefined ? { branchId: dto.branchId || null } : {}),
        ...(dto.notes     !== undefined ? { notes:    dto.notes ?? null } : {}),
        ...(dto.fileUrl   !== undefined ? { fileUrl:  dto.fileUrl ?? null } : {}),
      },
    });
    await this.log(id, userId, existing.status, existing.status, 'updated');
    return { ...updated, liveStatus: computeChequeStatus(updated), daysLeft: dayDiff(updated.dueDate) };
  }

  /**
   * Collect an incoming cheque → status=collected + create a Receipt for the
   * customer (which decrements their balance). Atomic.
   */
  async collect(tenantId: string, userId: string, id: string, body: { branchId?: string; note?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.cheque.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!c) throw new NotFoundException('الشيك غير موجود');
      if (c.direction !== 'incoming')
        throw new BadRequestException('لا يمكن تحصيل إلا شيك "لنا" (وارد)');
      if (['collected', 'paid', 'cancelled', 'bounced'].includes(c.status))
        throw new BadRequestException(`حالة الشيك "${c.status}" لا تسمح بالتحصيل`);

      const receipt = await tx.receipt.create({
        data: {
          tenantId,
          branchId:  body.branchId ?? c.branchId ?? null,
          customerId: c.customerId,
          amount:    c.amount,
          method:    'cheque',
          chequeNo:  c.chequeNo,
          chequeDate: c.dueDate,
          createdBy: userId,
        },
      });
      if (c.customerId) {
        // decrement customer balance (positive balance = owed to us)
        await tx.customer.update({
          where: { id: c.customerId },
          data:  { balance: { decrement: c.amount } },
        });
      }
      const updated = await tx.cheque.update({
        where: { id },
        data: { status: 'collected', receiptId: receipt.id, settledAt: new Date() },
      });
      await tx.chequeStatusLog.create({
        data: { chequeId: id, userId, fromStatus: c.status, toStatus: 'collected', note: body.note ?? 'تمّ التحصيل' },
      });
      return { ...updated, liveStatus: 'collected', daysLeft: dayDiff(updated.dueDate) };
    });
  }

  /**
   * Pay an outgoing cheque → status=paid + create a Payment for the supplier.
   * Atomic.
   */
  async pay(tenantId: string, userId: string, id: string, body: { branchId?: string; note?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.cheque.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!c) throw new NotFoundException('الشيك غير موجود');
      if (c.direction !== 'outgoing')
        throw new BadRequestException('لا يمكن دفع إلا شيك "علينا" (صادر)');
      if (['collected', 'paid', 'cancelled', 'bounced'].includes(c.status))
        throw new BadRequestException(`حالة الشيك "${c.status}" لا تسمح بالدفع`);

      const payment = await tx.payment.create({
        data: {
          tenantId,
          branchId:  body.branchId ?? c.branchId ?? null,
          supplierId: c.supplierId,
          amount:    c.amount,
          method:    'cheque',
          createdBy: userId,
        },
      });
      if (c.supplierId) {
        await tx.supplier.update({
          where: { id: c.supplierId },
          data:  { balance: { decrement: c.amount } },
        });
      }
      const updated = await tx.cheque.update({
        where: { id },
        data: { status: 'paid', paymentId: payment.id, settledAt: new Date() },
      });
      await tx.chequeStatusLog.create({
        data: { chequeId: id, userId, fromStatus: c.status, toStatus: 'paid', note: body.note ?? 'تمّ الدفع' },
      });
      return { ...updated, liveStatus: 'paid', daysLeft: dayDiff(updated.dueDate) };
    });
  }

  async bounce(tenantId: string, userId: string, id: string, body: { reason: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('سبب الرجوع مطلوب');
    const c = await this.prisma.cheque.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!c) throw new NotFoundException('الشيك غير موجود');
    if (['collected', 'paid', 'cancelled', 'bounced'].includes(c.status))
      throw new BadRequestException('لا يمكن وضع شيك بحالة "مرتجع" حالياً');
    const updated = await this.prisma.cheque.update({
      where: { id },
      data: { status: 'bounced', bounceReason: body.reason.slice(0, 300), bouncedAt: new Date() },
    });
    await this.log(id, userId, c.status, 'bounced', body.reason);
    return { ...updated, liveStatus: 'bounced', daysLeft: dayDiff(updated.dueDate) };
  }

  async cancel(tenantId: string, userId: string, id: string, body: { reason?: string }) {
    const c = await this.prisma.cheque.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!c) throw new NotFoundException('الشيك غير موجود');
    if (['collected', 'paid'].includes(c.status))
      throw new BadRequestException('لا يمكن إلغاء شيك تمّت تسويته');
    const updated = await this.prisma.cheque.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.log(id, userId, c.status, 'cancelled', body.reason ?? 'تمّ الإلغاء');
    return { ...updated, liveStatus: 'cancelled', daysLeft: dayDiff(updated.dueDate) };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const c = await this.prisma.cheque.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!c) throw new NotFoundException('الشيك غير موجود');
    if (['collected', 'paid'].includes(c.status))
      throw new BadRequestException('لا يمكن حذف شيك تمّت تسويته — استخدم الإلغاء');
    const deleted = await this.prisma.cheque.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    await this.log(id, userId, c.status, c.status, 'deleted');
    return deleted;
  }

  private async log(chequeId: string, userId: string | null, from: ChequeStatus | null, to: ChequeStatus, note?: string) {
    try {
      await this.prisma.chequeStatusLog.create({
        data: { chequeId, userId, fromStatus: from, toStatus: to, note: note ?? null },
      });
    } catch {
      /* best-effort */
    }
  }
}
