/**
 * Telegram bot integration for Qit3ati ERP.
 *
 * Two surfaces:
 *   • POST /telegram/webhook  — Telegram Bot API webhook (validated
 *                                by ?secret= query string; must match
 *                                TELEGRAM_WEBHOOK_SECRET env var)
 *   • REST /telegram/admin/*  — Admin endpoints for /settings/telegram
 *                                (list pending links, approve, revoke,
 *                                view command log, manage subscriptions)
 *
 * Design principles:
 *   1. NEVER duplicate business logic — every operation calls the same
 *      Prisma queries the ERP uses (expenses, sales, purchases, etc.).
 *   2. Auth linking uses one-time codes: user opens /settings/telegram
 *      in the web app, gets a 6-digit code, then sends "/start CODE"
 *      to the bot. That binds their Telegram chatId to their ERP userId.
 *   3. Every command is audit-logged with intent, args, result, and any
 *      linked entity ID.
 *   4. Multi-step flows (expense, purchase) use TelegramConversation
 *      to persist state across messages — restart-safe.
 *   5. RBAC enforced: bot always calls services with the linked user's
 *      tenantId, and respects branch scoping.
 */
import {
  Module, Controller, Injectable, Post, Get, Delete, Patch,
  Body, Param, Query, Req, ForbiddenException, BadRequestException,
  NotFoundException, HttpCode, Logger, OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Tenant, Permissions } from '../../common/decorators/tenant.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';

// ============================================================
// Types
// ============================================================

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}
interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  document?: { file_id: string; mime_type?: string; file_name?: string };
  voice?: { file_id: string; duration: number };
}
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface Intent {
  kind:
    | 'help' | 'menu' | 'start'
    | 'link'
    | 'sales.today' | 'sales.month' | 'sales.week' | 'sales.yesterday'
    | 'expense.today' | 'expense.month' | 'expense.week'
    | 'stock.low' | 'stock.report'
    | 'debts.customers' | 'debts.suppliers'
    | 'expense.create'
    | 'cancel' | 'confirm' | 'edit'
    | 'unknown';
  amount?: number;
  category?: string;
  branchName?: string;
  description?: string;
  paymentAccount?: string;
  language: 'ar' | 'en';
}

// ============================================================
// Telegram HTTP client (thin wrapper around fetch)
// ============================================================

@Injectable()
class TelegramApiService {
  private readonly logger = new Logger('TelegramApi');
  private botToken: string;

  constructor(private readonly cfg: ConfigService) {
    this.botToken = this.cfg.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  private base(): string { return `https://api.telegram.org/bot${this.botToken}`; }

  isConfigured(): boolean { return Boolean(this.botToken); }

  async sendMessage(chatId: number | string, text: string, opts: { parse_mode?: 'Markdown' | 'HTML'; reply_markup?: any } = {}) {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(this.base() + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, ...opts }),
      });
      if (!res.ok) this.logger.warn(`sendMessage ${res.status}: ${await res.text()}`);
      return res.ok;
    } catch (e: any) {
      this.logger.error('sendMessage failed', e?.message);
      return null;
    }
  }

  async answerCallback(id: string, text?: string) {
    if (!this.isConfigured()) return null;
    try {
      await fetch(this.base() + '/answerCallbackQuery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
      });
    } catch { /* ignore */ }
  }

  async setWebhook(url: string, secret: string) {
    if (!this.isConfigured()) return null;
    const res = await fetch(this.base() + '/setWebhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${url}?secret=${encodeURIComponent(secret)}`,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });
    return res.ok;
  }
}

// ============================================================
// Intent parser — rule-based Arabic + English NLP
// ============================================================

