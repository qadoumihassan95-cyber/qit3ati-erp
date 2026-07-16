/**
 * BarcodeScanner — mobile camera + USB scanner + manual entry.
 *
 * Uses the native BarcodeDetector API when available (all modern iOS
 * Safari, Android Chrome, Edge). Otherwise falls back to accepting only
 * manual entry / hardware USB scanners (which act as keyboards and don't
 * need any decode library on our side).
 *
 * Design goals:
 *   1. Never crash on unsupported browsers — degrade gracefully.
 *   2. Never leak the camera stream on unmount.
 *   3. Debounce duplicate scans (same code within 1.5s ignored).
 *   4. Sound feedback on scan for warehouse workflows.
 *   5. Continuous mode for receiving hundreds of items in a row.
 *
 * Usage:
 *   <BarcodeScanner
 *     open={scanning}
 *     onDetect={(code) => handleScan(code)}
 *     onClose={() => setScanning(false)}
 *     continuous
 *   />
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, X, Keyboard, Zap, ZapOff, RotateCw, ScanLine } from 'lucide-react';

const SUPPORTED_FORMATS = [
  'aztec', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix',
  'ean_13', 'ean_8', 'itf', 'pdf417', 'qr_code', 'upc_a', 'upc_e',
];

/** Detect native BarcodeDetector availability (varies wildly across browsers). */
function detectorSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'BarcodeDetector' in window;
}

/** Play a short "beep" via WebAudio so we don't need a bundled audio file. */
function beep(kind: 'ok' | 'error' = 'ok') {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'ok' ? 880 : 220;
    gain.gain.value = 0.05;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, kind === 'ok' ? 90 : 220);
  } catch { /* ignore */ }
  try { navigator.vibrate?.(kind === 'ok' ? 40 : 120); } catch { /* ignore */ }
}

interface Props {
  open: boolean;
  onDetect: (code: string) => void;
  onClose: () => void;
  /** When true, camera stays on after each detection for high-throughput receiving. */
  continuous?: boolean;
  /** Optional inline mode (renders in-place, no modal chrome). */
  inline?: boolean;
}

export default function BarcodeScanner({ open, onDetect, onClose, continuous = false, inline = false }: Props) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [supported] = useState(detectorSupported);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const usbBufferRef = useRef('');
  const usbTimerRef = useRef<any>(null);

  /** USB scanners emit keystrokes rapidly followed by Enter. Capture globally. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept while user is typing in an input other than the manual box
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (el.getAttribute('data-scanner-manual') !== 'true') return;
      }
      if (e.key === 'Enter') {
        const code = usbBufferRef.current.trim();
        usbBufferRef.current = '';
        if (code.length >= 4) {
          e.preventDefault();
          fire(code);
        }
        return;
      }
      // Only capture printable keys likely from a scanner (short burst timing)
      if (e.key.length === 1) {
        usbBufferRef.current += e.key;
        if (usbTimerRef.current) clearTimeout(usbTimerRef.current);
        usbTimerRef.current = setTimeout(() => { usbBufferRef.current = ''; }, 200);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Camera lifecycle */
  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let cancelled = false;

    (async () => {
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('كاميرا الجهاز غير مدعومة — استخدم الإدخال اليدوي.');
          setMode('manual');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* Safari sometimes rejects — ignored */ });
        }
        if (supported) {
          detectorRef.current = new (window as any).BarcodeDetector({ formats: SUPPORTED_FORMATS });
          loop();
        } else {
          setError('BarcodeDetector غير مدعوم في هذا المتصفّح — الكاميرا تظهر لكن الاستكشاف يعتمد على قارئ USB أو الإدخال اليدوي.');
        }
      } catch (e: any) {
        const name = e?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('تم رفض إذن الكاميرا. اسمح للكاميرا من إعدادات المتصفّح.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('لا توجد كاميرا متاحة.');
        } else {
          setError('خطأ في فتح الكاميرا: ' + (e?.message ?? name));
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, facing, supported]);

  /** Torch (only on cameras that expose it — mostly Android Chrome rear camera). */
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0] as any;
    if (!track?.getCapabilities || !track.getCapabilities().torch) return;
    track.applyConstraints({ advanced: [{ torch }] }).catch(() => { /* silent */ });
  }, [torch]);

  function loop() {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (!detector || !video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    detector.detect(video).then((codes: any[]) => {
      if (codes && codes.length > 0) {
        const raw = codes[0].rawValue as string;
        if (raw) fire(raw);
      }
    }).catch(() => { /* transient decode error, keep scanning */ });
    rafRef.current = requestAnimationFrame(loop);
  }

  function fire(code: string) {
    const now = Date.now();
    // Debounce: same code within 1.5s counts as a duplicate scan
    if (code === lastCode && now - lastAt < 1500) return;
    setLastCode(code);
    setLastAt(now);
    beep('ok');
    onDetect(code);
    if (!continuous) onClose();
  }

  const scanner = (
    <>
      {mode === 'camera' ? (
        <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline muted autoPlay
          />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 max-w-[70%] h-40 border-4 border-white/80 rounded-lg relative">
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500 animate-pulse" />
            </div>
          </div>
          {/* Overlay hint */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-white text-xs">
            <span className="bg-black/60 px-2 py-1 rounded">
              {supported ? 'وجّه الكاميرا نحو الباركود' : 'استعمل قارئ USB أو الإدخال اليدوي'}
            </span>
            {lastCode && (
              <span className="bg-green-600 px-2 py-1 rounded font-mono">✓ {lastCode.slice(0, 20)}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <ScanLine size={48} className="mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted mb-4">أدخل الباركود يدوياً أو استعمل قارئ USB (يعمل كلوحة مفاتيح).</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = manualInput.trim();
              if (v.length >= 4) { fire(v); setManualInput(''); }
            }}
            className="flex gap-2 max-w-md mx-auto"
          >
            <input
              className="input flex-1 font-mono"
              placeholder="ادخل الباركود..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              autoFocus
              data-scanner-manual="true"
            />
            <button type="submit" className="btn-primary">بحث</button>
          </form>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setMode(mode === 'camera' ? 'manual' : 'camera')}
            className="btn-ghost text-xs"
            type="button"
          >
            {mode === 'camera' ? <><Keyboard size={14} /> إدخال يدوي</> : <><Camera size={14} /> كاميرا</>}
          </button>
          {mode === 'camera' && (
            <>
              <button
                onClick={() => setFacing((f) => f === 'environment' ? 'user' : 'environment')}
                className="btn-ghost text-xs" type="button"
                title="تبديل الكاميرا"
              >
                <RotateCw size={14} />
              </button>
              <button
                onClick={() => setTorch((v) => !v)}
                className="btn-ghost text-xs" type="button"
                title="الفلاش"
              >
                {torch ? <ZapOff size={14} /> : <Zap size={14} />}
              </button>
            </>
          )}
        </div>
        {!inline && (
          <button onClick={onClose} className="btn-primary bg-red-600 hover:bg-red-700 text-xs" type="button">
            <X size={14} /> إغلاق
          </button>
        )}
      </div>
    </>
  );

  if (!open) return null;
  if (inline) return <div>{scanner}</div>;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
         onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-lg">مسح الباركود / Scan barcode</h3>
          <button onClick={onClose} className="text-muted hover:text-red-500 p-1">
            <X size={20} />
          </button>
        </div>
        {scanner}
        {continuous && (
          <p className="text-[11px] text-muted mt-2 text-center">
            💡 وضع الاستلام المتواصل — الكاميرا تبقى نشطة بعد كل مسح.
          </p>
        )}
      </div>
    </div>
  );
}
