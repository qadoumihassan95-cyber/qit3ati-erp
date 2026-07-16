/**
 * Barcode-driven purchase receiving (/parts/receive).
 *
 * Workflow:
 *   1. Operator picks branch + supplier + optional invoice #.
 *   2. Presses "Start scanning" — camera opens in continuous mode.
 *   3. Every scan hits GET /parts/by-barcode/:code.
 *      - Match: line added (or quantity incremented if already in list).
 *      - No match: prompt "Create new product?" prefilling the barcode.
 *   4. Operator can edit quantity or unit cost inline, remove lines.
 *   5. "Save receipt" posts everything as ONE purchase invoice — atomic.
 *      Stock is bumped, FIFO layers are created, supplier balance updated
 *      (all handled by the existing PurchasesService we already ship).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanLine, Plus, Trash2, Save, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtMoney, errMsg } from '@/lib/format';
import BarcodeScanner from '@/lib/BarcodeScanner';
import { useAuth } from '@/hooks/useAuth';

interface Branch { id: string; name: string; isMain: boolean; }
interface Supplier { id: string; name: string; }
interface ScannedLine {
  key: string;                // unique ui key (partId or "new:<barcode>")
  partId?: string;
  barcode: string;
  name: string;
  sku: string;
  qty: number;
  unitCost: number;
  currentStock?: number;
  isNew: boolean;
}

export default function BarcodeReceivingPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const activeBranch = useAuth((s) => s.branchId);

  const [branchId, setBranchId] = useState<string>(activeBranch ?? '');
  const [supplierId, setSupplierId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [lines, setLines] = useState<ScannedLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' } | null>(null);

  const branches = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
  });
  const suppliers = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const totals = useMemo(() => {
    const units = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
    const value = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitCost || 0), 0);
    return { units, value };
  }, [lines]);

  const flashOk  = (msg: string) => { setFlash({ msg, kind: 'ok'   }); setTimeout(() => setFlash(null), 2000); };
  const flashWarn = (msg: string) => { setFlash({ msg, kind: 'warn' }); setTimeout(() => setFlash(null), 3000); };
  const flashErr = (msg: string) => { setFlash({ msg, kind: 'err'  }); setTimeout(() => setFlash(null), 4000); };

  async function onScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Already in the cart? bump qty
    const existing = lines.find((l) => l.barcode.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setLines((rows) => rows.map((r) => r.key === existing.key ? { ...r, qty: Number(r.qty) + 1 } : r));
      flashOk(`+1 ${existing.name}`);
      return;
    }

    // Look up the barcode
    try {
      const { data: part } = await api.get(`/parts/by-barcode/${encodeURIComponent(trimmed)}`);
      const branchStock = branchId
        ? (part.stocks ?? []).find((s: any) => s.branch?.id === branchId)?.quantity
        : (part.stocks ?? []).reduce((sum: number, s: any) => sum + Number(s.quantity ?? 0), 0);
      setLines((rows) => [
        {
          key: part.id,
          partId: part.id,
          barcode: trimmed,
          name: part.name,
          sku: part.sku,
          qty: 1,
          unitCost: Number(part.costPrice ?? part.avgCost ?? 0) || 0,
          currentStock: Number(branchStock ?? 0),
          isNew: false,
        },
        ...rows,
      ]);
      flashOk(`+ ${part.name}`);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        // Unknown barcode — add a placeholder line the operator can fill in
        setLines((rows) => [
          {
            key: 'new:' + trimmed,
            barcode: trimmed,
            name: '(منتج جديد)',
            sku: '',
            qty: 1,
            unitCost: 0,
            isNew: true,
          },
          ...rows,
        ]);
        flashWarn(`باركود غير معروف — أضف اسم وسعر لهذا الصنف قبل الحفظ (${trimmed})`);
      } else {
        flashErr('خطأ في البحث: ' + errMsg(e));
      }
    }
  }

  function updateLine(key: string, patch: Partial<ScannedLine>) {
    setLines((rows) => rows.map((r) => r.key === key ? { ...r, ...patch } : r));
  }
  function removeLine(key: string) {
    setLines((rows) => rows.filter((r) => r.key !== key));
  }

  const savePurchase = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('اختر الفرع أوّلاً');
      if (lines.length === 0) throw new Error('لا توجد أصناف للحفظ');
      const newProducts = lines.filter((l) => l.isNew && (!l.name || l.name === '(منتج جديد)' || !l.sku));
      if (newProducts.length > 0) {
        throw new Error(`أدخل اسم + SKU لكل منتج جديد (${newProducts.length} صف)`);
      }

      // Step 1: create any new products (one by one to keep barcode uniqueness clean)
      for (const line of lines.filter((l) => l.isNew)) {
        const { data: newPart } = await api.post('/parts', {
          sku: line.sku,
          name: line.name,
          barcode: line.barcode,
          retailPrice: line.unitCost * 1.3, // 30% default markup — operator can edit later
          costPrice: line.unitCost,
        });
        line.partId = newPart.id;
        line.isNew = false;
      }

      // Step 2: post the purchase invoice with all lines
      const items = lines.map((l) => ({
        partId: l.partId!,
        qty: Number(l.qty),
        unitCost: Number(l.unitCost),
      }));
      const payload = {
        branchId,
        supplierId: supplierId || undefined,
        invoiceNo: invoiceNo || undefined,
        paymentType: 'credit' as const,
        items,
      };
      return (await api.post('/purchases', payload)).data;
    },
    onSuccess: (inv) => {
      flashOk(`✅ تم استلام الشحنة (فاتورة ${inv.invoiceNo ?? '—'})`);
      setLines([]);
      setInvoiceNo('');
      qc.invalidateQueries();
      setTimeout(() => nav('/purchases'), 1500);
    },
    onError: (e: any) => flashErr(errMsg(e)),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-blue-700 text-white rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <ScanLine size={28} />
          <h1 className="text-xl sm:text-2xl font-extrabold">استلام بضاعة عبر الباركود</h1>
        </div>
        <p className="text-white/85 text-sm">
          حدّد الفرع والمورد، ثم اضغط "بدء المسح" وامسح كل قطعة. عند الانتهاء اضغط "حفظ الاستلام"
          — النظام يُنشئ فاتورة شراء واحدة تحدّث المخزون + الطبقات (FIFO) + رصيد المورد.
        </p>
      </div>

      {/* Header form */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold text-muted block mb-1">الفرع *</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">— اختر —</option>
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.isMain ? ' ⭐' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-muted block mb-1">المورد</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— بدون مورد —</option>
            {(suppliers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-muted block mb-1">رقم فاتورة المورد</label>
          <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="اختياري" />
        </div>
      </div>

      {/* Scan trigger + totals bar */}
      <div className="card flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => { if (!branchId) { flashErr('اختر الفرع أوّلاً'); return; } setScanning(true); }}
          className="btn-primary text-sm sm:text-base"
        >
          <ScanLine size={18} /> بدء المسح المتواصل
        </button>
        <div className="text-sm">
          <span className="text-muted">الأصناف:</span> <b>{lines.length}</b>
          <span className="mx-2 text-muted">•</span>
          <span className="text-muted">الوحدات:</span> <b>{totals.units}</b>
          <span className="mx-2 text-muted">•</span>
          <span className="text-muted">القيمة:</span> <b>{fmtMoney(totals.value)}</b>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={
          'card flex items-center gap-2 text-sm ' +
          (flash.kind === 'ok'   ? 'bg-green-50 border-green-200 text-green-800' :
           flash.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                                   'bg-red-50 border-red-200 text-red-800')
        }>
          {flash.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {flash.msg}
        </div>
      )}

      {/* Lines */}
      <div className="card">
        {lines.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <ScanLine size={32} className="mx-auto mb-2 opacity-50" />
            لم يتم مسح أي صنف بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="p-2">الصنف</th>
                  <th className="p-2">الباركود</th>
                  <th className="p-2 w-24">الكمية</th>
                  <th className="p-2 w-32">التكلفة</th>
                  <th className="p-2 w-28">الإجمالي</th>
                  <th className="p-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className={l.isNew ? 'bg-amber-50 border-b border-line' : 'border-b border-line'}>
                    <td className="p-2">
                      {l.isNew ? (
                        <div className="space-y-1">
                          <input
                            className="input text-xs"
                            placeholder="اسم الصنف الجديد *"
                            value={l.name === '(منتج جديد)' ? '' : l.name}
                            onChange={(e) => updateLine(l.key, { name: e.target.value })}
                          />
                          <input
                            className="input text-xs"
                            placeholder="SKU *"
                            value={l.sku}
                            onChange={(e) => updateLine(l.key, { sku: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-bold">{l.name}</div>
                          <div className="text-xs text-muted">{l.sku}</div>
                          {l.currentStock != null && (
                            <div className="text-[10px] text-muted">حالياً في الفرع: {l.currentStock}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">{l.barcode}</td>
                    <td className="p-2">
                      <input
                        type="number" min="0" step="1"
                        className="input text-center"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number" min="0" step="0.001"
                        className="input text-center"
                        value={l.unitCost}
                        onChange={(e) => updateLine(l.key, { unitCost: Number(e.target.value) })}
                      />
                    </td>
                    <td className="p-2 font-bold">{fmtMoney(Number(l.qty) * Number(l.unitCost))}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => removeLine(l.key)}
                        className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                      ><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-extrabold">
                  <td className="p-2" colSpan={4}>الإجمالي</td>
                  <td className="p-2">{fmtMoney(totals.value)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Save bar */}
      {lines.length > 0 && (
        <div className="card flex items-center justify-between gap-3 sticky bottom-2">
          <div className="text-sm">
            <div className="text-muted text-xs">جاهز للحفظ</div>
            <div className="font-extrabold">{totals.units} وحدة — {fmtMoney(totals.value)}</div>
          </div>
          <button
            onClick={() => savePurchase.mutate()}
            disabled={savePurchase.isPending}
            className="btn-primary"
          >
            <Save size={16} /> {savePurchase.isPending ? 'جاري الحفظ...' : 'حفظ الاستلام'}
          </button>
        </div>
      )}

      {/* Scanner modal */}
      <BarcodeScanner
        open={scanning}
        continuous
        onDetect={onScan}
        onClose={() => setScanning(false)}
      />
    </div>
  );
}
