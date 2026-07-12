/**
 * Telegram Settings Page — /settings/telegram
 * ─────────────────────────────────────────────────────────────
 * Admin surface for the Telegram bot integration:
 *   • Generate one-time link codes for ERP users
 *   • Approve / revoke / activate linked Telegram accounts
 *   • View activity log (every command with result + reply)
 *
 * The workflow:
 *   1. Admin clicks "Generate code" next to a user
 *   2. Backend creates a TelegramLink row with a 6-char code
 *   3. Admin shares the code with the user
 *   4. User opens the bot in Telegram, sends `/start CODE`
 *   5. Backend binds the chatId to the userId — link becomes active
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Copy, Check, XCircle, RefreshCw, Trash2, MessageSquare, Bot, Clock } from 'lucide-react';
import { api } from '@/lib/api';

interface UserRow { id: string; fullName: string; email: string | null; }
interface LinkRow {
  id: string;
  userId: string | null;
  telegramChatId: string | null;
  linkCode: string | null;
  isActive: boolean;
  createdAt: string;
  user: { id: string; fullName: string; email: string | null } | null;
}
interface LogRow {
  id: string | number;
  telegramChatId: string;
  telegramUserId: string | null;
  intent: string | null;
  rawText: string | null;
  result: 'ok' | 'denied' | 'error' | 'pending';
  reply: string | null;
  createdAt: string;
}

export default function TelegramSettingsPage() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const users = useQuery<UserRow[]>({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const links = useQuery<LinkRow[]>({
    queryKey: ['telegram-links'],
    queryFn: async () => (await api.get('/telegram/admin/links')).data,
  });

  const logs = useQuery<LogRow[]>({
    queryKey: ['telegram-log'],
    queryFn: async () => (await api.get('/telegram/admin/command-log?limit=50')).data,
    refetchInterval: 30_000,
  });

  const createCode = useMutation({
    mutationFn: async (userId: string) => (await api.post('/telegram/admin/link-codes', { userId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-links'] }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/telegram/admin/links/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-links'] }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await api.patch(`/telegram/admin/links/${id}`, { isActive })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-links'] }),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const pending = (links.data ?? []).filter((l) => l.linkCode && !l.telegramChatId);
  const active  = (links.data ?? []).filter((l) => l.telegramChatId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Bot size={32} />
          <h1 className="text-2xl font-extrabold">تكامل تيليجرام / Telegram Integration</h1>
        </div>
        <p className="text-white/85 text-sm">
          اربط حسابات المستخدمين بتيليجرام لتنفيذ العمليات وطلب التقارير مباشرة من الجوال.
        </p>
      </div>

      {/* Setup instructions */}
      <div className="card">
        <h2 className="font-extrabold text-lg mb-3 flex items-center gap-2">
          <MessageSquare size={20} className="text-primary" /> كيف يعمل الربط
        </h2>
        <ol className="space-y-2 text-sm text-muted leading-7 list-decimal pr-5">
          <li>اضغط <b>"إنشاء رمز ربط"</b> بجانب المستخدم.</li>
          <li>انسخ الرمز المكوّن من 6 أحرف وأرسله للمستخدم.</li>
          <li>يفتح المستخدم بوت قِطَعتي في تيليجرام ويرسل: <code className="bg-bg px-1.5 rounded">/start CODE</code></li>
          <li>يصبح حسابه مربوطاً — يمكنه بعدها طلب التقارير وتسجيل المصاريف.</li>
        </ol>
      </div>

      {/* Generate link codes */}
      <div className="card">
        <h2 className="font-extrabold text-lg mb-4">إنشاء رمز ربط لمستخدم</h2>
        {users.isLoading ? (
          <p className="text-muted text-sm">جاري التحميل…</p>
        ) : (users.data ?? []).length === 0 ? (
          <p className="text-muted text-sm">لا يوجد مستخدمون.</p>
        ) : (
          <div className="space-y-2">
            {(users.data ?? []).map((u) => {
              const existing = pending.find((l) => l.userId === u.id);
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 border border-line rounded-lg p-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold">{u.fullName}</div>
                    <div className="text-xs text-muted">{u.email ?? '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {existing?.linkCode && (
                      <button
                        onClick={() => copyCode(existing.linkCode!)}
                        className="btn-ghost text-xs font-mono"
                      >
                        {copied === existing.linkCode ? <Check size={14} /> : <Copy size={14} />}
                        {existing.linkCode}
                      </button>
                    )}
                    <button
                      onClick={() => createCode.mutate(u.id)}
                      disabled={createCode.isPending}
                      className="btn-primary text-xs"
                    >
                      <RefreshCw size={14} /> {existing ? 'إعادة توليد' : 'إنشاء رمز ربط'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active links */}
      <div className="card">
        <h2 className="font-extrabold text-lg mb-4 flex items-center gap-2">
          الحسابات المربوطة <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">لا حسابات مربوطة بعد.</p>
        ) : (
          <div className="space-y-2">
            {active.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 border border-line rounded-lg p-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    {l.user?.fullName ?? '—'}
                    {l.isActive
                      ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">نشط</span>
                      : <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">معطّل</span>}
                  </div>
                  <div className="text-xs text-muted">
                    Chat ID: <code>{l.telegramChatId}</code> · منذ {new Date(l.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle.mutate({ id: l.id, isActive: !l.isActive })}
                    className={l.isActive ? 'btn-ghost text-xs' : 'btn-primary text-xs'}
                  >
                    {l.isActive ? <><XCircle size={14} /> تعطيل</> : <><Check size={14} /> تفعيل</>}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('حذف الربط نهائياً؟')) revoke.mutate(l.id);
                    }}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                    title="حذف الربط"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="card">
        <h2 className="font-extrabold text-lg mb-4 flex items-center gap-2">
          <Clock size={20} className="text-primary" /> سجل الأوامر (آخر 50)
        </h2>
        {logs.isLoading ? (
          <p className="text-muted text-sm">جاري التحميل…</p>
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">لا سجلات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="p-2">الوقت</th>
                  <th className="p-2">Chat</th>
                  <th className="p-2">الأمر</th>
                  <th className="p-2">النص</th>
                  <th className="p-2">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {(logs.data ?? []).map((row) => (
                  <tr key={String(row.id)} className="border-b border-line hover:bg-bg/40">
                    <td className="p-2 text-xs text-muted whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs font-mono">{row.telegramChatId}</td>
                    <td className="p-2 text-xs">{row.intent ?? '—'}</td>
                    <td className="p-2 text-xs max-w-[240px] truncate" title={row.rawText ?? ''}>
                      {row.rawText ?? '—'}
                    </td>
                    <td className="p-2">
                      <span className={
                        'text-[10px] px-2 py-0.5 rounded-full font-bold ' +
                        (row.result === 'ok'      ? 'bg-green-100 text-green-700' :
                         row.result === 'denied'  ? 'bg-amber-100 text-amber-700' :
                         row.result === 'error'   ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-700')
                      }>
                        {row.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bot info footer */}
      <div className="text-center text-xs text-muted">
        <Send size={14} className="inline mx-1" />
        Bot: <b>@Qit3atiBot</b> (ضبط الاسم من BotFather)
      </div>
    </div>
  );
}
