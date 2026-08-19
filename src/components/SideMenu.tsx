// ================================================================
//  src/components/SideMenu.tsx — мобільне меню (гамбургер).
//
//  Та сама мова, що й у бічній панелі на ПК: моно-підписи розділів
//  із лінійкою до краю, активний пункт позначений смужкою зліва,
//  жодних емодзі-плиток. Тільки робочий функціонал — без заглушок.
// ================================================================

import {
  X, LogOut, FlaskConical, RefreshCw, Lock,
  ClipboardList, MessageSquare, Truck, Building2, UserRound, Calculator,
  Receipt, FileInput, ShoppingCart,
} from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey } from '../api';

interface MenuItem {
  Icon: typeof ClipboardList;
  label: string;
  tab?: AppTab;
  locked?: boolean;
}
interface MenuGroup { title: string; items: MenuItem[] }

const GROUPS: MenuGroup[] = [
  {
    title: 'Робота',
    items: [
      { Icon: ClipboardList, label: 'Замовлення', tab: 'orders' },
      { Icon: MessageSquare, label: 'Чат виконавців', tab: 'chat' },
      { Icon: Truck, label: 'Відвантаження', tab: 'logistics', locked: true },
    ],
  },
  {
    title: 'Гроші',
    items: [
      { Icon: Calculator, label: 'Прорахунки', tab: 'calc' },
      { Icon: Receipt, label: 'Рахунки клієнтам', tab: 'billing' },
      { Icon: FileInput, label: 'Рахунки виконавців', tab: 'execinv' },
      { Icon: ShoppingCart, label: 'Закупівлі', tab: 'purch' },
    ],
  },
  {
    title: 'Довідники',
    items: [
      { Icon: Building2, label: 'Контрагенти', tab: 'contractors' },
      { Icon: UserRound, label: 'Штат працівників', tab: 'staff' },
    ],
  },
];

interface Props {
  env: EnvKey;
  tab?: AppTab;
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  onLocked: (label: string) => void;
  onLogout: () => void;
  onToast?: (msg: string) => void;
}

/** Підпис розділу — моно з розрядкою і лінійкою, як у штампі. */
function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="k-label flex items-center gap-2 px-3.5 pt-3.5 pb-1.5">
      <span className="whitespace-nowrap">{children}</span>
      <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
    </p>
  );
}

export default function SideMenu({ env, tab, onClose, onNavigate, onLocked, onLogout }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      <aside className="relative w-[86%] max-w-[300px] h-full flex flex-col shadow-2xl animate-slide-in-left bg-white">
        {/* Клеймо системи */}
        <div className="flex-shrink-0 px-3.5 pt-[max(0.9rem,env(safe-area-inset-top))] pb-2.5 border-b flex items-center gap-2.5"
          style={{ borderColor: 'var(--line)' }}>
          <img src="/icon-192.png" alt="" className="w-[26px] h-[26px] rounded-md flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-[13.5px] leading-tight">ERP Металообробка</p>
            <p className="k-label">{env === 'test' ? 'тестова копія' : 'система керування'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        {/* Розділи */}
        <div className="flex-1 overflow-y-auto pb-3">
          {GROUPS.map(group => (
            <div key={group.title}>
              <SecTitle>{group.title}</SecTitle>
              {group.items.map(({ Icon, label, tab: t, locked }) => {
                const on = !!t && tab === t && !locked;
                return (
                  <button key={label}
                    onClick={() => {
                      if (locked) { onLocked(label); return; }
                      if (t) onNavigate(t);
                    }}
                    className="w-full flex items-center gap-2.5 pl-[11px] pr-3 py-2 text-left press border-l-[3px] active:bg-[var(--bg)]"
                    style={on
                      ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                      : { borderColor: 'transparent' }}>
                    <Icon size={16} strokeWidth={2} className="flex-shrink-0"
                      style={{ color: on ? 'var(--accent)' : locked ? 'var(--ink-3)' : 'var(--ink-2)' }} />
                    <span className="flex-1 text-[13px] font-semibold truncate"
                      style={{ color: locked ? 'var(--ink-3)' : 'var(--ink)' }}>
                      {label}
                    </span>
                    {locked && <Lock size={13} className="flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Низ */}
        <div className="flex-shrink-0 border-t p-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
          style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-1">
            <button onClick={onLogout}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg press" style={{ color: '#C42C2C' }}>
              <LogOut size={14} />
              <span className="text-[12px] font-bold">Вийти</span>
            </button>
            {env === 'test' && (
              <span className="k-chip" style={{ color: 'var(--amber)', borderColor: 'var(--amber-line)', background: 'var(--amber-bg)' }}>
                <FlaskConical size={10} className="inline -mt-0.5 mr-0.5" /> тест
              </span>
            )}
            <span className="flex-1" />
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
              className="p-1.5 rounded press" style={{ color: 'var(--ink-2)' }}
              aria-label="Оновити додаток" title="Оновити додаток">
              <RefreshCw size={14} />
            </button>
          </div>
          <p className="k-label pl-2 mt-1">збірка {__BUILD_TIME__}</p>
        </div>
      </aside>
    </div>
  );
}
