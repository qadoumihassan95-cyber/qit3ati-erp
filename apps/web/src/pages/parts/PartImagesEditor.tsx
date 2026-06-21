/**
 * PartImagesEditor
 * ─────────────────────────────────────────────────────────────────
 * Drop-in editor for a part's image gallery.
 * • upload from camera (mobile) or file picker (desktop)
 * • client-side compression to JPEG ≤ 1280×1280 @ 0.85
 *   (data URL stored in DB — no extra storage service needed)
 * • shows existing images with primary star / delete buttons
 * • emits onChange() so the parent can invalidate caches
 *
 * Usage:
 *   <PartImagesEditor partId={p.id} onChange={refetch} />
 *
 * The editor only mounts when the part already exists (we need a partId).
 * For brand-new parts, the parent should hide the section until after
 * the first save.
 */
import { useEffect, useRef, useState } from 'react';
import { Trash2, Star, Upload, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';

interface PartImage { id: string; url: string; isPrimary: boolean }

interface Props {
  partId: string | null;       // null = part not yet created (hide editor)
  onChange?: () => void;       // called after upload / delete / set-primary
}

const MAX_W = 1280;
const MAX_H = 1280;
const QUALITY = 0.85;

/** Resize + recompress an image File to a JPEG data URL. */
async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف ليس صورة');
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    el.src = url;
  });

  let { width, height } = img;
  const ratio = Math.min(MAX_W / width, MAX_H / height, 1);
  width  = Math.round(width  * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('لا يمكن تجهيز الصورة');
  // white background — keeps JPEG file size predictable for PNGs with transparency
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', QUALITY);
}

export default function PartImagesEditor({ partId, onChange }: Props) {
  const [images, setImages] = useState<PartImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    if (!partId) { setImages([]); return; }
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/parts/${partId}/images`);
      setImages(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [partId]);

  const upload = async (files: FileList | null) => {
    if (!partId || !files || files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      for (const f of Array.from(files)) {
        try {
          const dataUrl = await fileToCompressedDataUrl(f);
          await api.post(`/parts/${partId}/images`, { url: dataUrl });
        } catch (e: any) {
          setErr(`فشل رفع ${f.name}: ${errMsg(e)}`);
        }
      }
      await refresh();
      onChange?.();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setPrimary = async (imageId: string) => {
    if (!partId) return;
    setBusy(true); setErr(null);
    try {
      await api.put(`/parts/${partId}/images/${imageId}/primary`);
      await refresh();
      onChange?.();
    } catch (e: any) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId: string) => {
    if (!partId) return;
    if (!confirm('حذف الصورة؟')) return;
    setBusy(true); setErr(null);
    try {
      await api.delete(`/parts/${partId}/images/${imageId}`);
      await refresh();
      onChange?.();
    } catch (e: any) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!partId) {
    return (
      <div className="text-muted text-sm bg-bg/60 rounded-lg p-3 text-center">
        احفظ الصنف أولاً ثم ارفع الصور.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {err && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => upload(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-primary"
          disabled={busy}
        >
          <Upload size={16} />
          {busy ? 'جاري الرفع...' : 'رفع صورة'}
        </button>
        <span className="text-xs text-muted">
          JPG / PNG / WEBP — سيتم تصغيرها تلقائياً إلى 1280×1280
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square bg-bg animate-pulse rounded-lg" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="border-2 border-dashed border-line rounded-lg p-6 text-center text-muted text-sm flex flex-col items-center gap-2">
          <ImageIcon size={28} className="opacity-50" />
          <span>لا توجد صور حتى الآن</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {images.map((img) => (
            <div key={img.id} className={'relative group rounded-lg overflow-hidden border ' + (img.isPrimary ? 'border-amber-500 ring-2 ring-amber-300' : 'border-line')}>
              <div className="aspect-square bg-bg">
                <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              {img.isPrimary && (
                <span className="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                  <Star size={10} className="fill-current" /> أساسية
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-around p-1">
                {!img.isPrimary && (
                  <button
                    type="button"
                    onClick={() => setPrimary(img.id)}
                    className="p-1 hover:text-amber-300 text-xs"
                    title="جعلها أساسية"
                    disabled={busy}
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  className="p-1 hover:text-red-300 text-xs"
                  title="حذف"
                  disabled={busy}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
