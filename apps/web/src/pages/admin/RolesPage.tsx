/**
 * RolesPage
 * ─────────
 * Admin surface for the permission matrix. Two panes:
 *   • Left  — list of roles (system + custom) + create-new + delete
 *   • Right — permission matrix for the selected role, grouped by
 *             module with "select all in module" toggles
 *
 * Rules the UI enforces (mirroring the backend):
 *   • System roles can't be renamed or deleted, but their permissions
 *     can be edited (backend transparently clones into a tenant copy
 *     on first save — the UI just reloads the list afterwards).
 *   • Editing the "owner" role blocks saves that would remove any
 *     permission (the backend also enforces this — we mirror it in
 *     the UI so the user sees an inline error rather than a 400).
 *   • A role in use by ≥1 user can't be deleted.
 *
 * Access: gated by users.manage permission (checked at the route level
 * via a redirect in App.tsx, plus the sidebar link is hidden). Backend
 * also refuses with 403.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Save, Trash2, Users, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';

interface RoleListRow {
  id: string; name: string; labelAr: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}
interface RoleDetail {
  id: string; name: string; labelAr: string | null;
  isSystem: boolean;
  permissions: string[];
}
interface PermGroup {
  module: string;
  items: { code: string; module: string; labelAr: string | null }[];
}

export default function RolesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState('');

  const roles = useQuery<RoleListRow[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  const allPerms = useQuery<PermGroup[]>({
    queryKey: ['permissions'],
    queryFn: async () => (await api.get('/permissions')).data,
    staleTime: 5 * 60 * 1000,
  });

  const detail = useQuery<RoleDetail>({
    queryKey: ['role', selectedId],
    queryFn: async () => (await api.get(`/roles/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data[0].id);
  }, [roles.data, selectedId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (roles.data ?? []).filter(r =>
      !s || r.name.toLowerCase().includes(s) || (r.labelAr ?? '').toLowerCase().includes(s));
  }, [roles.data, q]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setSelectedId(null); },
  });

  return (
    <div>
      <PageHeader
        title={t('roles.title', { defaultValue: 'الأدوار والصلاحيات' })}
        subtitle={t('roles.subtitle', { defaultValue: 'إدارة أدوار المستخدمين ومصفوفة الصلاحيات' })}
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('roles.new', { defaultValue: 'دور جديد' })}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Left — role list */}
        <aside className="card p-3">
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input pr-9 py-2 text-sm"
              placeholder={t('common.search') as string}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {roles.isLoading ? (
            <p className="text-muted text-center py-6">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Shield className="text-muted" size={32} />}
              title={t('roles.empty', { defaultValue: 'لا توجد أدوار' })}
            />
          ) : (
            <ul className="space-y-1">
              {filtered.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={
                      'w-full text-start p-2 rounded-lg transition ' +
                      (selectedId === r.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-bg')
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{r.labelAr ?? r.name}</span>
                      {r.isSystem && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {t('roles.system', { defaultValue: 'نظام' })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted mt-0.5 flex items-center gap-3">
                      <span>{r.permissionCount} {t('roles.perms', { defaultValue: 'صلاحية' })}</span>
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {r.userCount}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Right — matrix editor */}
        <section>
          {!selectedId || !detail.data || !allPerms.data ? (
            <div className="card p-8 text-center text-muted">
              {t('roles.pickRole', { defaultValue: 'اختر دورًا لعرض الصلاحيات' })}
            </div>
          ) : (
            <PermissionMatrix
              role={detail.data}
              allPerms={allPerms.data}
              onSaved={() => {
                // Editing a system role can transparently create a
                // tenant-copy with a new id — refresh both list + detail.
                qc.invalidateQueries({ queryKey: ['roles'] });
                qc.invalidateQueries({ queryKey: ['role'] });
              }}
              onDelete={() => {
                if (detail.data && confirm(t('common.confirmDelete') as string)) {
                  del.mutate(detail.data.id);
                }
              }}
              deleting={del.isPending}
            />
          )}
        </section>
      </div>

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            setShowCreate(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
//                     Matrix editor
// ============================================================
function PermissionMatrix({
  role, allPerms, onSaved, onDelete, deleting,
}: {
  role: RoleDetail;
  allPerms: PermGroup[];
  onSaved: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const [set, setSet] = useState<Set<string>>(new Set(role.permissions));

  // Sync when the selected role changes (react-query returns a fresh
  // object; we reseed local state so the checkboxes reflect it).
  useEffect(() => { setSet(new Set(role.permissions)); }, [role.id, role.permissions]);

  const totalPerms = allPerms.reduce((s, g) => s + g.items.length, 0);
  const ownerBlockSave = role.name === 'owner' && set.size < totalPerms;
  const dirty = useMemo(() => {
    const orig = new Set(role.permissions);
    if (orig.size !== set.size) return true;
    for (const c of set) if (!orig.has(c)) return true;
    return false;
  }, [role.permissions, set]);

  const toggle = (code: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };
  const toggleModule = (module: string, items: PermGroup['items']) => {
    setSet((prev) => {
      const next = new Set(prev);
      const allOn = items.every(i => next.has(i.code));
      for (const it of items) {
        if (allOn) next.delete(it.code); else next.add(it.code);
      }
      return next;
    });
  };
  const toggleAll = () => {
    setSet(set.size === totalPerms ? new Set() : new Set(allPerms.flatMap(g => g.items.map(i => i.code))));
  };

  const save = useMutation({
    mutationFn: () => api.patch(`/roles/${role.id}/permissions`, { permissions: [...set] }),
    onSuccess: onSaved,
  });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-line">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            {role.labelAr ?? role.name}
            {role.isSystem && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {t('roles.system', { defaultValue: 'نظام' })}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {set.size} / {totalPerms} {t('roles.permsSelected', { defaultValue: 'صلاحية محددة' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={toggleAll}>
            {set.size === totalPerms
              ? t('roles.deselectAll', { defaultValue: 'إلغاء الكل' })
              : t('roles.selectAll',   { defaultValue: 'تحديد الكل' })}
          </button>
          {!role.isSystem && (
            <button
              className="btn-ghost text-xs text-red-600"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className="btn-primary text-sm"
            disabled={!dirty || save.isPending || ownerBlockSave}
            onClick={() => save.mutate()}
            title={ownerBlockSave ? t('roles.ownerAllRequired', { defaultValue: 'دور المالك يجب أن يحتفظ بكل الصلاحيات' }) as string : undefined}
          >
            <Save size={14} /> {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {ownerBlockSave && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
          {t('roles.ownerAllRequired', { defaultValue: 'دور المالك يجب أن يحتفظ بكل الصلاحيات لتجنّب الإقفال خارج النظام.' })}
        </p>
      )}
      {save.error != null && <p className="text-red-600 text-sm mt-2">{errMsg(save.error)}</p>}

      <div className="mt-3 space-y-4">
        {allPerms.map(group => {
          const allOn = group.items.every(i => set.has(i.code));
          const someOn = !allOn && group.items.some(i => set.has(i.code));
          return (
            <div key={group.module}>
              <button
                onClick={() => toggleModule(group.module, group.items)}
                className="flex items-center gap-2 text-sm font-bold text-primary hover:opacity-70 mb-2"
              >
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = someOn; }}
                  readOnly
                  className="w-4 h-4"
                />
                {t(`roles.modules.${group.module}`, { defaultValue: group.module })}
                <span className="text-xs text-muted font-normal">
                  ({group.items.filter(i => set.has(i.code)).length}/{group.items.length})
                </span>
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-6">
                {group.items.map(p => (
                  <label
                    key={p.code}
                    className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-bg cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={set.has(p.code)}
                      onChange={() => toggle(p.code)}
                    />
                    <span className="flex-1">{p.labelAr ?? p.code}</span>
                    <span className="text-[10px] text-muted font-mono">{p.code}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
//                   Create-role modal
// ============================================================
function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const create = useMutation({
    mutationFn: async () => (await api.post('/roles', { name: name.trim(), labelAr: labelAr.trim() || undefined })).data,
    onSuccess: (row: any) => onCreated(row.id),
  });

  return (
    <Modal open onClose={onClose} title={t('roles.new', { defaultValue: 'دور جديد' }) as string}>
      <div className="space-y-3">
        <div>
          <label className="label">{t('roles.name', { defaultValue: 'اسم النظام (english)' })} *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. senior_mechanic" />
          <p className="text-[11px] text-muted mt-1">
            {t('roles.nameHint', { defaultValue: 'يُستخدم داخليًا. أحرف صغيرة وشرطة سفلية فقط.' })}
          </p>
        </div>
        <div>
          <label className="label">{t('roles.labelAr', { defaultValue: 'الاسم الظاهر' })}</label>
          <input className="input" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} placeholder="فني ورشة كبير" />
        </div>
        {create.error != null && <p className="text-red-600 text-sm">{errMsg(create.error)}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn-primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
