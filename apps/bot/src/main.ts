/**
 * Qit3ati Telegram bot — placeholder.
 * Full implementation comes in M5 (per Roadmap).
 *
 * Commands to implement:
 *   /sale, /expense, /newitem, /stock, /return, /damage, /report, /doc, /collect, /purchase, /link, /help
 */
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN missing — bot will not start. Set it in .env to enable.');
  process.exit(0);
}

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('مرحباً بك في بوت قِطَعتي! اكتب /help لرؤية الأوامر.'));
bot.help((ctx) => ctx.reply([
  'الأوامر المتاحة:',
  '/sale — تسجيل بيع',
  '/expense — إضافة مصروف',
  '/newitem — صنف جديد',
  '/stock — استعلام مخزون',
  '/report — تقرير سريع',
  '/link — ربط الحساب أول مرة',
].join('\n')));

bot.launch().then(() => console.log('🤖 Telegram bot is running'));
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
