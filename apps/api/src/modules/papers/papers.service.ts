import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficialPaperStatus, OfficialPaperType, Prisma } from '@prisma/client';

export interface PaperSearchQuery {
  q?: string;
  type?: OfficialPaperType;
  status?: OfficialPaperStatus | 'all';
  branchId?: string;
  expiringWithinDays?: number;   // shortcut: only papers expiring within N days
  page?: number;
  perPage?: number;
}

export interface CreatePaperInput {
  type:          OfficialPaperType;
  title:         string;
  docNumber?:    string | null;
  issuer?:       string | null;
  issuedAt?:     string | Date | null;
  expiresAt?:    string | Date | null;
  branchId?:     string | null;
  statusOverride?: OfficialPaperStatus | null;
  notes?:        string | null;
  fileUrl?:      string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Compute live status from expiry date + manual override. */
export function computePaperStatus(p: {
  expiresAt?: Date | null;
  statusOverride?: OfficialPaperStatus | null;
}): OfficialPaperStatus {
  // Manual overrides win — these can't be derived from the expiry date.
  if (p.statusOverride === 'renewal_needed' || p.statusOverride === 'in_progress') {
    return p.statusOverride;
  }
  if (!p.expiresAt) return 'active';
  const now = Date.now();
  const exp = new Date(p.expiresAt).getTime();
  if (exp < now) return 'expired';
  const daysLeft = (exp - now) / DAY_MS;
  if (daysLeft <= 30) return 'expiring_soon';
  return 'active';
}

@Injectable()
export class PapersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q: PaperSearchQuery) {
    const page    = Math.max(1, q.page ?? 1);
    const perPage = Math.min(200, Math.max(5, q.perPage ?? 50));

