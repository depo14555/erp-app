// ================================================================
//  src/components/KanbanBoard.tsx — замовлення як канбан-дошка.
//  Колонка = статус замовлення. Картку можна перетягнути мишею
//  (десктоп) або перекинути кнопкою «→» (телефон) — статус одразу
//  пишеться в таблицю.
// ================================================================

import { useMemo, useState } from 'react';
import { Clock, Package, Pin, GripVertical, ArrowRightLeft } from 'lucide-react';
import { Order, statusStyle } from '../types';

interface Props {
  orders: Order[];
  statuses: string[];
  pinned: Set<string>;
  onOpen: (o: Order) => void;
  onMove: (o: Order, status: string) => void;
  onTogglePin: (projectId: string, on: boolean) => void;
  activeRow?: number;
}

export default function KanbanBoard({ orders, statuses, pinned, onOpen, onMove, onTogglePin, activeRow }: Props) {
  const [drag, setDrag] = useState<Order | null>(null);
  const [over, setOver] = useState<string>('');
  const [movePick, setMovePick] = useState<Order | null>(null);

  /** Колонки: спершу статуси зі списку таблиці, далі ті, що є лише в даних. */
  const columns = useMemo(() => {
    const seen: string[] = [];
    statuses.forEach(s => { if (s && !seen.includes(s)) seen.push(s); });
    orders.forEach(o => { const s = o.status || 'без статусу'; if (!seen.includes(s)) seen.push(s); });
    return seen.map(status => ({
      status,
      items: orders
        .filter(o => (o.status || 'без статусу') === status)
        .sort((a, b) => (pinned.has(b.projectId) ? 1 : 0) - (pinned.has(a.projectId) ? 1 : 0)),
    }));
  }, [orders, statuses, pinned]);

  function drop(status: string) {
    const o = drag;
    setDrag(null);
    setOver('');
    if (o && (o.status || 'без статусу') !== status) onMove(o, status);
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden px-3 lg:px-5 pb-4">
      <div className="flex gap-2.5 h-full items-start min-w-max">
        {columns.map(({ status, items }) => {
          const st = statusStyle(status);
          const isOver = over === status;
          return (
            <div key={status}
              onDragOver={e => { e.preventDefault(); setOver(status); }}
              onDragLeave={() => setOver(prev => (prev === status ? '' : prev))}
              onDrop={() => drop(status)}
              className="flex flex-col w-[268px] max-h-full rounded-2xl transition-colors"
              style={{ background: isOver ? st.bg : '#F4F5F7', outline: isOver ? `2px dashed ${st.solid}` : 'none' }}>

              {/* Шапка колонки */}
              <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.solid }} />
                <p className="text-[12.5px] font-bold truncate flex-1" style={{ color: st.fg }}>{status}</p>
                <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/80"
                  style={{ color: 'var(--ink-2)' }}>{items.length}</span>
              </div>

              {/* Картки */}
              <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-2 pb-2 space-y-1.5">
                {items.map(o => {
                  const pct = o.total > 0 ? Math.round((100 * o.done) / o.total) : 0;
                  const isPinned = pinned.has(o.projectId);
                  return (
                    <div key={o.headerRow}
                      draggable
                      onDragStart={() => setDrag(o)}
                      onDragEnd={() => { setDrag(null); setOver(''); }}
                      onClick={() => onOpen(o)}
                      className={`group bg-white rounded-xl p-2.5 cursor-pointer shadow-sm ring-1 transition-all ${
                        drag?.headerRow === o.headerRow ? 'opacity-40' : ''
                      }`}
                      style={{
                        borderLeft: `3px solid ${st.solid}`,
                        boxShadow: o.headerRow === activeRow ? `0 0 0 2px var(--accent)` : undefined,
                      }}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical size={13} className="hidden lg:block flex-shrink-0 mt-0.5 text-gray-300 group-hover:text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[13px] leading-tight truncate">{o.orderNum || o.projectId || '—'}</p>
                          <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{o.client || '—'}</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); onTogglePin(o.projectId, !isPinned); }}
                          className={`p-1 rounded-lg press flex-shrink-0 ${isPinned ? '' : 'opacity-0 group-hover:opacity-60'}`}
                          style={{ color: isPinned ? '#D97706' : 'var(--ink-3)' }}
                          aria-label={isPinned ? 'Відкріпити' : 'Закріпити'}>
                          <Pin size={12} fill={isPinned ? '#D97706' : 'none'} className={isPinned ? '' : 'rotate-45'} />
                        </button>
                      </div>

                      {o.total > 0 && (
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between text-[10.5px] mb-0.5" style={{ color: 'var(--ink-3)' }}>
                            <span className="flex items-center gap-1"><Package size={10} /> {o.done}/{o.total}</span>
                            <span className="font-bold tabular-nums" style={{ color: st.fg }}>{pct}%</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: st.solid }} />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: 'var(--ink-3)' }}>
                        <span className="font-mono">{o.projectId}</span>
                        {o.deadline && (
                          <span className="flex items-center gap-0.5 ml-auto font-semibold" style={{ color: 'var(--ink-2)' }}>
                            <Clock size={9} /> {o.deadline}
                          </span>
                        )}
                        {/* На телефоні перетягування незручне — кнопка переносу */}
                        <button onClick={e => { e.stopPropagation(); setMovePick(o); }}
                          className="lg:hidden ml-auto p-1 rounded-lg press" style={{ color: 'var(--accent)' }}
                          aria-label="Перенести в інший статус">
                          <ArrowRightLeft size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {!items.length && (
                  <p className="text-center text-[11px] py-6" style={{ color: 'var(--ink-3)' }}>
                    {isOver ? 'Відпустіть тут' : 'порожньо'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Телефон: вибір статусу для переносу картки */}
      {movePick && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMovePick(null)} />
          <div className="relative w-full lg:w-[380px] bg-white rounded-t-3xl lg:rounded-3xl shadow-2xl animate-sheet-up max-h-[70dvh] flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <p className="font-bold text-[15px]">Перенести замовлення</p>
              <p className="text-[12px] truncate" style={{ color: 'var(--ink-3)' }}>
                {movePick.orderNum || movePick.projectId}{movePick.client ? ` · ${movePick.client}` : ''}
              </p>
            </div>
            <div className="p-2 overflow-y-auto">
              {columns.map(({ status }) => {
                const st = statusStyle(status);
                const cur = (movePick.status || 'без статусу') === status;
                return (
                  <button key={status}
                    onClick={() => { const o = movePick; setMovePick(null); if (!cur) onMove(o, status); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-gray-50 press">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.solid }} />
                    <span className="flex-1 text-[14px] font-semibold" style={{ color: st.fg }}>{status}</span>
                    {cur && <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>зараз тут</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
