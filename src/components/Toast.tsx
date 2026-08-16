// ================================================================
//  src/components/Toast.tsx — коротке повідомлення про результат дії.
//
//  Не суцільна зелена плашка на пів екрана: біле поле, тонка рамка,
//  а стан несе кольорова смуга зліва й значок. Так повідомлення
//  читається як службова відмітка, а не як святковий банер, і
//  не сперечається за увагу з даними під ним.
// ================================================================

import { useEffect } from 'react';
import { X, Check, AlertTriangle } from 'lucide-react';

interface ToastProps {
  message: string;
  isError?: boolean;
  onClose: () => void;
}

export default function Toast({ message, isError, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const tone = isError
    ? { rule: 'var(--accent)', bg: 'var(--accent-soft)', ink: '#B23A0E' }
    : { rule: 'var(--green)', bg: 'var(--green-bg)', ink: 'var(--green)' };

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-slide-up
                 flex items-center gap-2.5 pl-0 pr-1.5 py-0 rounded-lg overflow-hidden
                 bg-white shadow-lg max-w-[min(92vw,520px)]"
      style={{ boxShadow: '0 4px 6px -2px rgba(16,24,40,.06), 0 12px 16px -4px rgba(16,24,40,.10), inset 0 0 0 1px var(--line)' }}>

      {/* Смуга стану + значок */}
      <span className="flex items-center justify-center w-8 self-stretch py-2.5 flex-shrink-0"
        style={{ background: tone.bg, borderLeft: `3px solid ${tone.rule}`, color: tone.ink }}>
        {isError ? <AlertTriangle size={14} /> : <Check size={14} strokeWidth={2.6} />}
      </span>

      <span className="flex-1 py-2 text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
        {message}
      </span>

      <button onClick={onClose} className="p-1.5 rounded press flex-shrink-0 hover:bg-[var(--bg)]"
        style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
        <X size={14} />
      </button>
    </div>
  );
}