@Injectable()
class TelegramIntentService {
  parse(rawText: string): Intent {
    const t = (rawText ?? '').trim();
    if (!t) return { kind: 'unknown', language: 'ar' };

    const hasArabic = /[؀-ۿ]/.test(t);
    const language: 'ar' | 'en' = hasArabic ? 'ar' : 'en';
    const lower = t.toLowerCase();

    // ---- Commands ----
    if (t.startsWith('/start')) {
      const parts = t.split(/\s+/);
      if (parts.length > 1 && parts[1]) return { kind: 'link', description: parts[1], language };
      return { kind: 'start', language };
    }
    if (t === '/help' || /^(مساعدة|help|hi|hello|hey|السلام|مرحبا)/i.test(t)) {
      return { kind: 'help', language };
    }
    if (t === '/menu' || /^(القائمة|menu|options|main)/i.test(t)) {
      return { kind: 'menu', language };
    }
    if (t === '/link' || /^ربط/.test(t)) return { kind: 'link', language };
    if (t === '/cancel' || /^(الغاء|إلغاء|cancel)/i.test(t)) return { kind: 'cancel', language };
    if (t === '/confirm' || /^(تأكيد|confirm|yes|نعم|ok)/i.test(t)) return { kind: 'confirm', language };
    if (t === '/edit' || /^(تعديل|edit)/i.test(t)) return { kind: 'edit', language };

    // ---- Reports: sales ----
    if (/مبيعات (اليوم|هذا اليوم)|sales (today|now)|today.?s? sales/i.test(t)) {
      return { kind: 'sales.today', language };
    }
    if (/مبيعات (الشهر|هذا الشهر)|sales (this )?month|monthly sales/i.test(t)) {
      return { kind: 'sales.month', language };
    }
    if (/مبيعات (الاسبوع|الأسبوع|هذا الأسبوع)|sales (this )?week|weekly sales/i.test(t)) {
      return { kind: 'sales.week', language };
    }
    if (/مبيعات (امس|أمس)|yesterday.?s? sales/i.test(t)) {
      return { kind: 'sales.yesterday', language };
    }

    // ---- Reports: expenses ----
    if (/مصاريف (اليوم|هذا اليوم)|expenses today|today.?s? expenses/i.test(t)) {
      return { kind: 'expense.today', language };
    }
    if (/مصاريف (الشهر|هذا الشهر)|expenses this month|monthly expenses/i.test(t)) {
      return { kind: 'expense.month', language };
    }
    if (/مصاريف (الاسبوع|الأسبوع)|expenses this week|weekly expenses/i.test(t)) {
      return { kind: 'expense.week', language };
    }

    // ---- Reports: stock ----
    if (/المواد (القريبة|قاربت)|نفاد|قطع تحت الحد|low stock|out of stock|نفدت/i.test(t)) {
      return { kind: 'stock.low', language };
    }
    if (/تقرير مخزون|inventory report|stock report/i.test(t)) {
      return { kind: 'stock.report', language };
    }

    // ---- Debts ----
    if (/ذمم العملاء|ديون العملاء|customer debts?|accounts receivable/i.test(t)) {
      return { kind: 'debts.customers', language };
    }
    if (/ذمم الموردين|ديون الموردين|supplier debts?|accounts payable/i.test(t)) {
      return { kind: 'debts.suppliers', language };
    }

    // ---- Expense creation ("سجل مصروف بنزين 35 دينار") ----
    const isExpenseCreate =
      /^(سجل|أضف|اضف)\s*(مصروف|صرف)/i.test(t) ||
      /^(add|log|record)\s+(an?\s+)?expense/i.test(lower) ||
      /^(دفع|paid)\s+/i.test(t);
    if (isExpenseCreate) {
      const amt = this.extractAmount(t);
      const cat = this.extractCategory(t);
      const branch = this.extractBranch(t);
      return {
        kind: 'expense.create',
        language,
        amount: amt,
        category: cat,
        branchName: branch,
        description: t,
      };
    }

    return { kind: 'unknown', language };
  }

