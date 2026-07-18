/**
 * TelegramSettingsPage — Enterprise Telegram Management Center
 * ─────────────────────────────────────────────────────────────
 * Multi-user management surface (replaces the single-card view).
 *   • Four KPI cards: Total / Active / Disabled / Last activity
 *   • Filters: search, branch, role, status
 *   • Table: employee, Telegram identity, role, branches, linked date,
 *     last activity, status
 *   • Row actions: Enable/Disable, Remove, View activity
 *   • Toolbar action: Link New Telegram Account (picks an employee,
 *     issues a one-time 6-char code they type into the bot)
 *
 * Every action calls the /telegram/admin/* endpoints. Never touches
 * Telegram commands themselves — the bot handler keeps working
 * exactly as it did before.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Send, Copy, Check, XCircle, Power, PowerOff, Trash2, MessageSquare, Bot,
  Search, RefreshCw, Users, Clock, ShieldCheck, AlertTriangle, Plus, ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';

interface LinkRow {
  id:               string;
  telegramChatId:   string | null;
  telegramUsername: string | null;
  telegramUserId:   string | null;
  linkCode:         string | null;
  isActive:         boolean;
  status:           'active' | 'disabled' | 'pending';
  linkedAt:         string | null;
  createdAt:        string;
  lastActivityAt:   string | null;
  employee: null | {
    id:       string;
    name:     string;
    email:    string | null;
    phone:    string | null;
    role:     string | null;
    roleId:   string | null;
    branches: Array<{ id: string; name: string }>;
  };
}
interface Stats {
  total: number; active: number; disabled: number; pending: number;
  lastActivityAt: string | null; lastCommandAt: string | null;
}
interface UserRow { id: string; fullName: string; email: string | null; role?: { id: string; name: string; labelAr: string | null } | null; }
interface Branch  { id: string; name: string; }
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
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Filters
  const [q,        setQ]        = useState('');
  const [branchId, setBranchId] = useState('');
  const [roleId,   setRoleId]   = useState('');
  const [status,   setStatus]   = useState<'all' | 'active' | 'disabled' | 'pending'>('all');

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [activityFor,   setActivityFor]   = useState<LinkRow | null>(null);
  const [issuedCode,    setIssuedCode]    = useState<{ code: string; user: string } | null>(null);

  const stats = useQuery<Stats>({
    queryKey: ['telegram-stats'],
    queryFn: async () => (await api.get('/telegram/admin/stats')).data,
    refetchInterval: 30_000,
  });
  const links = useQuery<LinkRow[]>({
    queryKey: ['telegram-links', q, branchId, roleId, status],
    queryFn: async () => (await api.get('/telegram/admin/links', {
      params: { q: q || undefined, branchId: branchId || undefined, roleId: roleId || undefined,
                status: status === 'all' ? undefined : status },
    })).data,
    refetchInterval: 30_000,
  });
  const branches = useQuery<Branch[]>({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const r = await api.get('/branches');
      return Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
    },
    staleTime: 60_000,
  });
  const users = useQuery<UserRow[]>({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users')).data,
    staleTime: 60_000,
  });

  const rolesUnique = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of links.data ?? []) {
      if (l.employee?.roleId && l.employee?.role) map.set(l.employee.roleId, l.employee.role);
    }
    for (const u of users.data ?? []) {
      if (u.role?.id) map.set(u.role.id, u.role.labelAr || u.role.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [links.data, users.data]);

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/telegram/admin/links/${id}`, { isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['telegram-links'] });
                       qc.invalidateQueries({ queryKey: ['telegram-stats'] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/telegram/admin/links/${id}/hard`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['telegram-links'] });
                       qc.invalidateQueries({ queryKey: ['telegram-stats'] }); },
  });
  const createCode = useMutation({
    mutationFn: (userId: string) => api.post('/telegram/admin/link-codes', { userId }),
    onSuccess: (r, userId) => {
      const u = users.data?.find(x => x.id === userId);
      setIssuedCode({ code: r.data.code, user: u?.fullName ?? 'موظف' });
      qc.invalidateQueries({ queryKey: ['telegram-links'] });
      qc.invalidateQueries({ queryKey: ['telegram-stats'] });
      setShowLinkModal(false);
    },
  });

  return (
    <div>
      <PageHeader
        title={t('telegramMgmt.title', { defaultValue: 'مركز إدارة تيليجرام' })}
        subtitle={t('telegramMgmt.subtitle', { defaultValue: 'ربط ومتابعة حسابات تيليجرام للموظفين' })}
        actions={
          <button className="btn-primary" onClick={() => setShowLinkModal(true)}>
            <Plus size={16} /> {t('telegramMgmt.linkNew', { defaultValue: 'ربط حساب تيليجرام جديد' })}
          </button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label={t('telegramMgmt.total',    { defaultValue: 'إجمالي الحسابات' }) as string}
                  value={stats.data?.total ?? 0} icon={<Users />} />
        <StatCard label={t('telegramMgmt.active',   { defaultValue: 'نشطة' }) as string}
                  value={stats.data?.active ?? 0} icon={<ShieldCheck />} accent="emerald" />
        <StatCard label={t('telegramMgmt.disabled', { defaultValue: 'معطّلة' }) as string}
                  value={stats.data?.disabled ?? 0} icon={<PowerOff />} accent="slate" />
        <StatCard label={t('telegramMgmt.lastActivity', { defaultValue: 'آخر نشاط' }) as string}
                  value={stats.data?.lastActivityAt ? relativeTime(stats.data.lastActivityAt) : '—'}
                  icon={<Clock />} accent={stats.data?.lastActivityAt ? 'blue' : 'slate'} />
      </div>

      {/* Filters */}
      <div className="card p-3 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="label text-xs">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
              <input className="input pr-9 py-2 text-sm"
                     placeholder={t('telegramMgmt.searchHint', { defaultValue: 'بحث بالاسم أو المعرّف' }) as string}
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label text-xs">{t('telegramMgmt.branch', { defaultValue: 'الفرع' })}</label>
            <select className="input py-2 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— {t('header.allBranches', { defaultValue: 'كل الفروع' })} —</option>
              {(branches.data ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">{t('telegramMgmt.role', { defaultValue: 'الدور' })}</label>
            <select className="input py-2 text-sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">— {t('telegramMgmt.allRoles', { defaultValue: 'كل الأدوار' })} —</option>
              {rolesUnique.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">{t('telegramMgmt.status', { defaultValue: 'الحالة' })}</label>
            <select className="input py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="all">{t('telegramMgmt.all',      { defaultValue: 'الكل' })}</option>
              <option value="active">{t('telegramMgmt.active', { defaultValue: 'نشطة' })}</option>
              <option value="disabled">{t('telegramMgmt.disabled', { defaultValue: 'معطّلة' })}</option>
              <option value="pending">{t('telegramMgmt.pending',   { defaultValue: 'قيد الربط' })}</option>
            </select>
          </div>
          <button className="btn-ghost text-sm" onClick={() => { setQ(''); setBranchId(''); setRoleId(''); setStatus('all'); }}>
            {t('common.reset', { defaultValue: 'مسح الفلاتر' })}
          </button>
          <button className="btn-ghost text-sm" onClick={() => { links.refetch(); stats.refetch(); }}>
            <RefreshCw size={14} className={links.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Freshly issued code banner */}
      {issuedCode && (
        <CodeBanner user={issuedCode.user} code={issuedCode.code} onClose={() => setIssuedCode(null)} />
      )}

      {/* Table */}
      <div className="card p-3">
        {links.isLoading ? (
          <p className="text-muted text-center py-8">{t('common.loading')}</p>
        ) : (links.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Bot className="text-muted" size={40} />}
            title={t('telegramMgmt.emptyTitle', { defaultValue: 'لا توجد حسابات تيليجرام مربوطة' }) as string}
            description={t('telegramMgmt.emptyDesc', { defaultValue: 'اربط أول حساب تيليجرام لتفعيل تقارير المبيعات وتسجيل المصاريف من الموبايل' }) as string}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean min-w-full text-sm">
              <thead>
                <tr>
                  <th>{t('telegramMgmt.employee',    { defaultValue: 'الموظف' })}</th>
                  <th>{t('telegramMgmt.telegramUsername', { defaultValue: 'حساب تيليجرام' })}</th>
                  <th>{t('telegramMgmt.telegramId',  { defaultValue: 'Chat ID' })}</th>
                  <th>{t('telegramMgmt.role',        { defaultValue: 'الدور' })}</th>
                  <th>{t('telegramMgmt.branches',    { defaultValue: 'الفروع' })}</th>
                  <th>{t('telegramMgmt.linkedAt',    { defaultValue: 'تاريخ الربط' })}</th>
                  <th>{t('telegramMgmt.lastActivity',{ defaultValue: 'آخر نشاط' })}</th>
                  <th>{t('telegramMgmt.status',      { defaultValue: 'الحالة' })}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(links.data ?? []).map(l => (
                  <tr key={l.id}>
                    <td className="font-bold">
                      {l.employee?.name ?? '—'}
                      {l.employee?.email && <div className="text-xs text-muted font-normal">{l.employee.email}</div>}
                    </td>
                    <td className="font-mono">{l.telegramUsername ?? (l.linkCode ? <span className="text-amber-700">code:{l.linkCode}</span> : '—')}</td>
                    <td className="font-mono text-xs text-muted">{l.telegramChatId ?? '—'}</td>
                    <td>{l.employee?.role ?? '—'}</td>
                    <td>
                      {l.employee?.branches?.length
                        ? l.employee.branches.map(b => b.name).join('، ')
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-xs text-muted">{l.linkedAt ? new Date(l.linkedAt).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{l.lastActivityAt ? relativeTime(l.lastActivityAt) : '—'}</td>
                    <td><StatusPill status={l.status} /></td>
                    <td className="flex items-center gap-1 justify-end">
                      <button className="btn-ghost text-xs"
                              title={t('telegramMgmt.viewActivity', { defaultValue: 'عرض النشاط' }) as string}
                              onClick={() => setActivityFor(l)}>
                        <MessageSquare size={14} />
                      </button>
                      {l.status !== 'pending' && (
                        l.isActive ? (
                          <button className="btn-ghost text-xs text-amber-600"
                                  title={t('telegramMgmt.disable', { defaultValue: 'تعطيل' }) as string}
                                  onClick={() => setActive.mutate({ id: l.id, isActive: false })}>
                            <PowerOff size={14} />
                          </button>
                        ) : (
                          <button className="btn-ghost text-xs text-emerald-600"
                                  title={t('telegramMgmt.enable', { defaultValue: 'تفعيل' }) as string}
                                  onClick={() => setActive.mutate({ id: l.id, isActive: true })}>
                            <Power size={14} />
                          </button>
                        )
                      )}
                      <button className="btn-ghost text-xs text-red-600"
                              title={t('common.remove', { defaultValue: 'إزالة' }) as string}
                              onClick={() => {
                                if (confirm(t('telegramMgmt.confirmRemove', { defaultValue: 'إزالة هذا الحساب نهائياً؟ سيبقى سجل الأوامر محفوظاً.' }) as string)) {
                                  remove.mutate(l.id);
                                }
                              }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer meta */}
      <p className="text-xs text-muted text-center py-3 flex items-center justify-center gap-1">
        <ShieldCheck size={12} />
        {t('telegramMgmt.securityNote', { defaultValue: 'كل حساب مربوط بموظف واحد فقط، ويحترم صلاحياته وفروعه.' })}
      </p>

      {/* Modals */}
      {showLinkModal && (
        <LinkNewModal
          users={users.data ?? []}
          existingLinks={links.data ?? []}
          onClose={() => setShowLinkModal(false)}
          onSubmit={(userId) => createCode.mutate(userId)}
          error={createCode.error ? errMsg(createCode.error) : null}
          pending={createCode.isPending}
        />
      )}
      {activityFor && (
        <ActivityModal link={activityFor} onClose={() => setActivityFor(null)} />
      )}
    </div>
  );
}

// ============================================================
function StatCard({ label, value, icon, accent }: { label: string; value: any; icon: React.ReactNode;
                                                     accent?: 'emerald' | 'blue' | 'slate' | 'amber' }) {
  const color =
    accent === 'emerald' ? 'text-emerald-600' :
    accent === 'blue'    ? 'text-blue-600' :
    accent === 'slate'   ? 'text-slate-500' :
    accent === 'amber'   ? 'text-amber-600' :
    'text-primary';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-muted mb-1">
        <span className={color}>{icon}</span> {label}
      </div>
      <div className="text-xl font-extrabold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'disabled' | 'pending' }) {
  const cls =
    status === 'active'   ? 'bg-emerald-100 text-emerald-700' :
    status === 'disabled' ? 'bg-slate-100 text-slate-600' :
    'bg-amber-100 text-amber-700';
  const label =
    status === 'active' ? 'نشط' :
    status === 'disabled' ? 'معطّل' : 'قيد الربط';
  return <span className={'pill ' + cls}>{label}</span>;
}

function CodeBanner({ code, user, onClose }: { code: string; user: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4 mb-3 border-emerald-300 bg-emerald-50 flex items-center gap-3">
      <Check className="text-emerald-600" size={32} />
      <div className="flex-1">
        <div className="font-bold text-emerald-900">تم إصدار رمز الربط لـ <span className="font-mono">{user}</span></div>
        <div className="text-xs text-emerald-800 mt-0.5">
          أرسل هذا الرمز إلى الموظف، ثم يفتح البوت في تيليجرام ويرسل <code className="font-mono">/start {code}</code>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="text-lg font-mono font-extrabold bg-white border border-emerald-300 px-3 py-1.5 rounded">{code}</code>
        <button className="btn-ghost"
                onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button className="btn-ghost" onClick={onClose}><XCircle size={16} /></button>
      </div>
    </div>
  );
}

function LinkNewModal({ users, existingLinks, onClose, onSubmit, error, pending }: {
  users: UserRow[]; existingLinks: LinkRow[]; onClose: () => void;
  onSubmit: (userId: string) => void;
  error: string | null; pending: boolean;
}) {
  const [userId, setUserId] = useState('');
  const activeUserIds = new Set(existingLinks.filter(l => l.status === 'active' && l.employee).map(l => l.employee!.id));
  const eligible = users.filter(u => !activeUserIds.has(u.id));
  return (
    <Modal open onClose={onClose} title="ربط حساب تيليجرام جديد">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          اختر الموظف الذي تريد ربط حساب تيليجرام له. الموظفون الذين لديهم حساب نشط مسبقاً لا يظهرون هنا لضمان أن لكل موظف حساب واحد فقط.
        </p>
        <div>
          <label className="label">الموظف *</label>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— اختر —</option>
            {eligible.map(u => <option key={u.id} value={u.id}>{u.fullName} {u.email ? `— ${u.email}` : ''}</option>)}
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={!userId || pending} onClick={() => onSubmit(userId)}>
            {pending ? 'جاري الإصدار...' : 'إصدار رمز الربط'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ActivityModal({ link, onClose }: { link: LinkRow; onClose: () => void }) {
  const activity = useQuery<LogRow[]>({
    queryKey: ['telegram-link-activity', link.id],
    queryFn: async () => (await api.get(`/telegram/admin/links/${link.id}/activity`, { params: { limit: 100 } })).data,
  });
  return (
    <Modal open onClose={onClose} size="lg" title={`نشاط ${link.employee?.name ?? 'الحساب'} — ${link.telegramUsername ?? link.telegramChatId ?? ''}`}>
      {activity.isLoading ? (
        <p className="text-muted text-center py-6">جاري التحميل...</p>
      ) : (activity.data?.length ?? 0) === 0 ? (
        <p className="text-muted text-center py-6">لا يوجد نشاط بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-clean text-xs min-w-full">
            <thead><tr>
              <th>الوقت</th><th>الأمر</th><th>النص</th><th>النتيجة</th><th>الردّ</th>
            </tr></thead>
            <tbody>
              {(activity.data ?? []).map((r) => (
                <tr key={String(r.id)}>
                  <td className="text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="font-mono">{r.intent ?? '—'}</td>
                  <td className="max-w-[260px] truncate">{r.rawText ?? '—'}</td>
                  <td>
                    <span className={
                      'pill ' +
                      (r.result === 'ok'     ? 'bg-emerald-100 text-emerald-700' :
                       r.result === 'denied' ? 'bg-amber-100 text-amber-700' :
                       r.result === 'error'  ? 'bg-red-100 text-red-700' :
                       'bg-slate-100 text-slate-600')
                    }>{r.result}</span>
                  </td>
                  <td className="max-w-[280px] truncate text-muted">{r.reply ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// Small utilities
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)     return `منذ ${s} ث`;
  if (s < 3600)   return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400)  return `منذ ${Math.floor(s / 3600)} س`;
  if (s < 604800) return `منذ ${Math.floor(s / 86400)} يوم`;
  return new Date(iso).toLocaleDateString();
}
