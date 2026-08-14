// ================================================================
//  src/components/Sidebar.tsx — постійна бічна навігація (десктоп),
//  як у сучасній CRM: секції з майбутнім розширенням (Виробництво /
//  Логістика / Інструменти), знизу — середовище, вихід, версія.
//  Тільки робочий функціонал — без пунктів-заглушок.
// ================================================================

import {
  LayoutDashboard, ClipboardList, MessageSquare, Truck, Building2, UserRound,
  LogOut, RefreshCw, Receipt, Printer, Lock, Sparkles,
  FolderOpen, Rocket, Paintbrush, Send, FolderTree, Calculator, Scissors, ShoppingCart, Blocks,
} from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey } from '../api';

interface NavItem {
  key: AppTab;
  label: string;
  Icon: typeof LayoutDashboard;
  badge?: string;
  /** Розділ ще в тестуванні — заблокований замком. */
  locked?: boolean;
}
interface NavSection { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Виробництво',
    items: [
      { key: 'orders', label: 'Замовлення', Icon: ClipboardList },
      { key: 'chat', label: 'Чат виконавців', Icon: MessageSquare },
    ],
  },
  {
    title: 'Логістика',
    items: [
      { key: 'logistics', label: 'Відвантаження', Icon: Truck, locked: true },
    ],
  },
  {
    title: 'Довідники',
    items: [
      { key: 'contractors', label: 'Контрагенти', Icon: Building2 },
      { key: 'staff', label: 'Штат працівників', Icon: UserRound },
    ],
  },
];

export type OrderTool = 'billing' | 'tech' | 'photo' | 'send' | 'print' | 'distr' | 'calc' | 'nest' | 'purch' | 'asm';

interface Props {
  tab: AppTab;
  env: EnvKey;
  onTab: (t: AppTab) => void;
  onLocked: (label: string) => void;
  /** Відкрите замовлення — сайдбар показує його інструменти. */
  order: { label: string; folderUrl: string } | null;
  onOrderTool: (t: OrderTool) => void;
  onLogout: () => void;
}

interface ToolItem { key: OrderTool; label: string; Icon: typeof Receipt; color: string }

const ORDER_TOOLS: ToolItem[] = [
  { key: 'tech', label: 'Тех.запуск', Icon: Rocket, color: '#EA580C' },
  { key: 'distr', label: 'Розподіл КД', Icon: FolderTree, color: '#7C3AED' },
  { key: 'nest', label: 'Розкрій DXF', Icon: Scissors, color: '#0891B2' },
  { key: 'calc', label: 'Прорахунок', Icon: Calculator, color: '#0D9488' },
  { key: 'photo', label: 'Фотошоп креслень', Icon: Paintbrush, color: '#DB2777' },
  { key: 'send', label: 'Відправити виконавцю', Icon: Send, color: '#4F46E5' },
  { key: 'print', label: 'Друк креслень + QR', Icon: Printer, color: '#0891B2' },
  { key: 'billing', label: 'Рахунки і оплати', Icon: Receipt, color: '#059669' },
];

/** Те, що читає креслення само — окремим блоком, щоб було видно, де працює ШІ. */
const AI_TOOLS: ToolItem[] = [
  { key: 'asm', label: 'Склад збірок', Icon: Blocks, color: '#7C3AED' },
  { key: 'purch', label: 'Покупні', Icon: ShoppingCart, color: '#EA580C' },
];

/** Мітка AI — однакова скрізь, де є ШІ-дія. */
export function AiBadge({ small }: { small?: boolean } = {}) {
  return (
    <span
      className={`flex-shrink-0 font-black tracking-[0.06em] rounded-md text-white ${
        small ? 'text-[8px] px-1 py-[1px]' : 'text-[8.5px] px-1.5 py-[1.5px]'
      }`}
      style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)' }}>
      AI
    </span>
  );
}