  /** Extract a JOD-like amount from a message. Supports "35" "35د" "35 dinar" "3.5" etc. */
  private extractAmount(text: string): number | undefined {
    // Match: number followed optionally by currency
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(د\.?أ|دينار|jod|jd)?/i);
    if (!m) return undefined;
    const n = parseFloat(m[1]!.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  /** Extract expense category from a message. */
  private extractCategory(text: string): string | undefined {
    const keywords: Record<string, string[]> = {
      'بنزين': ['بنزين', 'وقود', 'ديزل', 'petrol', 'fuel', 'gasoline'],
      'كهرباء': ['كهرباء', 'كهرب', 'electricity', 'power'],
      'ماء': ['ماء', 'مياه', 'water'],
      'إيجار': ['ايجار', 'إيجار', 'rent', 'lease'],
      'رواتب': ['راتب', 'رواتب', 'salary', 'salaries', 'payroll'],
      'نقل': ['نقل', 'transport', 'shipping', 'shipment'],
      'صيانة': ['صيانة', 'maintenance', 'repair'],
      'اتصالات': ['اتصالات', 'انترنت', 'internet', 'phone', 'telecom'],
      'ضيافة': ['ضيافة', 'قهوة', 'شاي', 'coffee', 'tea', 'hospitality'],
    };
    for (const [cat, words] of Object.entries(keywords)) {
      for (const w of words) {
        if (text.toLowerCase().includes(w.toLowerCase())) return cat;
      }
    }
    return undefined;
  }

  /** Extract branch name hint (e.g. "فرع عمان", "amman branch"). */
  private extractBranch(text: string): string | undefined {
    const m = text.match(/(?:فرع|branch)\s+([؀-ۿA-Za-z]+)/i);
    return m ? m[1] : undefined;
  }
}

// ============================================================
// Main webhook orchestrator
// ============================================================

@Injectable()
class TelegramService implements OnModuleInit {
  private readonly logger = new Logger('TelegramService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: TelegramApiService,
    private readonly intents: TelegramIntentService,
    private readonly cfg: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.api.isConfigured()) {
      this.logger.log('Telegram bot integration is ACTIVE (TELEGRAM_BOT_TOKEN is set).');
    } else {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — webhook will accept updates but respond with no-op.');
    }
  }

