import { Module } from '@nestjs/common';
import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant } from '../../common/decorators/tenant.decorator';

/**
 * Global cross-entity search.
 * One endpoint, parallel scans, returns top-N hits per category.
 * The frontend renders a dropdown grouped by entity type with click-to-navigate.
 */

interface SearchResult {
  type: 'customer' | 'supplier' | 'part' | 'invoice' | 'cheque' | 'paper' | 'expense';
  id: string;
  title: string;          // primary display string
  subtitle?: string;      // optional secondary line
  meta?: string;          // optional badge (amount / date / status)
  url: string;            // where to navigate when clicked
}

class SearchDto {
  @IsString() @MaxLength(120) q!: string;
  @IsOptional() @IsString() type?: string;  // filter by single type
}

@Injectable()
class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, rawQ: string, typeFilter?: string) {
    // Strip control chars (incl. null byte that historically crashed Prisma)
    // and cap length so a 100KB query string can't pin a connection.
    const q = rawQ
      .toString()
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();

    if (q.length < 1) {
      return { query: q, total: 0, results: [] as SearchResult[] };
    }

    // Allow filtering to a single type so the per-entity pages can reuse this
    // endpoint without paying for 7 parallel scans.
    const want = (t: string) => !typeFilter || typeFilter === t;
    const TAKE = 6;   // per-category cap — keeps the dropdown manageable
    const ci   = { contains: q, mode: 'insensitive' as const };

    const [
      customers, suppliers, parts, invoices, cheques, papers, expenses,
    ] = await Promise.all([
      want('customer') ? this.prisma.customer.findMany({
        where: { tenantId, deletedAt: null,
          OR: [{ name: ci }, { phone: { contains: q } }, { email: ci }, { taxNumber: ci }] },
        select: { id: true, name: true, phone: true, balance: true, priceTier: true },
        take: TAKE,
      }) : Promise.resolve([]),

      want('supplier') ? this.prisma.supplier.findMany({
        where: { tenantId, deletedAt: null,
          OR: [{ name: ci }, { phone: { contains: q } }, { email: ci }, { taxNumber: ci }] },
        select: { id: true, name: true, phone: true, balance: true },
        take: TAKE,
      }) : Promise.resolve([]),

      want('part') ? this.prisma.part.findMany({
        where: { tenantId, deletedAt: null, isActive: true,
          OR: [
            { name: ci }, { nameEn: ci }, { sku: ci },
            { partNumber: ci }, { oemNumber: ci }, { barcode: ci },
            { manufacturer: ci },
          ] },
        select: {
          id: true, sku: true, name: true, partNumber: true,
          retailPrice: true, manufacturer: true,
        },
        take: TAKE,
      }) : Promise.resolve([]),

      want('invoice') ? this.prisma.salesInvoice.findMany({
        where: { tenantId, deletedAt: null,
          OR: [{ invoiceNo: ci }, { customer: { name: ci } }] },
        select: {
          id: true, invoiceNo: true, total: true, invoiceDate: true, paymentType: true,
          customer: { select: { name: true } },
        },
        orderBy: { invoiceDate: 'desc' },
        take: TAKE,
      }) : Promise.resolve([]),

      want('cheque') ? this.prisma.cheque.findMany({
        where: { tenantId, deletedAt: null,
          OR: [
            { chequeNo: ci }, { bankName: ci }, { partyName: ci },
            { customer: { name: ci } }, { supplier: { name: ci } },
          ] },
        select: {
          id: true, chequeNo: true, amount: true, dueDate: true, direction: true, status: true,
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
          partyName: true, bankName: true,
        },
        take: TAKE,
      }) : Promise.resolve([]),

      want('paper') ? this.prisma.officialPaper.findMany({
        where: { tenantId, deletedAt: null,
          OR: [{ title: ci }, { docNumber: ci }, { issuer: ci }] },
        select: {
          id: true, title: true, type: true, docNumber: true, expiresAt: true,
        },
        take: TAKE,
      }) : Promise.resolve([]),

      want('expense') ? this.prisma.expense.findMany({
        where: { tenantId,
          OR: [{ description: ci }, { category: { name: ci } }] },
        select: {
          id: true, description: true, amount: true, expenseDate: true,
          category: { select: { name: true } },
        },
        orderBy: { expenseDate: 'desc' },
        take: TAKE,
      }) : Promise.resolve([]),
    ]);