export default function Sidebar({ tab, env, onTab, onLocked, order, onOrderTool, onLogout }: Props) {
  return (
    <aside className="hidden lg:flex flex-col w-[228px] flex-shrink-0 h-full bg-white border-r hairline">
      {/* Логотип */}
      <div className="flex items-center gap-2.5 px-4 h-[56px] flex-shrink-0 border-b hairline">
        <img src="/icon-192.png" alt="" className="w-8 h-8 rounded-xl shadow-sm shadow-blue-600/30 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[12.5px] leading-tight tracking-tight whitespace-nowrap">ERP Металообробка</p>
          <p className="text-[10px] leading-tight" style={{ color: 'var(--ink-3)' }}>
            система керування{env === 'test' ? ' · 🧪 тест' : ''}
          </p>
        </div>
      </div>

      {/* Навігація */}
      <nav className="flex-1 overflow-y-auto thin-scrollbar px-2.5 py-3 space-y-4">
        {SECTIONS.map(sec => (
          <div key={sec.title}>
            <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map(({ key, label, Icon, badge, locked }) => {
                const on = tab === key && !locked;
                return (
                  <button key={key} onClick={() => (locked ? onLocked(label) : onTab(key))}
                    className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press transition-colors relative"
                    style={on
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                      : { color: locked ? 'var(--ink-3)' : 'var(--ink-2)' }}
                    title={locked ? 'Розділ у тестуванні — скоро буде доступний' : undefined}>
                    {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
                    <Icon size={16.5} strokeWidth={on ? 2.4 : 2} className="flex-shrink-0" />
                    <span className={`flex-1 text-[13px] truncate ${on ? 'font-bold' : 'font-medium'}`}>{label}</span>
                    {locked && <Lock size={12} className="flex-shrink-0 opacity-70" />}
                    {badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-600/10 text-blue-700">{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Інструменти відкритого завдання */}
        {order && (
          <div className="rounded-2xl bg-[var(--accent-soft)]/60 p-1.5 -mx-0.5">
            <p className="px-1.5 pt-1 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
              Завдання {order.label}
            </p>
            <div className="space-y-0.5">
              {ORDER_TOOLS.map(({ key, label, Icon, color }) => (
                <button key={key} onClick={() => onOrderTool(key)}
                  className="w-full flex items-center gap-2.5 px-2 py-[6px] rounded-xl text-left press hover:bg-white/70"
                  style={{ color: 'var(--ink-2)' }}>
                  <Icon size={15} strokeWidth={2.1} className="flex-shrink-0" style={{ color }} />
                  <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>
                </button>
              ))}

              {order.folderUrl && (
                <a href={order.folderUrl} target="_blank" rel="noreferrer"
                  className="w-full flex items-center gap-2.5 px-2 py-[6px] rounded-xl text-left press hover:bg-white/70"
                  style={{ color: 'var(--ink-2)' }}>
                  <FolderOpen size={15} strokeWidth={2.1} className="flex-shrink-0 text-amber-600" />
                  <span className="flex-1 text-[12.5px] font-semibold truncate">Папка на Диску</span>
                </a>
              )}

              {/* ШІ-функції — окремо, щоб було видно, де креслення читаються самі */}
              <div className="pt-1.5 mt-1 border-t border-white/70">
                <p className="px-1.5 pb-1 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-[#7C3AED]" />
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
                    Читає креслення
                  </span>
                </p>
                {AI_TOOLS.map(({ key, label, Icon, color }) => (
                  <button key={key} onClick={() => onOrderTool(key)}
                    className="w-full flex items-center gap-2.5 px-2 py-[6px] rounded-xl text-left press hover:bg-white/70"
                    style={{ color: 'var(--ink-2)' }}>
                    <Icon size={15} strokeWidth={2.1} className="flex-shrink-0" style={{ color }} />
                    <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>
                    <AiBadge small />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
            Гроші
          </p>
          <button onClick={() => onTab('calc')}
            className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press transition-colors relative"
            style={tab === 'calc'
              ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
              : { color: 'var(--ink-2)' }}>
            {tab === 'calc' && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
            <Calculator size={16.5} strokeWidth={tab === 'calc' ? 2.4 : 2} className="flex-shrink-0" />
            <span className={`flex-1 text-[13px] truncate ${tab === 'calc' ? 'font-bold' : 'font-medium'}`}>Прорахунок</span>
          </button>
          <button onClick={() => onTab('billing')}
            className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left press transition-colors relative"
            style={tab === 'billing'
              ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
              : { color: 'var(--ink-2)' }}>
            {tab === 'billing' && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
            <Receipt size={16.5} strokeWidth={tab === 'billing' ? 2.4 : 2} className="flex-shrink-0" />
            <span className={`flex-1 text-[13px] truncate ${tab === 'billing' ? 'font-bold' : 'font-medium'}`}>Рахунки і оплати</span>
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