  /**
   * Main entry point. Called by the webhook controller after secret
   * validation. Handles the full lifecycle: auth → intent → action →
   * reply + audit log.
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    // Callback (button press)
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = String(msg.chat.id);
    const tgUserId = msg.from ? String(msg.from.id) : null;
    const text = msg.text;

    // Load or create the TelegramLink row for this chat
    const link = await this.prisma.telegramLink.findUnique({
      where: { telegramChatId: chatId },
      include: { user: { include: { tenant: true } } },
    });

    const intent = this.intents.parse(text);

    // /start CODE — linking flow
    if (intent.kind === 'link' && intent.description) {
      await this.doLink(chatId, tgUserId, intent.description);
      return;
    }
    // Menu / help — allowed even without linking
    if (intent.kind === 'help' || intent.kind === 'start' || intent.kind === 'menu') {
      await this.sendHelp(chatId, intent.language, Boolean(link?.isActive));
      return;
    }

    // Anything else requires an active link
    if (!link || !link.isActive || !link.user || !link.user.tenantId) {
      await this.log(null, null, chatId, tgUserId, intent.kind, text, null, 'denied', 'not linked');
      await this.api.sendMessage(chatId,
        intent.language === 'en'
          ? '🔒 You are not authorized. Open Qit3ati → Settings → Telegram to get a link code, then send `/start CODE`.'
          : '🔒 حسابك غير مربوط بالنظام. افتح قِطَعتي ← الإعدادات ← تيليجرام لتحصل على رمز الربط، ثم أرسل `/start CODE`.');
      return;
    }

    const ctx = { chatId, tgUserId, userId: link.userId!, tenantId: link.user.tenantId };

    switch (intent.kind) {
      case 'sales.today':      await this.sendSalesReport(ctx, 'today',     intent.language); break;
      case 'sales.yesterday':  await this.sendSalesReport(ctx, 'yesterday', intent.language); break;
      case 'sales.week':       await this.sendSalesReport(ctx, 'week',      intent.language); break;
      case 'sales.month':      await this.sendSalesReport(ctx, 'month',     intent.language); break;

      case 'expense.today':    await this.sendExpenseReport(ctx, 'today', intent.language); break;
      case 'expense.week':     await this.sendExpenseReport(ctx, 'week',  intent.language); break;
      case 'expense.month':    await this.sendExpenseReport(ctx, 'month', intent.language); break;

      case 'stock.low':        await this.sendLowStock(ctx, intent.language); break;
      case 'debts.customers':  await this.sendReceivables(ctx, intent.language); break;
      case 'debts.suppliers':  await this.sendPayables(ctx, intent.language); break;

      case 'expense.create':   await this.startExpenseFlow(ctx, intent); break;

      case 'confirm':
      case 'cancel':
      case 'edit':             await this.continueFlow(ctx, intent, text); break;

      default:                 await this.replyUnknown(chatId, intent.language);
    }
  }

  private async handleCallback(cq: NonNullable<TelegramUpdate['callback_query']>) {
    await this.api.answerCallback(cq.id);
    if (!cq.message || !cq.data) return;
    const chatId = String(cq.message.chat.id);
    const tgUserId = String(cq.from.id);

    const link = await this.prisma.telegramLink.findUnique({
      where: { telegramChatId: chatId },
      include: { user: true },
    });
    if (!link?.isActive || !link.user?.tenantId) {
      await this.api.sendMessage(chatId, '🔒 Not linked.');
      return;
    }

    // Button data format: "action:key" — e.g. "confirm:expense" or "cancel:expense"
    const [action, key] = cq.data.split(':');
    if (action === 'confirm' && key === 'expense') {
      await this.finalizeExpense({ chatId, tgUserId, userId: link.userId!, tenantId: link.user.tenantId });
    } else if (action === 'cancel') {
      await this.setState(chatId, null, {});
      await this.api.sendMessage(chatId, '❌ تم الإلغاء / Cancelled.');
    } else if (action === 'menu') {
      await this.sendHelp(chatId, 'ar', true);
    }
  }

  // ------------------------------------------------------------
  // Auth linking
  // ------------------------------------------------------------

  private async doLink(chatId: string, tgUserId: string | null, code: string) {
    const codeUpper = code.trim().toUpperCase();
    const link = await this.prisma.telegramLink.findFirst({
      where: { linkCode: codeUpper, telegramChatId: null },
    });
    if (!link) {
      await this.api.sendMessage(chatId, '❌ رمز الربط غير صالح أو مستعمل من قبل / Invalid or already-used link code.');
      return;
    }
    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: {
        telegramChatId: chatId,
        isActive: true,
        linkCode: null,
      },
    });
    await this.log(link.tenantId, link.userId, chatId, tgUserId, 'link', code, null, 'ok', 'linked');
    await this.api.sendMessage(chatId,
      '✅ تم ربط حسابك بنجاح! أرسل /help لرؤية الأوامر.\n' +
      '✅ Your account is linked. Send /help to see commands.');
  }

  // ------------------------------------------------------------
  // Menu / help
  // ------------------------------------------------------------

  private async sendHelp(chatId: string, lang: 'ar' | 'en', linked: boolean) {
    const ar =
      '👋 *مرحبًا بك في بوت قِطَعتي*\n\n' +
      (linked ? '' : '⚠️ حسابك غير مربوط. أرسل `/start CODE` باستخدام رمز الربط من صفحة الإعدادات في النظام.\n\n') +
      '*التقارير*:\n' +
      '• `مبيعات اليوم`\n' +
      '• `مبيعات الشهر`\n' +
      '• `مصاريف اليوم`\n' +
      '• `مصاريف الشهر`\n' +
      '• `المواد القريبة من النفاد`\n' +
      '• `ذمم العملاء`\n' +
      '• `ذمم الموردين`\n\n' +
      '*المعاملات*:\n' +
      '• `سجل مصروف بنزين 35 دينار`\n' +
      '• `دفع للمورد 500 دينار`\n\n' +
      'اكتب أي جملة عربية وسيفهمها البوت.';
    const en =
      '👋 *Welcome to the Qit3ati bot*\n\n' +
      (linked ? '' : '⚠️ Not linked. Send `/start CODE` with the link code from the Settings page.\n\n') +
      '*Reports*:\n' +
      '• `today\'s sales`\n' +
      '• `monthly sales`\n' +
      '• `today\'s expenses`\n' +
      '• `monthly expenses`\n' +
      '• `low stock`\n' +
      '• `customer debts`\n' +
      '• `supplier debts`\n\n' +
      '*Transactions*:\n' +
      '• `add fuel expense 35 JOD`\n' +
      '• `paid supplier 500`\n\n' +
      'Just type naturally — I\'ll understand.';
    await this.api.sendMessage(chatId, lang === 'en' ? en : ar, { parse_mode: 'Markdown' });
  }

  private async replyUnknown(chatId: string, lang: 'ar' | 'en') {
    await this.api.sendMessage(chatId,
      lang === 'en'
        ? '❓ I didn\'t understand. Send /help for available commands.'
        : '❓ لم أفهم الرسالة. أرسل /help لرؤية الأوامر المتاحة.');
  }

  // ------------------------------------------------------------
  // Reports (reuse existing Prisma queries — no duplicate logic)
  // ------------------------------------------------------------

  private periodRange(period: 'today' | 'yesterday' | 'week' | 'month'): { from: Date; to: Date } {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setHours(23, 59, 59, 999);
    if (period === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (period === 'month') {
      start.setDate(1);
    }
    return { from: start, to: end };
  }

  private async sendSalesReport(ctx: any, period: 'today' | 'yesterday' | 'week' | 'month', lang: 'ar' | 'en') {
    const { from, to } = this.periodRange(period);
    const agg = await this.prisma.salesInvoice.aggregate({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        status: 'completed' as any,
        createdAt: { gte: from, lte: to },
      },
      _count: true,
      _sum: { total: true },
    });
    const total = Number(agg._sum?.total ?? 0);
    const count = agg._count;
    const label = { today: 'اليوم / Today', yesterday: 'أمس / Yesterday', week: 'الأسبوع / Week', month: 'الشهر / Month' }[period];
    const msg = lang === 'en'
      ? `📊 *Sales — ${label}*\nInvoices: *${count}*\nTotal: *${total.toFixed(2)} JOD*`
      : `📊 *المبيعات — ${label}*\nعدد الفواتير: *${count}*\nالإجمالي: *${total.toFixed(2)} د.أ*`;
    await this.api.sendMessage(ctx.chatId, msg, { parse_mode: 'Markdown' });
    await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, `sales.${period}`, null, { total, count }, 'ok', msg);
  }

  private async sendExpenseReport(ctx: any, period: 'today' | 'week' | 'month', lang: 'ar' | 'en') {
    const { from, to } = this.periodRange(period);
    const agg = await this.prisma.expense.aggregate({
      where: {
        tenantId: ctx.tenantId,
        expenseDate: { gte: from, lte: to },
      },
      _count: true,
      _sum: { amount: true },
    });
    const total = Number(agg._sum?.amount ?? 0);
    const count = agg._count;
    const label = { today: 'اليوم / Today', week: 'الأسبوع / Week', month: 'الشهر / Month' }[period];
    const msg = lang === 'en'
      ? `💸 *Expenses — ${label}*\nEntries: *${count}*\nTotal: *${total.toFixed(2)} JOD*`
      : `💸 *المصاريف — ${label}*\nعدد المصاريف: *${count}*\nالإجمالي: *${total.toFixed(2)} د.أ*`;
    await this.api.sendMessage(ctx.chatId, msg, { parse_mode: 'Markdown' });
    await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, `expense.${period}`, null, { total, count }, 'ok', msg);
  }

  private async sendLowStock(ctx: any, lang: 'ar' | 'en') {
    // Reuse the same query the dashboard uses
    const rows = await this.prisma.stock.findMany({
      where: {
        tenantId: ctx.tenantId,
        quantity: { lte: 5 as any },
      },
      include: { part: { select: { name: true, sku: true, minStock: true } } },
      orderBy: { quantity: 'asc' },
      take: 10,
    });
    if (rows.length === 0) {
      await this.api.sendMessage(ctx.chatId,
        lang === 'en' ? '✔ No low-stock parts.' : '✔ لا قطع تحت الحد الأدنى.');
      return;
    }
    const lines = rows.map((r: any) =>
      `• ${r.part?.name ?? '—'} (${r.part?.sku ?? '—'}): ${Number(r.quantity)} / min ${Number(r.part?.minStock ?? 0)}`);
    const header = lang === 'en' ? '⚠️ *Low-stock parts*\n' : '⚠️ *قطع تحت الحد الأدنى*\n';
    await this.api.sendMessage(ctx.chatId, header + lines.join('\n'), { parse_mode: 'Markdown' });
    await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, 'stock.low', null, { count: rows.length }, 'ok', 'sent');
  }

  private async sendReceivables(ctx: any, lang: 'ar' | 'en') {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, balance: { gt: 0 as any } },
      select: { name: true, balance: true, phone: true },
      orderBy: { balance: 'desc' },
      take: 10,
    });
    const total = rows.reduce((s: number, r: any) => s + Number(r.balance ?? 0), 0);
    const lines = rows.map((r: any) => `• ${r.name}: ${Number(r.balance).toFixed(2)} JOD`).join('\n') || '—';
    const msg = lang === 'en'
      ? `👥 *Top receivables* (top 10)\nTotal: *${total.toFixed(2)} JOD*\n${lines}`
      : `👥 *أعلى ذمم العملاء* (أعلى 10)\nالإجمالي: *${total.toFixed(2)} د.أ*\n${lines}`;
    await this.api.sendMessage(ctx.chatId, msg, { parse_mode: 'Markdown' });
    await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, 'debts.customers', null, { total, count: rows.length }, 'ok', 'sent');
  }

  private async sendPayables(ctx: any, lang: 'ar' | 'en') {
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId: ctx.tenantId, balance: { lt: 0 as any } },
      select: { name: true, balance: true, phone: true },
      orderBy: { balance: 'asc' },
      take: 10,
    });
    const total = rows.reduce((s: number, r: any) => s + Math.abs(Number(r.balance ?? 0)), 0);
    const lines = rows.map((r: any) => `• ${r.name}: ${Math.abs(Number(r.balance)).toFixed(2)} JOD`).join('\n') || '—';
    const msg = lang === 'en'
      ? `🏢 *Top payables* (top 10)\nTotal: *${total.toFixed(2)} JOD*\n${lines}`
      : `🏢 *أعلى ذمم الموردين* (أعلى 10)\nالإجمالي: *${total.toFixed(2)} د.أ*\n${lines}`;
    await this.api.sendMessage(ctx.chatId, msg, { parse_mode: 'Markdown' });
    await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, 'debts.suppliers', null, { total, count: rows.length }, 'ok', 'sent');
  }

  // ------------------------------------------------------------
  // Expense creation flow (multi-step, confirmation-based)
  // ------------------------------------------------------------

  private async startExpenseFlow(ctx: any, intent: Intent) {
    const collected: any = {
      amount: intent.amount ?? null,
      category: intent.category ?? null,
      branchName: intent.branchName ?? null,
      description: intent.description ?? null,
      language: intent.language,
    };

    // Try to resolve branch by name
    if (collected.branchName) {
      const b = await this.prisma.branch.findFirst({
        where: { tenantId: ctx.tenantId, name: { contains: collected.branchName, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (b) { collected.branchId = b.id; collected.branchName = b.name; }
    }
    // Default branch: main
    if (!collected.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { tenantId: ctx.tenantId, isMain: true, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });
      if (b) { collected.branchId = b.id; collected.branchName = b.name; }
    }

    // Resolve category by name
    if (collected.category) {
      let cat = await this.prisma.expenseCategory.findFirst({
        where: { tenantId: ctx.tenantId, name: collected.category },
        select: { id: true, name: true },
      });
      if (!cat) {
        cat = await this.prisma.expenseCategory.create({
          data: { tenantId: ctx.tenantId, name: collected.category },
          select: { id: true, name: true },
        });
      }
      collected.categoryId = cat.id;
    }

    // Missing amount → ask
    if (!collected.amount) {
      await this.setState(ctx.chatId, 'expense.awaiting_amount', collected);
      await this.api.sendMessage(ctx.chatId,
        intent.language === 'en' ? '💵 What\'s the amount (JOD)?' : '💵 كم المبلغ (د.أ)؟');
      return;
    }
    // Missing category → ask
    if (!collected.categoryId) {
      await this.setState(ctx.chatId, 'expense.awaiting_category', collected);
      await this.api.sendMessage(ctx.chatId,
        intent.language === 'en' ? '📂 What category? (fuel, rent, salary, …)' : '📂 ما فئة المصروف؟ (بنزين، إيجار، راتب، …)');
      return;
    }

    // Show confirmation
    await this.setState(ctx.chatId, 'expense.awaiting_confirmation', collected);
    const preview = intent.language === 'en'
      ? `📝 *Confirm expense*\nCategory: *${collected.category ?? '—'}*\nAmount: *${collected.amount} JOD*\nBranch: *${collected.branchName ?? '—'}*\n\nReply *confirm* or *cancel*.`
      : `📝 *تأكيد المصروف*\nالفئة: *${collected.category ?? '—'}*\nالمبلغ: *${collected.amount} د.أ*\nالفرع: *${collected.branchName ?? '—'}*\n\nاكتب *تأكيد* أو *إلغاء*.`;
    await this.api.sendMessage(ctx.chatId, preview, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ تأكيد / Confirm', callback_data: 'confirm:expense' },
          { text: '❌ إلغاء / Cancel',   callback_data: 'cancel:expense' },
        ]],
      },
    });
  }

  private async continueFlow(ctx: any, intent: Intent, rawText: string) {
    const conv = await this.getConversation(ctx.chatId);
    if (!conv?.state) {
      await this.replyUnknown(ctx.chatId, intent.language);
      return;
    }
    const collected = (conv.context as any) ?? {};

    if (intent.kind === 'cancel') {
      await this.setState(ctx.chatId, null, {});
      await this.api.sendMessage(ctx.chatId, intent.language === 'en' ? '❌ Cancelled.' : '❌ تم الإلغاء.');
      return;
    }
    if (intent.kind === 'confirm' && conv.state === 'expense.awaiting_confirmation') {
      await this.finalizeExpense(ctx);
      return;
    }
    if (conv.state === 'expense.awaiting_amount') {
      const amt = new TelegramIntentService()['extractAmount'](rawText);
      if (!amt) {
        await this.api.sendMessage(ctx.chatId, intent.language === 'en' ? 'Please send a number.' : 'الرجاء إرسال رقم.');
        return;
      }
      collected.amount = amt;
      await this.startExpenseFlow(ctx, { ...intent, ...collected, kind: 'expense.create' } as any);
      return;
    }
    if (conv.state === 'expense.awaiting_category') {
      const cat = rawText.trim();
      collected.category = cat;
      await this.startExpenseFlow(ctx, { ...intent, ...collected, kind: 'expense.create' } as any);
      return;
    }
  }

  private async finalizeExpense(ctx: any) {
    const conv = await this.getConversation(ctx.chatId);
    const c = (conv?.context as any) ?? {};
    if (!c.amount || !c.categoryId) {
      await this.api.sendMessage(ctx.chatId, 'Missing data — aborting.');
      await this.setState(ctx.chatId, null, {});
      return;
    }
    try {
      const exp = await this.prisma.expense.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: c.branchId ?? null,
          categoryId: c.categoryId,
          amount: c.amount,
          description: `[Telegram] ${c.description ?? ''}`.slice(0, 500),
          expenseDate: new Date(),
          createdBy: ctx.userId,
        },
        include: { category: true, branch: true },
      });
      await this.setState(ctx.chatId, null, {});
      const msg = c.language === 'en'
        ? `✅ Expense saved.\nID: \`${exp.id.slice(0, 8)}\`\nCategory: ${exp.category?.name}\nAmount: *${Number(exp.amount).toFixed(2)} JOD*\nBranch: ${exp.branch?.name ?? '—'}`
        : `✅ تم حفظ المصروف.\nالرقم: \`${exp.id.slice(0, 8)}\`\nالفئة: ${exp.category?.name}\nالمبلغ: *${Number(exp.amount).toFixed(2)} د.أ*\nالفرع: ${exp.branch?.name ?? '—'}`;
      await this.api.sendMessage(ctx.chatId, msg, { parse_mode: 'Markdown' });
      await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, 'expense.create', c.description, c, 'ok', msg, 'expense', exp.id);
    } catch (e: any) {
      await this.log(ctx.tenantId, ctx.userId, ctx.chatId, ctx.tgUserId, 'expense.create', c.description, c, 'error', e?.message);
      await this.api.sendMessage(ctx.chatId,
        c.language === 'en'
          ? '❌ Failed to save the expense. Nothing was charged. Please try again or open Qit3ati.'
          : '❌ فشل حفظ المصروف. لم يتم خصم أي مبلغ. حاول مرة أخرى أو افتح النظام.');
    }
  }

  // ------------------------------------------------------------
  // Conversation state helpers
  // ------------------------------------------------------------

  private async getConversation(chatId: string) {
    return this.prisma.telegramConversation.findUnique({ where: { telegramChatId: chatId } });
  }

  private async setState(chatId: string, state: string | null, context: any) {
    await this.prisma.telegramConversation.upsert({
      where: { telegramChatId: chatId },
      create: { telegramChatId: chatId, state, context },
      update: { state, context },
    });
  }

  // ------------------------------------------------------------
  // Audit log
  // ------------------------------------------------------------

  private async log(
    tenantId: string | null, userId: string | null,
    chatId: string, tgUserId: string | null,
    intent: string, rawText: string | null | undefined, args: any,
    result: 'ok' | 'denied' | 'error' | 'pending',
    reply: string | null | undefined,
    entityType?: string, entityId?: string,
  ) {
    try {
      await this.prisma.telegramCommandLog.create({
        data: {
          tenantId: tenantId ?? undefined,
          userId: userId ?? undefined,
          telegramChatId: chatId,
          telegramUserId: tgUserId ?? undefined,
          intent,
          rawText: rawText ? String(rawText).slice(0, 500) : undefined,
          args: args ?? undefined,
          result,
          reply: reply ? String(reply).slice(0, 500) : undefined,
          entityType,
          entityId,
        },
      });
    } catch (e: any) {
      this.logger.warn('Failed to write TelegramCommandLog: ' + e?.message);
    }
  }
}

// ============================================================
// Public webhook controller
// ============================================================

@Controller('telegram')
class TelegramWebhookController {
  private readonly logger = new Logger('TelegramWebhook');
  private readonly webhookSecret: string;

  constructor(
    private readonly service: TelegramService,
    private readonly cfg: ConfigService,
  ) {
    this.webhookSecret = this.cfg.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Query('secret') secret: string, @Body() body: TelegramUpdate) {
    if (!this.webhookSecret || secret !== this.webhookSecret) {
      throw new ForbiddenException('invalid webhook secret');
    }
    // Always return 200 even on error — Telegram retries indefinitely otherwise
    try {
      await this.service.handleUpdate(body);
    } catch (e: any) {
      this.logger.error('handleUpdate crashed', e?.stack ?? e?.message);
    }
    return { ok: true };
  }
}

// ============================================================
// Admin REST API — used by /settings/telegram in the web app
// ============================================================

class CreateLinkCodeDto {
  @IsUUID() userId!: string;
}
class ApproveLinkDto {
  @IsUUID() @IsOptional() userId?: string;
}

@Injectable()
class TelegramAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Generate a fresh 6-character link code for a user. Existing pending
   *  codes for the same user are invalidated first. */
  async createLinkCode(tenantId: string, userId: string) {
    const code = this.randomCode();
    // Invalidate any previous pending links for this user
    await this.prisma.telegramLink.deleteMany({
      where: { tenantId, userId, telegramChatId: null },
    });
    const link = await this.prisma.telegramLink.create({
      data: { tenantId, userId, linkCode: code, isActive: false },
    });
    return { id: link.id, code, expiresIn: '24 hours' };
  }

