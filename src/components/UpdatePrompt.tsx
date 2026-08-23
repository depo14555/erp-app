// ================================================================
//  src/components/UpdatePrompt.tsx
//  Віджет оновлення PWA: коли задеплоєно нову версію, показує
//  плашку «Доступна нова версія» з кнопкою миттєвого оновлення.
//  Без нього registerType: 'prompt' ніколи не активує новий
//  сервіс-воркер — користувачі застрягають на старій версії.
// ================================================================

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useBusyLabels } from '../lib/busy';
import { APP_VERSION } from '../changelog';

const CHECK_INTERVAL = 15 * 60 * 1000; // перевірка нової версії кожні 15 хв

export default function UpdatePrompt() {
  const busy = useBusyLabels();
  /** «Що нового» з НОВОГО деплою: changelog.json оминає кеш воркера. */
  const [changes, setChanges] = useState<string[]>([]);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Періодична перевірка + перевірка при поверненні на вкладку
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, CHECK_INTERVAL);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          registration.update().catch(() => {});
        }
      });
    },
  });

  // Список нової версії — з її changelog.json (свіжий деплой віддає новий)
  useEffect(() => {
    if (!needRefresh) return;
    fetch('/changelog.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (j && j.version && j.version !== APP_VERSION && Array.isArray(j.changes)) {
          setChanges(j.changes.slice(0, 6));
        }
      })
      .catch(() => { /* без списку плашка все одно працює */ });
  }, [needRefresh]);

  // Esc закриває плашку
  useEffect(() => {
    if (!needRefresh) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setNeedRefresh(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [needRefresh, setNeedRefresh]);

  // Поки йде довга операція — навіть не пропонуємо оновлюватись
  if (!needRefresh || busy.length) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 px-4 py-3 flex items-center gap-3 max-w-[calc(100vw-24px)]">
        <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <RefreshCw size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 leading-tight">Доступна нова версія</p>
          {changes.length ? (
            <ul className="mt-1 space-y-0.5 max-w-[420px]">
              {changes.map(c => (
                <li key={c} className="text-[11px] text-gray-600 leading-snug flex gap-1.5">
                  <span className="text-blue-500 flex-shrink-0">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-gray-500">Оновіть, щоб отримати останні зміни</p>
          )}
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex-shrink-0 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-[12px] font-semibold hover:bg-blue-700 active:scale-95 transition-all"
        >
          Оновити
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
          aria-label="Закрити"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
