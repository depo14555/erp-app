// ================================================================
//  src/components/NavRail.tsx
//  Навігація: нижня панель на телефоні, бічна рейка на десктопі.
//  Мінімалізм — тільки іконка + підпис, активний стан м'якою плашкою.
// ================================================================

import { ClipboardList, MessageSquare, Menu, Truck, Receipt, Calculator } from 'lucide-react';
import { AppTab } from '../types';

export const TABS = [
  { key: 'orders' as AppTab, label: 'Замовлення', Icon: ClipboardList },
  { key: 'calc' as AppTab, label: 'Прорахунок', Icon: Calculator },
  { key: 'logistics' as AppTab, label: 'Логістика', Icon: Truck },
  { key: 'billing' as AppTab, label: 'Рахунки', Icon: Receipt },
  { key: 'chat' as AppTab, label: 'Чат', Icon: MessageSquare },
];

interface Props {
  tab: AppTab;
  onTab: (t: AppTab) => void;
  onMenu: () => void;
  desktop?: boolean;
}

export default function NavRail({ tab, onTab, onMenu, desktop }: Props) {
  if (desktop) {
    return (
      <nav className="hidden lg:flex flex-col items-center w-[76px] flex-shrink-0 border-r hairline bg-white py-3 gap-1">
        <button onClick={onMenu}
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-gray-500 hover:bg-gray-50 press mb-1"
          aria-label="Меню">
          <Menu size={20} />
        </button>
        {TABS.map(({ key, label, Icon }) => {
          const on = tab === key;
          return (
            <button key={key} onClick={() => onTab(key)}
              className="w-[60px] py-2 rounded-2xl flex flex-col items-center gap-1 press"
              style={on ? { background: 'var(--accent-soft)' } : undefined}>
              <Icon size={20} strokeWidth={on ? 2.4 : 1.9}
                style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />
              <span className="text-[10px] font-semibold"
                style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }}>{label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="lg:hidden flex-shrink-0 bg-white/90 backdrop-blur-xl border-t hairline flex px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {TABS.map(({ key, label, Icon }) => {
        const on = tab === key;
        return (
          <button key={key} onClick={() => onTab(key)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl press"
            style={on ? { background: 'var(--accent-soft)' } : undefined}>
            <Icon size={19} strokeWidth={on ? 2.4 : 1.9}
              style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />
            <span className="text-[10px] font-semibold"
              style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
