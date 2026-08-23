// ================================================================
//  src/components/WhatsNew.tsx — «Що нового» після оновлення.
//  Показується ОДИН раз, коли додаток уже працює на новій версії
//  (актуально для авто-оновлень, коли плашку ніхто не натискав).
//  Список живе в src/changelog.ts і коригується перед деплоєм.
// ================================================================

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { APP_VERSION, CHANGES } from '../changelog';

const SEEN_KEY = 'erp-seen-version';

export default function WhatsNew() {
  const [open, setOpen] = useState(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    // Перший запуск взагалі — нічого не показуємо, лише запам'ятовуємо
    if (!seen) { localStorage.setItem(SEEN_KEY, APP_VERSION); return false; }
    return seen !== APP_VERSION && CHANGES.length > 0;
  });

  if (!open) return null;
  const close = () => { localStorage.setItem(SEEN_KEY, APP_VERSION); setOpen(false); };

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[69] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 px-4 py-3 flex items-start gap-3 max-w-[calc(100vw-24px)] w-[440px]">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-gray-900 leading-tight">Що нового в цій версії</p>
          <ul className="mt-1 space-y-0.5">
            {CHANGES.slice(0, 6).map(c => (
              <li key={c} className="text-[11px] text-gray-600 leading-snug flex gap-1.5">
                <span className="flex-shrink-0" style={{ color: 'var(--accent)' }}>·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <button onClick={close}
            className="mt-2 px-3 py-1.5 rounded-xl text-[12px] font-bold press"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            Зрозуміло
          </button>
        </div>
        <button onClick={close} className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1" aria-label="Закрити">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
