// ================================================================
//  src/pages/OrdersPage.tsx
//  Список замовлень на всю ширину, як у сучасній CRM:
//  таблиця (десктоп) або сітка карток; пошук + фільтр за статусом.
// ================================================================

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Clock, Plus, Pin, Inbox, ScanSearch } from 'lucide-react';
import OrderCard from '../components/OrderCard';
import { Order, statusStyle, isClosed } from '../types';

interface Props {
  orders: Order[];
  updatedAt: string;
  loading: boolean;
  onRefresh: () => void;
  onOpen: (o: Order) => void;
  onCreate: () => void;
  /** Закріплені (спільні для всіх) — projectId. */
  pinned: string[];
  onTogglePin: (projectId: string, on: boolean) => void;
  /** Інструменти замовлень: пошук деталі й вхідна пошта (панелі поверх). */
  onSearch: () => void;
  onMail: () => void;
  activeRow?: number;
}

export default function OrdersPage({
  orders, updatedAt, loading, onRefresh, onOpen, onCreate,
  pinned, onTogglePin, onSearch, onMail, activeRow,
}: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'table' | 'cards'>(
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'table' : 'cards'
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
            {/* Перемикач вигляду (оновлення — однією кнопкою в шапці додатка) */}
            <div className="hidden md:flex bg-gray-100 rounded-full p-0.5">
              {(['table', 'cards'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                  style={view === v ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}>
                  {v === 'table' ? 'Таблиця' : 'Картки'}
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

      {/* Вміст */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        {filtered.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400 text-[13px]">
            {orders.length === 0 ? 'Замовлень поки немає' : 'Нічого не знайдено'}
          </div>
        )}

        {/* Таблиця (широкі екрани) */}
        {view === 'table' && filtered.length > 0 && (
          <div className="hidden md:block bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#FAFBFC]">
                  {['Замовлення', 'Клієнт', 'Статус', 'Готовність', 'Позицій', 'Запуск', 'Термін'].map(h => (
                    <th key={h} className="text-left font-semibold text-[10.5px] uppercase tracking-wide text-[var(--ink-3)] px-4 py-2.5 border-b hairline whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const st = statusStyle(o.status);
                  const pct = o.total > 0 ? Math.round((100 * o.done) / o.total) : 0;
                  const on = o.headerRow === activeRow;
                  const isPinned = pinnedSet.has(o.projectId);
                  return (
                    <tr key={o.headerRow} onClick={() => onOpen(o)}
                      className="border-b hairline last:border-b-0 cursor-pointer hover:bg-[#FAFBFF] transition-colors group"
                      style={on ? { background: 'var(--accent-soft)' } : isPinned ? { background: '#FFFDF2' } : undefined}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-1.5 h-7 rounded-full flex-shrink-0" style={{ background: st.solid }} />
                          <button
                            onClick={e => { e.stopPropagation(); onTogglePin(o.projectId, !isPinned); }}
                            className={`p-1 rounded-lg press flex-shrink-0 transition-opacity ${isPinned ? '' : 'opacity-0 group-hover:opacity-100'}`}
                            style={{ color: isPinned ? '#D97706' : 'var(--ink-3)' }}
                            aria-label={isPinned ? 'Відкріпити' : 'Закріпити для всіх'}
                            title={isPinned ? 'Відкріпити' : 'Закріпити для всіх'}>
                            <Pin size={14} fill={isPinned ? '#D97706' : 'none'} className={isPinned ? '' : 'rotate-45'} />
                          </button>
                          <div className="min-w-0">
                            <p className="font-bold text-[13.5px] leading-tight truncate">{o.orderNum || '—'}</p>
                            <p className="font-mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>{o.projectId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 max-w-[240px]">
                        <span className="block truncate" style={{ color: o.client ? 'var(--ink)' : 'var(--ink-3)' }}>
                          {o.client || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
                          style={{ background: st.bg, color: st.fg }}>
                          {o.status || 'без статусу'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 w-[190px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[70px]">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: st.solid }} />
                          </div>
                          <span className="text-[11px] font-bold tabular-nums w-9 text-right" style={{ color: st.fg }}>{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-[12.5px]">
                        <b>{o.done}</b><span style={{ color: 'var(--ink-3)' }}> / {o.total}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {o.date || '—'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[12px]">
                        {o.deadline
                          ? <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ink-2)' }}>
                              <Clock size={11} /> {o.deadline}
                            </span>
                          : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Картки: сітка на десктопі, стовпчик на телефоні.
            На телефоні показуються завжди (таблиця лише md+). */}
        <div className={`${view === 'table' ? 'md:hidden' : ''} grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5`}>
          {filtered.map((o, i) => (
            <div key={o.headerRow} className={i < 5 ? `rise rise-${i + 1}` : undefined}>
              <OrderCard order={o} onOpen={() => onOpen(o)} active={o.headerRow === activeRow}
                pinned={pinnedSet.has(o.projectId)}
                onTogglePin={() => onTogglePin(o.projectId, !pinnedSet.has(o.projectId))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
