import { Module, Controller, Get, Param, Res, Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';

const escape = (s: string | null | undefined) =>
  (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmt = (n: number | string | null | undefined, cur = 'د.أ') => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 2 }).format(v) + ' ' + cur;
};

@Injectable()
class InvoicePrintService {
  constructor(private readonly prisma: PrismaService) {}

  async renderHtml(tenantId: string, invoiceId: string): Promise<string> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items:    { include: { part: { select: { sku: true, name: true } } } },
        customer: true,
        branch:   true,
        seller:   { select: { fullName: true } },
        tenant:   { include: { settings: true } },
      },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    const s = invoice.tenant?.settings;
    const company = s?.legalName ?? invoice.tenant?.name ?? 'الشركة';
    const phone   = s?.phone ?? '';
    const address = s?.address ?? '';
    const tax     = s?.taxNumber ?? '';
    const currency = s?.currency ?? 'JOD';
    const cur = currency === 'JOD' ? 'د.أ' : currency;
    const primary = s?.colorPrimary ?? '#1E5F74';
    const accent  = s?.colorSecondary ?? '#FF7A00';

    const rows = invoice.items.map((it) => `
      <tr>
        <td>${escape(it.part?.name)}</td>
        <td>${escape(it.part?.sku)}</td>
        <td class="num">${Number(it.qty)}</td>
        <td class="num">${fmt(it.unitPrice, cur)}</td>
        <td class="num">${fmt(it.lineTotal, cur)}</td>
      </tr>`).join('\n');

    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>فاتورة ${escape(invoice.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Cairo', 'Tajawal', Arial, sans-serif; color: #1f2937; font-size: 13px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: start; padding-bottom: 16px; border-bottom: 3px solid ${primary}; }
  .head h1 { color: ${primary}; margin: 0; font-size: 22px; }
  .head .meta { color: #6b7280; font-size: 12px; line-height: 1.6; }
  .head .qr { width: 86px; height: 86px; background: #f1f5f9; display: grid; place-items: center; border: 1px dashed #cbd5e1; color: #6b7280; font-size: 10px; }
  .title { background: ${primary}; color: white; padding: 10px 14px; margin: 16px 0 0; border-radius: 8px; display: flex; justify-content: space-between; }
  .title b { font-size: 18px; }
  .ctx { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
  .ctx .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .ctx .card h4 { margin: 0 0 6px; color: ${primary}; font-size: 12px; }
  .ctx .card .v { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: ${primary}; color: white; text-align: right; padding: 9px 8px; font-size: 12px; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  td.num { text-align: left; direction: ltr; font-feature-settings: 'tnum'; white-space: nowrap; }
  .totals { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totals table { width: 320px; }
  .totals td { padding: 6px 8px; border: none; }
  .totals .grand { background: ${primary}; color: white; font-weight: bold; font-size: 15px; }
  .totals .grand td { border: none; }
  .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 11px; display: flex; justify-content: space-between; }
  .badge { background: ${accent}; color: white; padding: 3px 10px; border-radius: 14px; font-size: 11px; font-weight: bold; }
  @media print { .no-print { display: none !important; } }
  .toolbar { background: #f1f5f9; padding: 10px; text-align: center; }
  .toolbar button { background: ${primary}; color: white; border: none; padding: 8px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">🖨️  طباعة / حفظ PDF</button>
  </div>
  <div class="head">
    <div>
      <h1>${escape(company)}</h1>
      <div class="meta">
        ${address ? escape(address) + '<br>' : ''}
        ${phone   ? 'هاتف: '   + escape(phone) + '<br>' : ''}
        ${tax     ? 'الرقم الضريبي: ' + escape(tax) : ''}
      </div>
    </div>
    <div class="qr">${invoice.jofotaraUuid ? 'QR' : '—'}</div>
  </div>

  <div class="title">
    <b>فاتورة ضريبية / مبيعات</b>
    <span>رقم: ${escape(invoice.invoiceNo)}  •  ${invoice.invoiceDate.toLocaleDateString('ar-JO')}</span>
  </div>

  <div class="ctx">
    <div class="card">
      <h4>العميل</h4>
      <div class="v">${escape(invoice.customer?.name) || 'زبون نقدي'}</div>
      ${invoice.customer?.phone ? '<div>'+ escape(invoice.customer.phone) +'</div>' : ''}
      ${invoice.customer?.taxNumber ? '<div>الرقم الضريبي: '+ escape(invoice.customer.taxNumber) +'</div>' : ''}
    </div>
    <div class="card">
      <h4>التفاصيل</h4>
      <div>الفرع: <b>${escape(invoice.branch?.name)}</b></div>
      <div>البائع: <b>${escape(invoice.seller?.fullName ?? '—')}</b></div>
      <div>الدفع: <span class="badge">${invoice.paymentType === 'credit' ? 'آجل' : 'نقدي'}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th>SKU</th>
        <th>الكمية</th>
        <th>السعر</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>المجموع قبل الضريبة</td><td class="num">${fmt(invoice.subtotal, cur)}</td></tr>
      ${Number(invoice.discount) > 0 ? '<tr><td>الخصم</td><td class="num">' + fmt(invoice.discount, cur) + '</td></tr>' : ''}
      <tr><td>الضريبة (${Number(s?.taxRate ?? 16)}%)</td><td class="num">${fmt(invoice.tax, cur)}</td></tr>
      <tr class="grand"><td>الإجمالي</td><td class="num">${fmt(invoice.total, cur)}</td></tr>
    </table>
  </div>

  <div class="foot">
    <div>شكراً لتعاملكم معنا · ${escape(company)}</div>
    <div>تمت الطباعة من نظام قِطَعتي</div>
  </div>
</body>
</html>`;
  }
}

@Controller('invoices')
class InvoicePrintController {
  constructor(private readonly svc: InvoicePrintService) {}

  /** Returns printable HTML — the browser handles "Save as PDF". */
  @Get(':id/print')
  @Permissions('sales.view')
  async print(@Tenant() tid: string, @Param('id') id: string, @Res() res: Response) {
    const html = await this.svc.renderHtml(tid, id);
    res.type('html').send(html);
  }
}

@Module({ controllers: [InvoicePrintController], providers: [InvoicePrintService] })
export class InvoicesModule {}
