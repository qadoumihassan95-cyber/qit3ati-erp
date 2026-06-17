import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const w = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className={'bg-white w-full ' + w + ' rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto'}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-line sticky top-0 bg-white z-10">
          <h2 className="text-base sm:text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="إغلاق"
                  className="text-muted hover:text-ink p-1 -mr-1 rounded-lg hover:bg-bg">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
