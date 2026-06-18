import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Printer, Eye, FileText } from 'lucide-react';
import type { PrintOptions, PaperSize, Orientation } from '@/lib/print';
import { DEFAULT_OPTIONS } from '@/lib/print';

interface Props {
  open:    boolean;
  onClose: () => void;
  /**
   * Triggered when user clicks one of the action buttons.
   * `mode='print'`   → real print dialog (iframe)
   * `mode='preview'` → opens preview window so user can review & save as PDF
   */
  onAction: (options: PrintOptions, mode: 'print' | 'preview') => void;
  rowCount: number;
  title:    string;
}

export default function PrintOptionsDialog({ open, onClose, onAction, rowCount, title }: Props) {
  const [opt, setOpt] = useState<PrintOptions>(DEFAULT_OPTIONS);

  const setF = <K extends keyof PrintOptions>(k: K, v: PrintOptions[K]) =>
    setOpt((o) => ({ ...o, [k]: v }));

  const paperOptions: Array<{ value: PaperSize; label: string; hint: string }> = [
    { value: 'A4',   label: 'A4',           hint: 'مكتبي قياسي' },
    { value: 'A5',   label: 'A5',           hint: 'نصف صفحة' },
    { value: '80mm', label: 'حراري 80mm',   hint: 'إيصال POS كبير' },
    { value: '58mm', label: 'حراري 58mm',   hint: 'إيصال POS صغير' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="خيارات الطباعة" size="md">
      <p className="text-sm text-muted mb-3">
        <b>{title}</b> — <span className="font-bold">{rowCount}</span> سجل سيُطبع
      </p>

      <Section title="حجم الورق">
        <div className="grid grid-cols-2 gap-2">
          {paperOptions.map((p) => (
            <button
              key={p.value} type="button"
              onClick={() => setF('paperSize', p.value)}
              className={
                'border rounded-lg p-3 text-start transition ' +
                (opt.paperSize === p.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-line hover:bg-bg')
              }>
              <div className="font-bold text-sm">{p.label}</div>
              <div className="text-xs text-muted mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="الاتجاه">
        <div className="grid grid-cols-2 gap-2">
          {(['portrait', 'landscape'] as Orientation[]).map((o) => (
            <button
              key={o} type="button"
              onClick={() => setF('orientation', o)}
              disabled={opt.paperSize === '80mm' || opt.paperSize === '58mm'}
              className={
                'border rounded-lg py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ' +
                (opt.orientation === o ? 'border-primary bg-primary/5 font-bold' : 'border-line')
              }>
              {o === 'portrait' ? 'عمودي ▭' : 'أفقي ▬'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="عناصر الصفحة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Toggle label="إظهار الشعار"            value={opt.showLogo}       onChange={(v) => setF('showLogo', v)} />
          <Toggle label="إظهار التاريخ والوقت"     value={opt.showDate}       onChange={(v) => setF('showDate', v)} />
          <Toggle label="إظهار اسم المستخدم"        value={opt.showUser}       onChange={(v) => setF('showUser', v)} />
          <Toggle label="إظهار رقم الصفحة"          value={opt.showPageNumber} onChange={(v) => setF('showPageNumber', v)} />
          <Toggle label="حقل توقيع في النهاية"      value={opt.showSignature}  onChange={(v) => setF('showSignature', v)} />
          <Toggle label="أبيض/أسود (توفير حبر)"    value={opt.blackAndWhite}  onChange={(v) => setF('blackAndWhite', v)} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-2 border-t border-line">
        <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button
          type="button"
          className="btn-ghost border border-line"
          onClick={() => onAction(opt, 'preview')}>
          <Eye size={16} /> معاينة
        </button>
        <button
          type="button"
          className="btn-ghost border border-line"
          onClick={() => {
            // PDF = preview window where user uses browser's "Save as PDF"
            onAction(opt, 'preview');
          }}>
          <FileText size={16} /> حفظ PDF
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onAction(opt, 'print')}>
          <Printer size={16} /> طباعة الآن
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-bold text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }:
  { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox" checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}