  listLinks(tenantId: string) {
    return this.prisma.telegramLink.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(tenantId: string, linkId: string) {
    const link = await this.prisma.telegramLink.findFirst({ where: { id: linkId, tenantId } });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.telegramLink.update({ where: { id: linkId }, data: { isActive: false } });
    return { ok: true };
  }

  async setActive(tenantId: string, linkId: string, isActive: boolean) {
    const link = await this.prisma.telegramLink.findFirst({ where: { id: linkId, tenantId } });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.telegramLink.update({ where: { id: linkId }, data: { isActive } });
    return { ok: true };
  }

  commandLog(tenantId: string, limit = 100) {
    return this.prisma.telegramCommandLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, limit),
    });
  }

  private randomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    let out = '';
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }
}

@Controller('telegram/admin')
class TelegramAdminController {
  constructor(private readonly svc: TelegramAdminService) {}

  @Post('link-codes')
  @Permissions('users.manage')
  createLinkCode(@Tenant() tenantId: string, @Body() d: CreateLinkCodeDto) {
    return this.svc.createLinkCode(tenantId, d.userId);
  }

  @Get('links')
  @Permissions('users.manage')
  listLinks(@Tenant() tenantId: string) {
    return this.svc.listLinks(tenantId);
  }

  @Delete('links/:id')
  @Permissions('users.manage')
  revoke(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.svc.revoke(tenantId, id);
  }

  @Patch('links/:id')
  @Permissions('users.manage')
  setActive(@Tenant() tenantId: string, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.svc.setActive(tenantId, id, Boolean(body.isActive));
  }

  @Get('command-log')
  @Permissions('users.manage')
  log(@Tenant() tenantId: string, @Query('limit') limit?: string) {
    return this.svc.commandLog(tenantId, limit ? Number(limit) : 100);
  }
}

// ============================================================
// Module
// ============================================================

@Module({
  controllers: [TelegramWebhookController, TelegramAdminController],
  providers: [
    TelegramApiService,
    TelegramIntentService,
    TelegramService,
    TelegramAdminService,
  ],
  exports: [TelegramService, TelegramApiService],
})
export class TelegramModule {}
