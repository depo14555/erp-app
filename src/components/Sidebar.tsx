// ================================================================
//  src/components/Sidebar.tsx — постійна бічна навігація (десктоп),
//  як у сучасній CRM: секції з майбутнім розширенням (Виробництво /
//  Логістика / Інструменти), знизу — середовище, вихід, версія.
//  Тільки робочий функціонал — без пунктів-заглушок.
// ================================================================

import {
  LayoutDashboard, ClipboardList, MessageSquare, Truck, Building2, UserRound,
  LogOut, RefreshCw, Receipt, Printer, Lock, FileInput, Bell, Menu,
  FolderOpen, Rocket, Paintbrush, Send, FolderTree, Calculator, ShoppingCart, Blocks, Scale,
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

/*
  Три групи замість чотирьох. Назви розділів — це підсумки («Прорахунки»,
  «Закупівлі»), а дії всередині замовлення — дієслова. Раніше «Прорахунок»
  означав і розділ, і вікно, і зону таблиці, і ніхто не міг сказати, що
  саме відкриється.
*/
const SECTIONS: NavSection[] = [
  {
    title: 'Робота',
    items: [
      { key: 'orders', label: 'Замовлення', Icon: ClipboardList },
      { key: 'chat', label: 'Чат виконавців', Icon: MessageSquare },
      { key: 'logistics', label: 'Відвантаження', Icon: Truck, locked: true },
    ],
  },
  {
    title: 'Гроші',
    items: [
      { key: 'calc', label: 'Прорахунки', Icon: Calculator },
      { key: 'billing', label: 'Рахунки клієнтам', Icon: Receipt },
      { key: 'execinv', label: 'Рахунки виконавців', Icon: FileInput },
      { key: 'purch', label: 'Закупівлі', Icon: ShoppingCart },
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

export type OrderTool = 'billing' | 'tech' | 'photo' | 'send' | 'print' | 'distr' | 'calc' | 'nest' | 'purch' | 'asm' | 'tmc';

interface Props {
  tab: AppTab;
  env: EnvKey;
  onTab: (t: AppTab) => void;
  onLocked: (label: string) => void;
  /** Відкрите замовлення — сайдбар показує його інструменти. */
  order: { label: string; folderUrl: string } | null;
  onOrderTool: (t: OrderTool) => void;
  onLogout: () => void;
  /** Оновити дані розділу і показати події — переїхали сюди з верхньої панелі. */
  onRefresh?: () => void;
  onNotifications?: () => void;
  loading?: boolean;
  /** Згорнута панель — лише значки; вибір памʼятається між сеансами. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

interface ToolItem { key: OrderTool; label: string; Icon: typeof Receipt; color: string }

/*
  Дії йдуть у порядку РОБОТИ, а не абеткою: спершу файли стають рядками
  картки, потім креслення читає ШІ, і аж потім рахунок і роздача.
  Три підписані етапи — щоб не гадати, з чого починати.
*/
const STEP_1: ToolItem[] = [
  { key: 'tech', label: 'Тех.запуск', Icon: Rocket, color: '#EA580C' },
  { key: 'photo', label: 'Фотошоп креслень', Icon: Paintbrush, color: '#DB2777' },
  { key: 'print', label: 'Друк креслень + QR', Icon: Printer, color: '#0891B2' },
];

/** Те, що читає креслення само — окремим блоком, щоб було видно, де працює ШІ. */
const AI_TOOLS: ToolItem[] = [
  { key: 'asm', label: 'Склад збірок', Icon: Blocks, color: '#7C3AED' },
  { key: 'tmc', label: 'ТМЦ і вага', Icon: Scale, color: '#1B4FD8' },
  { key: 'purch', label: 'Покупні', Icon: ShoppingCart, color: '#EA580C' },
];

const STEP_3: ToolItem[] = [
  { key: 'distr', label: 'Розподіл КД', Icon: FolderTree, color: '#7C3AED' },
  { key: 'send', label: 'Відправити виконавцю', Icon: Send, color: '#4F46E5' },
  { key: 'billing', label: 'Рахунки і оплати', Icon: Receipt, color: 'var(--green)' },
];

/**
 * Мітка AI — однакова скрізь, де функція читає креслення сама.
 * Обведений моно-чіп, як позначення на кресленні, а не наліпка.
 */
export function AiBadge({ small }: { small?: boolean } = {}) {
  return (
    <span
      className={`flex-shrink-0 font-mono font-semibold rounded ${
        small ? 'text-[8px] px-1' : 'text-[8.5px] px-1.5 py-[0.5px]'
      }`}
      style={{
        background: 'var(--blue-bg)',
        color: 'var(--blue)',
        boxShadow: 'inset 0 0 0 1px var(--blue-line)',
      }}>
      AI
    </span>
  );
}

/**
 * Підпис розділу: моно з розрядкою і лінійкою до краю — як у штампі.
 * У згорнутій панелі напису немає, лишається сама лінійка-роздільник.
 */
function SecTitle({ children, mini }: { children: React.ReactNode; mini?: boolean }) {
  if (mini) return <p className="mx-3 my-2 h-px" style={{ background: 'var(--line)' }} />;
  return (
    <p className="k-label flex items-center gap-2 px-3.5 pt-3 pb-1">
      <span className="whitespace-nowrap">{children}</span>
      <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
    </p>
  );
}

export default function Sidebar({
  tab, env, onTab, onLocked, order, onOrderTool, onLogout,
  onRefresh, onNotifications, loading, collapsed, onToggleCollapsed,
}: Props) {
  /** Спільний вигляд пункту меню: у згорнутій панелі лишається сам значок. */
  const item = 'w-full flex items-center gap-2 py-[5px] text-left press transition-colors border-l-[3px]';
  const pad = collapsed ? 'pl-[11px] pr-2 justify-center' : 'pl-[11px] pr-3';

  return (
    <aside className={`hidden lg:flex flex-col flex-shrink-0 h-full bg-white border-r hairline transition-[width] duration-150
      ${collapsed ? 'w-[52px]' : 'w-[228px]'}`}>
      {/* Клеймо системи + бургер */}
      <div className={`flex items-center h-[52px] flex-shrink-0 border-b ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3.5'}`}
        style={{ borderColor: 'var(--line)' }}>
        {!collapsed && (
          <>
            <img src="/icon-192.png" alt="" className="w-[22px] h-[22px] rounded-md flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-[13px] leading-tight whitespace-nowrap">ERP Металообробка</p>
              <p className="k-label">{env === 'test' ? 'тестова копія' : 'система керування'}</p>
            </div>
          </>
        )}
        {onToggleCollapsed && (
          <button onClick={onToggleCollapsed} className="p-1.5 rounded press hover:bg-[var(--bg)] flex-shrink-0"
            style={{ color: 'var(--ink-2)' }}
            aria-label={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}
            title={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}>
            <Menu size={17} />
          </button>
        )}
      </div>

      {/* Навігація */}
      <nav className="flex-1 overflow-y-auto thin-scrollbar pb-3">
        {SECTIONS.map(sec => (
          <div key={sec.title}>
            <SecTitle mini={collapsed}>{sec.title}</SecTitle>
            {sec.items.map(({ key, label, Icon, badge, locked }) => {
              const on = tab === key && !locked;
              return (
                <button key={key} onClick={() => (locked ? onLocked(label) : onTab(key))}
                  className={`${item} ${pad}`}
                  style={on
                    ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--ink)' }
                    : { borderColor: 'transparent', color: locked ? 'var(--ink-3)' : 'var(--ink)' }}
                  title={locked ? 'Розділ у тестуванні — скоро буде доступний' : label}>
                  <Icon size={15} strokeWidth={2} className="flex-shrink-0" style={{ color: on ? 'var(--accent)' : 'var(--ink-2)' }} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>
                      {locked && <Lock size={12} className="flex-shrink-0 opacity-70" />}
                      {badge && <span className="k-chip">{badge}</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Інструменти відкритого завдання */}
        {order && (
          <div>
            <SecTitle mini={collapsed}>{order.label} · 1. Підготувати</SecTitle>
            {STEP_1.map(({ key, label, Icon, color }) => (
              <button key={key} onClick={() => onOrderTool(key)} title={label}
                className={`${item} ${pad} border-transparent hover:bg-[var(--bg)]`}>
                <Icon size={15} strokeWidth={2} className="flex-shrink-0" style={{ color }} />
                {!collapsed && <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>}
              </button>
            ))}

            {order.folderUrl && (
              <a href={order.folderUrl} target="_blank" rel="noreferrer" title="Папка на Диску"
                className={`${item} ${pad} border-transparent hover:bg-[var(--bg)]`}
                style={{ color: 'var(--ink)' }}>
                <FolderOpen size={15} strokeWidth={2} className="flex-shrink-0" style={{ color: 'var(--amber)' }} />
                {!collapsed && <span className="flex-1 text-[12.5px] font-semibold truncate">Папка на Диску</span>}
              </a>
            )}

            {/* Функції, що читають креслення самі — окремим розділом */}
            <SecTitle mini={collapsed}>2. Прочитати креслення</SecTitle>
            {AI_TOOLS.map(({ key, label, Icon, color }) => (
              <button key={key} onClick={() => onOrderTool(key)} title={`${label} — читає креслення`}
                className={`${item} ${pad} border-transparent hover:bg-[var(--bg)] relative`}>
                <Icon size={15} strokeWidth={2} className="flex-shrink-0" style={{ color }} />
                {collapsed
                  ? <span className="absolute right-0.5 top-0.5 w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--blue)' }} />
                  : (
                    <>
                      <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>
                      <AiBadge small />
                    </>
                  )}
              </button>
            ))}

            <SecTitle mini={collapsed}>3. Порахувати й роздати</SecTitle>
            {STEP_3.map(({ key, label, Icon, color }) => (
              <button key={key} onClick={() => onOrderTool(key)} title={label}
                className={`${item} ${pad} border-transparent hover:bg-[var(--bg)]`}>
                <Icon size={15} strokeWidth={2} className="flex-shrink-0" style={{ color }} />
                {!collapsed && <span className="flex-1 text-[12.5px] font-semibold truncate">{label}</span>}
              </button>
            ))}
          </div>
        )}


      </nav>

      {/* Низ: вихід, оновлення даних, події */}
      <div className="flex-shrink-0 border-t hairline p-2">
        <div className={`flex items-center gap-0.5 ${collapsed ? 'flex-col' : ''}`}>
          <button onClick={onLogout} title="Вийти"
            className={`flex items-center gap-1.5 rounded-lg press ${collapsed ? 'p-1.5' : 'px-2 py-1.5'}`}
            style={{ color: '#C42C2C' }}>
            <LogOut size={13} />
            {!collapsed && <span className="text-[11.5px] font-bold">Вийти</span>}
          </button>
          {!collapsed && <span className="flex-1" />}
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 rounded-lg press hover:bg-[var(--bg)]"
              style={{ color: 'var(--ink-2)' }} aria-label="Оновити дані" title="Оновити дані">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {onNotifications && (
            <button onClick={onNotifications} className="p-1.5 rounded-lg press hover:bg-[var(--bg)]"
              style={{ color: 'var(--ink-2)' }} aria-label="Події" title="Події">
              <Bell size={14} />
            </button>
          )}
        </div>
        <div className={`flex items-center gap-1 mt-1 ${collapsed ? 'justify-center' : 'pl-2'}`}>
          {!collapsed && <span className="k-label">збірка {__BUILD_TIME__}</span>}
          {!collapsed && <span className="flex-1" />}
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
