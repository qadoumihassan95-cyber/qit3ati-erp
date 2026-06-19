import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JofotaraEnvironment, JofotaraDocumentType, JofotaraStatus, Prisma } from '@prisma/client';
import { encryptSecret, decryptSecret, maskTail } from './jofotara.crypto';
import { buildInvoiceXml, DocumentType, PaymentMethod } from './jofotara.xml';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

/**
 * Official JoFotara endpoints (as documented by ISTD onboarding kit).
 * If the URL changes, just edit the constants below — no logic depends on
 * specific routes.
 */
const ENDPOINTS = {
  sandbox:    'https://backend.sit.jofotara.gov.jo/core/invoices/',
  production: 'https://backend.jofotara.gov.jo/core/invoices/',
};

export interface UpdateConfigInput {
  clientId?:         string | null;
  /** Plain new secret — server encrypts before storing. Null = leave as-is. */
  secret?:           string | null;
  activityNumber?:   string | null;
  taxpayerNumber?:   string | null;
  companyName?:      string | null;
  environment?:      JofotaraEnvironment;
  baseUrlOverride?:  string | null;
  autoSendOnSale?:   boolean;
  timeoutMs?:        number;
}

@Injectable()
export class JofotaraService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------- Config CRUD --------------------

  /** Public config — never includes the plain secret. */
  async getConfig(tenantId: string) {
    const cfg = await this.prisma.jofotaraConfig.findUnique({ where: { tenantId } });
    if (!cfg) {
      return {
        tenantId, exists: false, environment: 'sandbox' as JofotaraEnvironment,
        autoSendOnSale: false, timeoutMs: 15_000,
        clientId: '', companyName: '', activityNumber: '', taxpayerNumber: '',
        secretMaskTail: null, connectionVerifiedAt: null, baseUrlOverride: null,
      };
    }
    return {
      tenantId:               cfg.tenantId,
      exists:                 true,
      clientId:               cfg.clientId ?? '',
      companyName:            cfg.companyName ?? '',
      activityNumber:         cfg.activityNumber ?? '',
      taxpayerNumber:         cfg.taxpayerNumber ?? '',
      environment:            cfg.environment,
      baseUrlOverride:        cfg.baseUrlOverride,
      autoSendOnSale:         cfg.autoSendOnSale,
      timeoutMs:              cfg.timeoutMs,
      // 👇 secret is never returned — only a masked tail for UX
      secretMaskTail:         cfg.secretMaskTail,
      connectionVerifiedAt:   cfg.connectionVerifiedAt,
      updatedAt:              cfg.updatedAt,
    };
  }

  async saveConfig(tenantId: string, input: UpdateConfigInput) {
    // Build the patch — only update fields that were sent
    const data: Prisma.JofotaraConfigUncheckedUpdateInput = {};
    if (input.clientId        !== undefined) data.clientId        = (input.clientId       || '').trim() || null;
    if (input.activityNumber  !== undefined) data.activityNumber  = (input.activityNumber || '').trim() || null;
    if (input.taxpayerNumber  !== undefined) data.taxpayerNumber  = (input.taxpayerNumber || '').trim() || null;
    if (input.companyName     !== undefined) data.companyName     = (input.companyName    || '').trim() || null;
    if (input.environment     !== undefined) data.environment     = input.environment;
    if (input.baseUrlOverride !== undefined) data.baseUrlOverride = (input.baseUrlOverride || '').trim() || null;
    if (input.autoSendOnSale  !== undefined) data.autoSendOnSale  = !!input.autoSendOnSale;
    if (input.timeoutMs       !== undefined) {
      const t = Number(input.timeoutMs);
      if (!(t >= 1_000 && t <= 60_000)) throw new BadRequestException('مهلة الاتصال يجب أن تكون بين 1000 و 60000 ميلي ثانية');
      data.timeoutMs = t;
    }
    if (input.secret !== undefined && input.secret !== null && input.secret !== '') {
      // explicit non-empty secret → encrypt + store
      const plain = String(input.secret);
      data.secretEncrypted = encryptSecret(plain);
      data.secretMaskTail  = maskTail(plain);
    }

    const cfg = await this.prisma.jofotaraConfig.upsert({
      where:  { tenantId },
      create: { tenantId, ...(data as any) },
      update: data,
    });
    return this.getConfig(cfg.tenantId);
  }

  // -------------------- Test connection --------------------

  /**
   * Ping JoFotara with current creds. We don't actually submit an invoice —
   * we send a minimal HEAD-like check (the API rejects with 401 if creds
   * are bad, 400 if creds are good but payload invalid). Either way, we
   * know the network + credential pair works.
   */
  async testConnection(tenantId: string) {
    const cfg = await this.prisma.jofotaraConfig.findUnique({ where: { tenantId } });
    if (!cfg) throw new BadRequestException('لا توجد إعدادات JoFotara — احفظ الإعدادات أوّلاً');
    if (!cfg.clientId || !cfg.secretEncrypted) {
      throw new BadRequestException('Client-Id أو Secret-Key مفقود');
    }
    const secret = decryptSecret(cfg.secretEncrypted);
    const baseUrl = this.endpointFor(cfg);

    const start = Date.now();
    try {
      // POST empty body — server should reject with 400 (Bad Request) which
      // proves auth went through. 401 would mean creds are wrong.
      const res = await this.httpPost(baseUrl, '<test/>', {
        clientId:      cfg.clientId,
        secret,
        activityNumber: cfg.activityNumber ?? '',
        timeoutMs:     cfg.timeoutMs,
      });
      const ok = res.status !== 401 && res.status !== 403;
      if (ok) {
        await this.prisma.jofotaraConfig.update({
          where: { tenantId },
          data:  { connectionVerifiedAt: new Date() },
        });
      }
      return {
        ok,
        httpStatus:    res.status,
        durationMs:    Date.now() - start,
        message: ok
          ? '✅ نجح الاتصال — المفاتيح صالحة'
          : `❌ فشل التحقّق — رمز ${res.status} (تأكّد من Client-Id/Secret-Key)`,
      };
    } catch (e: any) {
      return {
        ok: false,
        httpStatus: 0,
        durationMs: Date.now() - start,
        message: `❌ فشل الاتصال: ${e?.message ?? 'unknown'}`,
      };
    }
  }

  // -------------------- Submit invoice --------------------

  async submitInvoice(
    tenantId: string,
    userId: string | null,
    invoiceId: string,
    opts: { forceResubmit?: boolean; documentType?: JofotaraDocumentType } = {},
  ) {
    const docType: JofotaraDocumentType = opts.documentType ?? 'invoice';

    const inv = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: { items: { include: { part: true } }, customer: true },
    });
    if (!inv) throw new NotFoundException('الفاتورة غير موجودة');

    if (!opts.forceResubmit && (inv.jofotaraStatus === 'accepted')) {
      throw new BadRequestException('الفاتورة مقبولة بالفعل — استعمل إعادة إرسال إن كنت متأكّداً');
    }

    const cfg = await this.prisma.jofotaraConfig.findUnique({ where: { tenantId } });
    if (!cfg || !cfg.clientId || !cfg.secretEncrypted) {
      // Mark as needs_resubmit so the operator sees it later
      await this.prisma.salesInvoice.update({
        where: { id: invoiceId },
        data:  { jofotaraStatus: 'needs_resubmit', jofotaraError: 'إعدادات JoFotara غير مكتملة' },
      });
      throw new BadRequestException('أكمل إعدادات JoFotara أوّلاً');
    }
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });

    // ---- Build XML ----
    const xml = buildInvoiceXml({
      documentType:    docType as DocumentType,
      invoiceNumber:   inv.invoiceNo ?? `INV-${inv.id.slice(0, 8)}`,
      issueDate:       inv.invoiceDate.toISOString().slice(0, 10),
      currency:        settings?.currency ?? 'JOD',
      paymentMethod:   inv.paymentType as PaymentMethod,
      sellerName:      cfg.companyName ?? settings?.legalName ?? '—',
      sellerTaxNumber: cfg.taxpayerNumber ?? settings?.taxNumber ?? '',
      sellerActivityNumber: cfg.activityNumber ?? undefined,
      buyerName:       inv.customer?.name ?? undefined,
      buyerTaxNumber:  inv.customer?.taxNumber ?? undefined,
      buyerPhone:      inv.customer?.phone ?? undefined,
      items: inv.items.map((it) => ({
        description: it.part?.name ?? 'بند',
        quantity:    Number(it.qty ?? 0),
        unitPrice:   Number(it.unitPrice ?? 0),
        discount:    Number(it.discount ?? 0),
        taxRate:     Number(settings?.taxRate ?? 16),
      })),
      subtotal:    Number(inv.subtotal),
      discount:    Number(inv.discount),
      taxAmount:   Number(inv.tax),
      total:       Number(inv.total),
    });

    // mark as "sent" before the network call — if we crash mid-call we
    // can still see it in the UI as in-flight
    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data:  { jofotaraStatus: 'sent', jofotaraXml: xml, jofotaraSubmittedAt: new Date() },
    });

    const secret = decryptSecret(cfg.secretEncrypted);
    const baseUrl = this.endpointFor(cfg);

    const start = Date.now();
    let httpStatus = 0;
    let responseText = '';
    let status: JofotaraStatus = 'failed';
    let errorMessage: string | null = null;
    let jofotaraUuid: string | null = null;
    let jofotaraQr: string | null = null;

    try {
      const res = await this.httpPost(baseUrl, xml, {
        clientId:       cfg.clientId,
        secret,
        activityNumber: cfg.activityNumber ?? '',
        timeoutMs:      cfg.timeoutMs,
      });
      httpStatus = res.status;
      responseText = res.body;

      if (res.status >= 200 && res.status < 300) {
        // Parse common response shapes (sandbox & production differ slightly).
        // Examples observed:
        //   { "EINV_NUM": "...", "EINV_QR": "data:image/png;base64,...", "EINV_STATUS": "Submitted" }
        //   { "uuid": "...", "qr_code": "..." }
        try {
          const j = JSON.parse(res.body);
          jofotaraUuid = j.EINV_NUM ?? j.uuid ?? j.invoiceUuid ?? null;
          jofotaraQr   = j.EINV_QR  ?? j.qr_code ?? j.qrCode ?? null;
          // accepted when API confirms; otherwise still "sent" (in review)
          status = (j.EINV_STATUS === 'Submitted' || j.status === 'accepted' || jofotaraUuid) ? 'accepted' : 'sent';
        } catch {
          // not JSON — accept based on HTTP code alone
          status = 'accepted';
        }
      } else if (res.status === 401 || res.status === 403) {
        status = 'failed';
        errorMessage = 'مفاتيح الربط غير صحيحة (401/403)';
      } else if (res.status >= 400 && res.status < 500) {
        status = 'rejected';
        errorMessage = this.extractErrorMessage(res.body) ?? `رفض الخادم: ${res.status}`;
      } else {
        status = 'failed';
        errorMessage = `خطأ خادم: ${res.status}`;
      }
    } catch (e: any) {
      status = 'failed';
      errorMessage = `فشل الاتصال: ${e?.message ?? 'unknown'}`;
      responseText = errorMessage;
    }

    const durationMs = Date.now() - start;

    // ---- Persist outcome ----
    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        jofotaraStatus: status,
        jofotaraUuid:   jofotaraUuid ?? inv.jofotaraUuid,
        jofotaraQr:     jofotaraQr   ?? inv.jofotaraQr,
        jofotaraError:  errorMessage,
      },
    });

    await this.prisma.jofotaraSubmission.create({
      data: {
        tenantId, invoiceId, userId,
        documentType: docType,
        status,
        requestXml: xml,
        responsePayload: responseText.slice(0, 50_000),
        httpStatus,
        errorMessage,
        durationMs,
      },
    });

    return {
      status,
      httpStatus,
      durationMs,
      jofotaraUuid,
      jofotaraQr,
      errorMessage,
    };
  }

  // -------------------- Get XML / submissions --------------------

  async getInvoiceXml(tenantId: string, invoiceId: string) {
    const inv = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      select: { jofotaraXml: true, invoiceNo: true, jofotaraStatus: true },
    });
    if (!inv) throw new NotFoundException('الفاتورة غير موجودة');
    if (!inv.jofotaraXml) throw new BadRequestException('لا يوجد XML — لم يتم الإرسال بعد');
    return { invoiceNo: inv.invoiceNo, status: inv.jofotaraStatus, xml: inv.jofotaraXml };
  }

  async listSubmissions(tenantId: string, opts: { invoiceId?: string; status?: JofotaraStatus; limit?: number } = {}) {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const items = await this.prisma.jofotaraSubmission.findMany({
      where: {
        tenantId,
        ...(opts.invoiceId ? { invoiceId: opts.invoiceId } : {}),
        ...(opts.status    ? { status: opts.status }       : {}),
      },
      include: {
        invoice: { select: { id: true, invoiceNo: true, total: true } },
        user:    { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    // BigInt serialisation
    return items.map((s) => ({ ...s, id: s.id.toString() }));
  }

  // -------------------- Dashboard --------------------

  async dashboard(tenantId: string) {
    const [bucketsRaw, last20Raw] = await Promise.all([
      this.prisma.salesInvoice.groupBy({
        by: ['jofotaraStatus'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.jofotaraSubmission.findMany({
        where: { tenantId },
        include: {
          invoice: { select: { id: true, invoiceNo: true, total: true } },
          user:    { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const buckets: Record<JofotaraStatus, number> = {
      not_sent: 0, queued: 0, sent: 0, accepted: 0,
      rejected: 0, failed: 0, needs_resubmit: 0,
    };
    for (const b of bucketsRaw) buckets[b.jofotaraStatus] = b._count._all;

    return {
      buckets,
      recent: last20Raw.map((s) => ({ ...s, id: s.id.toString() })),
    };
  }

  // -------------------- Internal helpers --------------------

  private endpointFor(cfg: { environment: JofotaraEnvironment; baseUrlOverride: string | null }): string {
    return cfg.baseUrlOverride?.trim() || ENDPOINTS[cfg.environment];
  }

  private extractErrorMessage(body: string): string | null {
    try {
      const j = JSON.parse(body);
      return j.error ?? j.message ?? j.errors?.[0]?.message ?? null;
    } catch {
      // try to pull <Message>...</Message> from XML-shaped errors
      const m = body.match(/<(?:cbc:)?Message[^>]*>([\s\S]*?)<\/(?:cbc:)?Message>/i);
      return m && m[1] ? m[1].trim() : null;
    }
  }

  /**
   * Lightweight Node HTTP client (no external deps).
   * The real JoFotara endpoint accepts POST with these headers:
   *   Client-Id:       <client id>
   *   Secret-Key:      <secret>
   *   Activity-Number: <ISTD activity sequence>
   *   Content-Type:    application/xml
   */
  private httpPost(
    urlStr: string,
    body: string,
    h: { clientId: string; secret: string; activityNumber: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try { parsed = new URL(urlStr); }
      catch { reject(new Error('Invalid base URL')); return; }

      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const req = lib.request({
        method:   'POST',
        hostname: parsed.hostname,
        port:     parsed.port || (isHttps ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        headers: {
          'Content-Type':    'application/xml; charset=utf-8',
          'Content-Length':  Buffer.byteLength(body, 'utf8'),
          'Client-Id':       h.clientId,
          'Secret-Key':      h.secret,
          'Activity-Number': h.activityNumber,
          'Accept':          'application/json',
          'User-Agent':      'Qit3ati-ERP/1.0',
        },
        timeout: h.timeoutMs,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body:   Buffer.concat(chunks).toString('utf8'),
        }));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(new Error(`timeout after ${h.timeoutMs}ms`)); });
      req.on('error',   reject);
      req.write(body, 'utf8');
      req.end();
    });
  }
}
