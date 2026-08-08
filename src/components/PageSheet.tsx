// ================================================================
//  src/components/PageSheet.tsx — повноекранна панель поверх додатка.
//  Використовується для інструментів замовлень, які не мають бути
//  окремими пунктами навігації (пошук деталі, вхідна пошта).
// ================================================================

import { ReactNode } from 'react';
import { X, Minus } from 'lucide-react';

/** Кнопка «згорнути» для вікон довгих операцій — робота триває у фоні. */
export function MinimizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }}
      aria-label="Згорнути" title="Згорнути — операція не переривається, вікно повернеться знизу">
      <Minus size={18} />
    </button>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  onMinimize?: () => void;
  children: ReactNode;
}

export default function PageSheet({ title, subtitle, icon, onClose, onMinimize, children }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--bg)] animate-fade-in">
      <header className="flex-shrink-0 bg-white border-b hairline px-3 lg:px-5 pt-[max(0.5rem,env(safe-area-inset-top))] h-[56px] flex items-center gap-2.5">
        {icon && (
          <span className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[15.5px] font-bold truncate leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>}
        </div>
        {onMinimize && <MinimizeButton onClick={onMinimize} />}
        <button onClick={onClose} className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Закрити">
          <X size={20} />
        </button>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
