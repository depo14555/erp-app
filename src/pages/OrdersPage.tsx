// ================================================================
//  src/pages/OrdersPage.tsx
//  Список замовлень на всю ширину, як у сучасній CRM:
//  таблиця (десктоп) або сітка карток; пошук + фільтр за статусом.
// ================================================================

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus, Inbox, ScanSearch } from 'lucide-react';
import OrderCard from '../components/OrderCard';
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
  const [view, setView] = useState<'kanban' | 'cards'>('kanban');

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
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Пошук за номером, клієнтом, шифром…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]"
            />
          </div>
          <p className="hidden md:block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
            Активних: <b style={{ color: 'var(--ink-2)' }}>{active}</b> з {orders.length}
            {updatedAt && ` · ${updatedAt}`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onMail}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press bg-white ring-1 ring-gray-200"
              style={{ color: 'var(--ink-2)' }} title="Нові замовлення з пошти">
              <Inbox size={14} /> <span className="hidden sm:inline">Перевірити пошту</span>
            </button>
            <button onClick={onSearch}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press bg-white ring-1 ring-gray-200"
              style={{ color: 'var(--ink-2)' }} title="Пошук деталі по всіх замовленнях">
              <ScanSearch size={14} /> <span className="hidden sm:inline">Пошук деталі</span>
            </button>
            <button onClick={onCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold text-white press"
              style={{ background: 'var(--accent)' }}>
              <Plus size={14} /> Нове замовлення
            </button>
            {/* Вигляд: канбан за статусами / таблиця / картки */}
            <div className="flex bg-gray-100 rounded-full p-0.5">
              {([['kanban', 'Канбан'], ['cards', 'Картки']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setView(v)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                  style={view === v ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {statuses.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setStatus('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                !status ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
              }`}
            >
              <SlidersHorizontal size={11} className="inline mr-1 -mt-0.5" />
              Всі · {orders.length}
            </button>
            {statuses.map(s => {
              const st = statusStyle(s);
              const on = status === s;
              const n = orders.filter(o => o.status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(on ? '' : s)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
                  style={on
                    ? { background: st.solid, color: '#fff' }
                    : { background: st.bg, color: st.fg }}
                >
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


        {/* Картки: сітка на десктопі, стовпчик на телефоні.
            На телефоні показуються завжди (таблиця лише md+). */}
        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5`}>
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
