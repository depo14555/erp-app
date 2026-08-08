// ================================================================
//  src/components/SideMenu.tsx — мобільне меню (гамбургер).
//  Тільки робочий функціонал додатка — без пунктів-заглушок:
//  розділи + інструменти, знизу вихід/версія/оновлення.
// ================================================================

import { X, ChevronRight, LogOut, FlaskConical, RefreshCw } from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey } from '../api';

interface MenuItem {
  icon: string;
  label: string;
  sub?: string;
  tab?: AppTab;
  hint?: string;
}
interface MenuGroup { title: string; items: MenuItem[] }

const GROUPS: MenuGroup[] = [
  {
    title: 'Виробництво',
    items: [
      { icon: '📊', label: 'Огляд', sub: 'зведення по замовленнях', tab: 'dashboard' },
      { icon: '📨', label: 'Вхідні (пошта)', sub: 'нові замовлення з Gmail', tab: 'mail' },
      { icon: '📋', label: 'Замовлення', sub: 'картки і таблиця позицій', tab: 'orders' },
      { icon: '🔍', label: 'Пошук деталі', sub: 'по всіх замовленнях', tab: 'search' },
      { icon: '💬', label: 'Чат виконавців', tab: 'chat' },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { icon: '🚚', label: 'Відвантаження', sub: 'забрати від виконавців · відвезти клієнту', tab: 'logistics' },
    ],
  },
  {
    title: 'Бухгалтерія',
    items: [
      { icon: '🧾', label: 'Рахунки і оплати', sub: 'виставлено · оплачено · треба виставити',
        tab: 'billing' },
    ],
  },
  {
    title: 'Інструменти',
    items: [
      { icon: '🖨️', label: 'Друк креслень + QR', sub: 'пакет PDF з QR-кодами для цеху',
        tab: 'orders', hint: 'Відкрийте замовлення → 🖨️ у шапці' },
    ],
  },
];

interface Props {
  env: EnvKey;
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  onLogout: () => void;
  onToast?: (msg: string) => void;
}

export default function SideMenu({ env, onClose, onNavigate, onLogout, onToast }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <aside className="relative w-[86%] max-w-[330px] h-full flex flex-col shadow-2xl animate-slide-in-left bg-[var(--bg)]">
        {/* Шапка */}
        <div className="flex-shrink-0 bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b hairline flex items-center gap-2.5">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-2xl shadow-md shadow-blue-600/25 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15.5px] leading-tight tracking-tight">ERP Металообробка</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>система керування</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl press hover:bg-gray-50" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={19} />
          </button>
        </div>

        {/* Пункти */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5">
          {GROUPS.map(group => (
            <div key={group.title}>
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
                {group.title}
              </p>
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/60 overflow-hidden divide-y divide-gray-50">
                {group.items.map(item => (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (item.tab) onNavigate(item.tab);
                      if (item.hint) onToast?.(item.hint);
                    }}
                    className="w-full flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 text-left press hover:bg-gray-50/80 active:bg-gray-100"
                  >
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] flex-shrink-0 bg-[var(--accent-soft)]">
                      {item.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold text-gray-800 truncate">{item.label}</span>
                      {item.sub && (
                        <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>{item.sub}</span>
                      )}
                    </span>
                    <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Низ */}
        <div className="flex-shrink-0 bg-white border-t hairline p-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-1">
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 press"
            >
              <LogOut size={14} />
              <span className="text-[12px] font-bold">Вийти</span>
            </button>
            {env === 'test' && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                <FlaskConical size={10} /> ТЕСТ
              </span>
            )}
            <span className="ml-auto text-[10px]" style={{ color: 'var(--ink-3)' }}>Версія від {__BUILD_TIME__}</span>
            <button
              onClick={async () => {
                try {
                  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
                  await Promise.all(regs.map(r => r.unregister()));
                  const keys = await caches?.keys?.() ?? [];
                  await Promise.all(keys.map(k => caches.delete(k)));
                } catch { /* не критично */ }
                location.reload();
              }}
              className="p-1.5 rounded-lg press hover:bg-gray-50"
              style={{ color: 'var(--ink-3)' }}
              aria-label="Оновити додаток" title="Оновити додаток"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