    const results: SearchResult[] = [
      ...customers.map((c): SearchResult => ({
        type: 'customer',
        id: c.id,
        title: c.name,
        subtitle: c.phone ?? undefined,
        meta: Number(c.balance) > 0 ? `مستحق ${Number(c.balance).toFixed(2)} د.أ` : undefined,
        url: `/customers#${c.id}`,
      })),
      ...suppliers.map((s): SearchResult => ({
        type: 'supplier',
        id: s.id,
        title: s.name,
        subtitle: s.phone ?? undefined,
        meta: Number(s.balance) > 0 ? `علينا ${Number(s.balance).toFixed(2)} د.أ` : undefined,
        url: `/suppliers#${s.id}`,
      })),
      ...parts.map((p): SearchResult => ({
        type: 'part',
        id: p.id,
        title: p.name,
        subtitle: [p.sku, p.partNumber, p.manufacturer].filter(Boolean).join(' • '),
        meta: `${Number(p.retailPrice).toFixed(2)} د.أ`,
        url: `/parts#${p.id}`,
      })),
      ...invoices.map((i): SearchResult => ({
        type: 'invoice',
        id: i.id,
        title: i.invoiceNo ?? `فاتورة #${i.id.slice(0, 8)}`,
        subtitle: i.customer?.name ?? 'بيع نقدي',
        meta: `${Number(i.total).toFixed(2)} د.أ • ${new Date(i.invoiceDate).toLocaleDateString('ar-JO')}`,
        url: `/invoices#${i.id}`,
      })),
      ...cheques.map((c): SearchResult => ({
        type: 'cheque',
        id: c.id,
        title: `شيك ${c.chequeNo}`,
        subtitle: [
          c.customer?.name ?? c.supplier?.name ?? c.partyName,
          c.bankName,
        ].filter(Boolean).join(' • '),
        meta: `${Number(c.amount).toFixed(2)} د.أ • ${c.direction === 'incoming' ? 'لنا' : 'علينا'}`,
        url: `/cheques#${c.id}`,
      })),
      ...papers.map((p): SearchResult => ({
        type: 'paper',
        id: p.id,
        title: p.title,
        subtitle: p.docNumber ?? undefined,
        meta: p.expiresAt ? `ينتهي ${new Date(p.expiresAt).toLocaleDateString('ar-JO')}` : undefined,
        url: `/papers#${p.id}`,
      })),
      ...expenses.map((e): SearchResult => ({
        type: 'expense',
        id: e.id,
        title: e.description ?? e.category?.name ?? 'مصروف',
        subtitle: e.category?.name ?? undefined,
        meta: `${Number(e.amount).toFixed(2)} د.أ • ${new Date(e.expenseDate).toLocaleDateString('ar-JO')}`,
        url: `/expenses#${e.id}`,
      })),
    ];

    return { query: q, total: results.length, results };
  }
}

@Controller('search')
class SearchController {
  constructor(private readonly svc: SearchService) {}

  /**
   * Rate-limited so a runaway client (or a bot probing) can't hammer 7 tables
   * with every keystroke. 60/min is comfortable for normal interactive typing.
   */
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Tenant() tenantId: string, @Query() q: SearchDto) {
    return this.svc.search(tenantId, q.q ?? '', q.type);
  }
}

@Module({
  controllers: [SearchController],
  providers:   [SearchService],
})
export class SearchModule {}
