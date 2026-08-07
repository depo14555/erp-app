// ================================================================
//  src/components/Sidebar.tsx — постійна бічна навігація (десктоп),
//  як у сучасній CRM: секції з майбутнім розширенням (Виробництво /
//  Логістика / Інструменти), знизу — середовище, вихід, версія.
//  Тільки робочий функціонал — без пунктів-заглушок.
// ================================================================

import {
  LayoutDashboard, ClipboardList, Search, MessageSquare, Truck,
  Printer, LogOut, FlaskConical, RefreshCw, Inbox, Receipt,
} from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey } from '../api';

interface NavItem {
  key: AppTab;
  label: string;
  Icon: typeof LayoutDashboard;
  badge?: string;
}
interface NavSection { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Виробництво',
    items: [
      { key: 'dashboard', label: 'Огляд', Icon: LayoutDashboard },
      { key: 'mail', label: 'Вхідні (пошта)', Icon: Inbox },
      { key: 'orders', label: 'Замовлення', Icon: ClipboardList },
      { key: 'search', label: 'Пошук деталі', Icon: Search },
      { key: 'chat', label: 'Чат виконавців', Icon: MessageSquare },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { key: 'logistics', label: 'Відвантаження', Icon: Truck },
    ],
  },
];

interface Props {
  tab: AppTab;
  env: EnvKey;
  onTab: (t: AppTab) => void;
  onPrint: () => void;
  onBilling: () => void;
  onLogout: () => void;
}

export default function Sidebar({ tab, env, onTab, onPrint, onBilling, onLogout }: Props) {
  return (
    <aside className="hidden lg:flex flex-col w-[228px] flex-shrink-0 h-full bg-white border-r hairline">
      {/* Логотип */}
      <div className="flex items-center gap-2.5 px-4 h-[56px] flex-shrink-0 border-b hairline">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[14px] shadow-sm shadow-blue-600/30">
          ⚙️
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[13.5px] leading-tight tracking-tight truncate">ERP Металообробка</p>
          <p className="text-[10px] leading-tight" style={{ color: 'var(--ink-3)' }}>система керування</p>
        </div>
        {env === 'test' && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 flex-shrink-0">
            <FlaskConical size={9} /> ТЕСТ
          </span>
        )}
      </div>

      {/* Навігація */}
      <nav className="flex-1 overflow-y-auto thin-scrollbar px-2.5 py-3 space-y-4">
        {SECTIONS.map(sec => (
          <div key={sec.title}>
            <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map(({ key, label, Icon, badge }) => {
                const on = tab === key;
                return (
                  <button key={key} onClick={() => onTab(key)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press transition-colors relative"
                    style={on
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                      : { color: 'var(--ink-2)' }}>
                    {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
                    <Icon size={16.5} strokeWidth={on ? 2.4 : 2} className="flex-shrink-0" />
                    <span className={`flex-1 text-[13px] truncate ${on ? 'font-bold' : 'font-medium'}`}>{label}</span>
                    {badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-600/10 text-blue-700">{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
            Бухгалтерія
          </p>
          <button onClick={onBilling}
            className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press"
            style={{ color: 'var(--ink-2)' }}>
            <Receipt size={16.5} strokeWidth={2} className="flex-shrink-0" />
            <span className="flex-1 text-[13px] font-medium truncate">Рахунки і оплати</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-600/10 text-blue-700">NEW</span>
          </button>
        </div>

        <div>
          <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
            Інструменти
          </p>
          <button onClick={onPrint}
            className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press"
            style={{ color: 'var(--ink-2)' }}>
            <Printer size={16.5} strokeWidth={2} className="flex-shrink-0" />
            <span className="flex-1 text-[13px] font-medium truncate">Друк креслень + QR</span>
          </button>
        </div>
      </nav>

      {/* Низ */}
      <div className="flex-shrink-0 border-t hairline p-2.5">
        <div className="flex items-center gap-1">
          <button onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-red-600 hover:bg-red-50 press">
            <LogOut size={13} />
            <span className="text-[11.5px] font-bold">Вийти</span>
          </button>
          <span className="ml-auto text-[9.5px]" style={{ color: 'var(--ink-3)' }}>{__BUILD_TIME__}</span>
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
            aria-label="Оновити додаток" title="Оновити додаток">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
    </aside>
  );
}
