// ================================================================
//  src/pages/OrdersPage.tsx
//  Список замовлень на всю ширину, як у сучасній CRM:
//  таблиця (десктоп) або сітка карток; пошук + фільтр за статусом.
// ================================================================

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus, Inbox, ScanSearch, LayoutGrid, Columns3, List } from 'lucide-react';
import OrderCard from '../components/OrderCard';
import OrdersTable from '../components/OrdersTable';
import KanbanBoard from '../components/KanbanBoard';
import { Order, statusStyle, isClosed } from '../types';

interface Props {
  orders: Order[];
  updatedAt: string;
  loading: boolean;
  onOpen: (o: Order) => void;
  onCreate: () => void;
  /** Закріплені (спільні для всіх) — projectId. */
  pinned: string[];
  onTogglePin: (projectId: string, on: boolean) => void;
  /** Інструменти замовлень: пошук деталі й вхідна пошта (панелі поверх). */
  onSearch: () => void;
  onMail: () => void;
  onToast: (msg: string, err?: boolean) => void;
  activeRow?: number;
}

export default function OrdersPage({
  orders, updatedAt, loading, onOpen, onCreate,
  pinned, onTogglePin, onSearch, onMail, onToast, activeRow,
}: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  // На широкому екрані список читають таблицею, на телефоні — картками
  const [view, setView] = useState<'kanban' | 'cards' | 'table'>(
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'table' : 'cards'
  );

  const statuses = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => { if (o.status) set.add(o.status); });
    return Array.from(set);
  }, [orders]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = orders.filter(o => {
      if (status && o.status !== status) return false;
      if (!query) return true;
      return [o.orderNum, o.client, o.projectId, o.status]
        .join(' ').toLowerCase().includes(query);
    });
    // Закріплені — завжди зверху (сортування стабільне, порядок всередині груп зберігається)
    return [...list].sort((a, b) =>
      (pinnedSet.has(b.projectId) ? 1 : 0) - (pinnedSet.has(a.projectId) ? 1 : 0));
  }, [orders, q, status, pinnedSet]);

  const active = orders.filter(o => !isClosed(o.status)).length;

  return (
    <div className="flex flex-col h-full">
      {/* Панель інструментів */}
      <div className="flex-shrink-0 px-3 lg:px-4 pt-2.5 pb-2 space-y-1.5">
        {/* Усе в один рядок: пошук тягнеться, дії й вигляд праворуч */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Пошук за номером, клієнтом, шифром…"
              className="w-full pl-8 pr-3 py-[6px] rounded-lg bg-white outline-none text-[12.5px]"
              style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}
            />
          </div>
          <p className="hidden xl:block k-label whitespace-nowrap px-1">
            активних {active}/{orders.length}{updatedAt && ` · ${updatedAt}`}
          </p>

          <button onClick={onMail}
            className="flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[12px] font-bold press bg-white whitespace-nowrap"
            style={{ boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink)' }} title="Нові замовлення з пошти">
            <Inbox size={14} /> <span className="hidden lg:inline">Пошта</span>
          </button>
          {/* Пошук деталі — на телефоні його заміняє поле пошуку поруч, тому ховаємо */}
          <button onClick={onSearch}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[12px] font-bold press bg-white whitespace-nowrap"
            style={{ boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink)' }} title="Пошук деталі по всіх замовленнях">
            <ScanSearch size={14} /> <span className="hidden lg:inline">Пошук деталі</span>
          </button>
          <button onClick={onCreate}
            className="flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[12px] font-bold text-white press whitespace-nowrap"
            style={{ background: 'var(--accent)' }}>
            <Plus size={14} /> <span className="hidden md:inline">Нове замовлення</span>
          </button>

          <div className="flex items-center rounded-lg bg-white overflow-hidden flex-shrink-0"
            style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            {/* Таблиця замовлень на телефон не влазить — там лишаються картки й дошки */}
            {([['table', 'Таблиця', List], ['cards', 'Картки', LayoutGrid], ['kanban', 'Дошки', Columns3]] as const).map(([v, label, Icon]) => {
              const on = view === v;
              return (
                <button key={v} onClick={() => setView(v)}
                  className={`items-center gap-1.5 px-2.5 py-[6px] text-[12px] font-bold transition-colors whitespace-nowrap ${v === 'table' ? 'hidden md:flex' : 'flex'}`}
                  style={on ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-2)' }}
                  title={label}>
                  <Icon size={14} strokeWidth={2} />
                  <span className="hidden xl:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {statuses.length > 0 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button onClick={() => setStatus('')} className="k-chip flex-shrink-0 press"
              style={!status ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}>
              <SlidersHorizontal size={10} className="inline mr-1 -mt-0.5" />
              Всі · {orders.length}
            </button>
            {statuses.map(s => {
              const st = statusStyle(s);
              const on = status === s;
              const n = orders.filter(o => o.status === s).length;
              return (
                <button key={s} onClick={() => setStatus(on ? '' : s)}
                  className="k-chip flex-shrink-0 press"
                  style={on
                    ? { background: st.solid, color: '#fff', borderColor: st.solid }
                    : { background: st.bg, color: st.fg, borderColor: st.fg + '44' }}>
                  {s} · {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Канбан за статусами */}
      {view === 'kanban' && (
        <div className="flex-1 min-h-0">
          <KanbanBoard
            orders={filtered}
            pinned={pinnedSet}
            onOpen={onOpen}
            onTogglePin={onTogglePin}
            onToast={onToast}
            activeRow={activeRow}
          />
        </div>
      )}

      {/* Вміст */}
      {view !== 'kanban' && (
      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        {filtered.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400 text-[13px]">
            {orders.length === 0 ? 'Замовлень поки немає' : 'Нічого не знайдено'}
          </div>
        )}


        {/* Таблиця — основний вигляд на десктопі; на телефоні завжди картки */}
        {view === 'table' && (
          <div className="hidden md:block">
            <OrdersTable orders={filtered} pinned={pinnedSet} activeRow={activeRow}
              onOpen={onOpen} onTogglePin={onTogglePin} />
          </div>
        )}

        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5
          ${view === 'table' ? 'md:hidden' : ''}`}>
          {filtered.map((o, i) => (
            <div key={o.headerRow} className={i < 5 ? `rise rise-${i + 1}` : undefined}>
              <OrderCard order={o} onOpen={() => onOpen(o)} active={o.headerRow === activeRow}
                pinned={pinnedSet.has(o.projectId)}
                onTogglePin={() => onTogglePin(o.projectId, !pinnedSet.has(o.projectId))} />
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