    const text = (q.q ?? '')
      .toString()
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 120)
      .trim();

    const where: Prisma.OfficialPaperWhereInput = {
      tenantId,
      deletedAt: null,
      ...(q.type ? { type: q.type } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.expiringWithinDays !== undefined && q.expiringWithinDays > 0
        ? {
            expiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + q.expiringWithinDays * DAY_MS),
            },
          }
        : {}),
      ...(text
        ? {
            OR: [
              { title:     { contains: text, mode: 'insensitive' } },
              { docNumber: { contains: text, mode: 'insensitive' } },
              { issuer:    { contains: text, mode: 'insensitive' } },
              { notes:     { contains: text, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.officialPaper.findMany({
        where,
        include: {
          branch:  { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true } },
        },
        orderBy: [
          { expiresAt: 'asc' },     // soonest-expiring first (nulls last in PG by default)
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.officialPaper.count({ where }),
    ]);

    // augment with live computed status (so the UI doesn't have to)
    const augmented = items.map((p) => {
      const liveStatus = computePaperStatus(p);
      const daysLeft = p.expiresAt
        ? Math.ceil((new Date(p.expiresAt).getTime() - Date.now()) / DAY_MS)
        : null;
      return { ...p, liveStatus, daysLeft };
    });

    // optional in-memory filter on computed status (since it's not a DB column)
    const filtered =
      q.status && q.status !== 'all'
        ? augmented.filter((p) => p.liveStatus === q.status)
        : augmented;

    return {
      items: filtered, total, page, perPage, pages: Math.ceil(total / perPage),
    };
  }

  async findOne(tenantId: string, id: string) {
    const p = await this.prisma.officialPaper.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch:  { select: { id: true, name: true } },
        creator: { select: { id: true, fullName: true } },
        logs:    {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!p) throw new NotFoundException('الورقة غير موجودة');
    return { ...p, liveStatus: computePaperStatus(p) };
  }

  /** Quick summary for the dashboard widget. */
  async summary(tenantId: string) {
    const all = await this.prisma.officialPaper.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, expiresAt: true, statusOverride: true, type: true },
    });
    const buckets = { active: 0, expiring_soon: 0, expired: 0, renewal_needed: 0, in_progress: 0 };
    for (const p of all) buckets[computePaperStatus(p)]++;
    return { total: all.length, byStatus: buckets };
  }

  async create(tenantId: string, userId: string, dto: CreatePaperInput) {
    if (!dto?.title?.trim()) throw new BadRequestException('العنوان مطلوب');
    if (!dto?.type) throw new BadRequestException('نوع الورقة مطلوب');
    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!b) throw new NotFoundException('الفرع غير موجود');
    }
    if (dto.issuedAt && dto.expiresAt && new Date(dto.expiresAt) < new Date(dto.issuedAt)) {
      throw new BadRequestException('تاريخ الانتهاء قبل تاريخ الإصدار');
    }
    const created = await this.prisma.officialPaper.create({
      data: {
        tenantId, createdBy: userId,
        type:     dto.type,
        title:    dto.title.trim().slice(0, 200),
        docNumber: dto.docNumber?.toString().slice(0, 100) || null,
        issuer:    dto.issuer?.toString().slice(0, 200) || null,
        issuedAt:  dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        branchId:  dto.branchId || null,
        statusOverride: dto.statusOverride ?? null,
        notes:     dto.notes ?? null,
        fileUrl:   dto.fileUrl ?? null,
      },
    });
    await this.log(created.id, userId, 'created', { type: dto.type, title: created.title });
    return { ...created, liveStatus: computePaperStatus(created) };
  }

  async update(tenantId: string, userId: string, id: string, dto: Partial<CreatePaperInput>) {
    const existing = await this.prisma.officialPaper.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('الورقة غير موجودة');

    if (dto.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!b) throw new NotFoundException('الفرع غير موجود');
    }
    const issued  = dto.issuedAt  ? new Date(dto.issuedAt)  : existing.issuedAt;
    const expires = dto.expiresAt ? new Date(dto.expiresAt) : existing.expiresAt;
    if (issued && expires && expires < issued) {
      throw new BadRequestException('تاريخ الانتهاء قبل تاريخ الإصدار');
    }

    const updated = await this.prisma.officialPaper.update({
      where: { id },
      data: {
        ...(dto.type       !== undefined ? { type:     dto.type } : {}),
        ...(dto.title      !== undefined ? { title:    dto.title.trim().slice(0, 200) } : {}),
        ...(dto.docNumber  !== undefined ? { docNumber: dto.docNumber?.toString().slice(0, 100) || null } : {}),
        ...(dto.issuer     !== undefined ? { issuer:    dto.issuer?.toString().slice(0, 200) || null } : {}),
        ...(dto.issuedAt   !== undefined ? { issuedAt:  dto.issuedAt  ? new Date(dto.issuedAt)  : null } : {}),
        ...(dto.expiresAt  !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
        ...(dto.branchId   !== undefined ? { branchId:  dto.branchId  || null } : {}),
        ...(dto.statusOverride !== undefined ? { statusOverride: dto.statusOverride } : {}),
        ...(dto.notes      !== undefined ? { notes:    dto.notes ?? null } : {}),
        ...(dto.fileUrl    !== undefined ? { fileUrl:  dto.fileUrl ?? null } : {}),
        // any explicit change resets the alert tracking so new thresholds re-fire
        ...(dto.expiresAt  !== undefined ? { alertedDays: null } : {}),
      },
    });
    await this.log(id, userId, 'updated', { fields: Object.keys(dto) });
    return { ...updated, liveStatus: computePaperStatus(updated) };
  }

  /** Convenience: bump issue/expiry dates after a renewal completes. */
  async renew(tenantId: string, userId: string, id: string, body: { issuedAt: string; expiresAt: string; notes?: string }) {
    const existing = await this.prisma.officialPaper.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('الورقة غير موجودة');
    const issued  = new Date(body.issuedAt);
    const expires = new Date(body.expiresAt);
    if (expires <= issued) throw new BadRequestException('تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار');
    const updated = await this.prisma.officialPaper.update({
      where: { id },
      data: { issuedAt: issued, expiresAt: expires, statusOverride: null, alertedDays: null,
              notes: body.notes ?? existing.notes },
    });
    await this.log(id, userId, 'renewed', { issuedAt: issued, expiresAt: expires });
    return { ...updated, liveStatus: computePaperStatus(updated) };
  }

  async setStatus(tenantId: string, userId: string, id: string, status: OfficialPaperStatus) {
    const existing = await this.prisma.officialPaper.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('الورقة غير موجودة');
    // only manual statuses make sense as overrides — others are computed
    if (!['renewal_needed', 'in_progress'].includes(status)) {
      throw new BadRequestException('يمكن فقط تعيين "تحتاج تجديد" أو "قيد المعاملة" يدوياً');
    }
    const updated = await this.prisma.officialPaper.update({
      where: { id },
      data: { statusOverride: status },
    });
    await this.log(id, userId, 'status_changed', { to: status });
    return { ...updated, liveStatus: computePaperStatus(updated) };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.officialPaper.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('الورقة غير موجودة');
    const deleted = await this.prisma.officialPaper.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    await this.log(id, userId, 'deleted');
    return deleted;
  }

  private async log(paperId: string, userId: string | null, action: string, details?: any) {
    try {
      await this.prisma.officialPaperLog.create({
        data: { paperId, userId, action, details: details ?? Prisma.JsonNull },
      });
    } catch {
      /* best-effort — never block the main mutation on the audit log */
    }
  }
}
