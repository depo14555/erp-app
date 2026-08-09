// ================================================================
//  src/components/KanbanBoard.tsx — замовлення як канбан, у стилі Trello.
//  Дошки: «Всі» (колонки = статуси замовлень із таблиці) і власні —
//  «Пріоритет», «Пауза» чи будь-які інші, де колонки створює користувач,
//  а картки розкладає вручну. Перетягування мишею, на телефоні — кнопка ⇄.
//  Дошки спільні для всіх (зберігаються в таблиці-хабі).
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Clock, Package, Pin, GripVertical, ArrowRightLeft, Plus, X, Loader2, Pencil, Trash2,
} from 'lucide-react';
import { api } from '../api';
import { Order, KanbanBoardData, statusStyle } from '../types';

interface Props {
  orders: Order[];
  statuses: string[];
  pinned: Set<string>;
  onOpen: (o: Order) => void;
  onMove: (o: Order, status: string) => void;
  onTogglePin: (projectId: string, on: boolean) => void;
  onToast: (msg: string, err?: boolean) => void;
  activeRow?: number;
}

const ALL = '__all__';   // вбудована дошка «Всі» — колонки зі статусів замовлень

export default function KanbanBoard({
  orders, statuses, pinned, onOpen, onMove, onTogglePin, onToast, activeRow,
}: Props) {
  const [boards, setBoards] = useState<KanbanBoardData[]>([]);
  const [boardId, setBoardId] = useState<string>(ALL);
  const [drag, setDrag] = useState<Order | null>(null);
  const [over, setOver] = useState<string>('');
  const [movePick, setMovePick] = useState<Order | null>(null);
  const [newCol, setNewCol] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.boards()
      .then(r => setBoards(r.boards || []))
      .catch(e => onToast(e?.message || 'Не вдалося прочитати дошки', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = boards.find(b => b.id === boardId) || null;

  async function persist(next: KanbanBoardData[]) {
    setBoards(next);
    setSaving(true);
    try {
      await api.boards(next);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти дошку', true);
    } finally {
      setSaving(false);
    }
  }
  function patchBoard(id: string, p: Partial<KanbanBoardData>) {
    persist(boards.map(b => (b.id === id ? { ...b, ...p } : b)));
  }

  /** Колонки поточної дошки: статуси або власні + «Без колонки». */
  const columns = useMemo(() => {
    if (!board) {
      const seen: string[] = [];
      statuses.forEach(s => { if (s && !seen.includes(s)) seen.push(s); });
      orders.forEach(o => { const s = o.status || 'без статусу'; if (!seen.includes(s)) seen.push(s); });
      return seen.map(name => ({
        name,
        items: orders.filter(o => (o.status || 'без статусу') === name),
      }));
    }
    const cols = board.columns.map(name => ({
      name,
      items: orders.filter(o => board.cards[o.projectId] === name),
    }));
    cols.push({ name: '', items: orders.filter(o => !board.cards[o.projectId]) });
    return cols;
  }, [board, orders, statuses]);

  const sortPinned = (list: Order[]) =>
    [...list].sort((a, b) => (pinned.has(b.projectId) ? 1 : 0) - (pinned.has(a.projectId) ? 1 : 0));

  function drop(colName: string) {
    const o = drag;
    setDrag(null);
    setOver('');
    if (!o) return;
    if (!board) {
      if ((o.status || 'без статусу') !== colName) onMove(o, colName);
      return;
    }
    const cards = { ...board.cards };
    if (colName) cards[o.projectId] = colName; else delete cards[o.projectId];
    patchBoard(board.id, { cards });
  }

  function addColumn() {
    const name = newCol.trim();
    if (!name || !board) return;
    if (board.columns.includes(name)) { onToast('Така колонка вже є', true); return; }
    patchBoard(board.id, { columns: [...board.columns, name] });
    setNewCol('');
    setAdding(false);
  }
  function renameColumn(oldName: string) {
    if (!board) return;
    const name = prompt('Нова назва колонки', oldName)?.trim();
    if (!name || name === oldName) return;
    const cards: Record<string, string> = {};
    Object.entries(board.cards).forEach(([k, v]) => { cards[k] = v === oldName ? name : v; });
    patchBoard(board.id, { columns: board.columns.map(c => (c === oldName ? name : c)), cards });
  }
  function removeColumn(name: string) {
    if (!board) return;
    const cards: Record<string, string> = {};
    Object.entries(board.cards).forEach(([k, v]) => { if (v !== name) cards[k] = v; });
    patchBoard(board.id, { columns: board.columns.filter(c => c !== name), cards });
  }
  function addBoard() {
    const name = prompt('Назва нової дошки')?.trim();
    if (!name) return;
    const b: KanbanBoardData = {
      id: 'b' + Math.random().toString(36).slice(2, 7),
      name, columns: ['Нова колонка'], cards: {},
    };
    persist([...boards, b]);
    setBoardId(b.id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Перемикач дошок */}
      <div className="flex-shrink-0 px-3 lg:px-5 pb-2 flex items-center gap-1.5 flex-wrap">
        {[{ id: ALL, name: 'Всі' }, ...boards].map(b => {
          const on = boardId === b.id;
          return (
            <button key={b.id} onClick={() => setBoardId(b.id)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors"
              style={on ? { background: 'var(--ink)', color: '#fff' } : { background: '#fff', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px #E5E7EB' }}>
              {b.name}
              {b.id !== ALL && (
                <span className="ml-1.5 opacity-60">
                  {orders.filter(o => (boards.find(x => x.id === b.id)?.cards || {})[o.projectId]).length}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={addBoard}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12px] font-bold press"
          style={{ color: 'var(--accent)' }}>
          <Plus size={13} /> дошка
        </button>
        {saving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        {board && (
          <span className="text-[11px] ml-auto" style={{ color: 'var(--ink-3)' }}>
            перетягніть картку в колонку · дошка спільна для всіх
          </span>
        )}
      </div>

      {/* Дошка */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-3 lg:px-5 pb-4">
        <div className="flex gap-2.5 h-full items-start min-w-max">
          {columns.map(({ name, items }) => {
            const st = statusStyle(name || 'без статусу');
            const isOver = over === name;
            const list = sortPinned(items);
            const isRest = board && !name;
            return (
              <div key={name || '__rest__'}
                onDragOver={e => { e.preventDefault(); setOver(name); }}
                onDragLeave={() => setOver(prev => (prev === name ? '' : prev))}
                onDrop={() => drop(name)}
                className="flex flex-col w-[268px] max-h-full rounded-2xl transition-colors"
                style={{
                  background: isOver ? (isRest ? '#EEF2FF' : st.bg) : '#F4F5F7',
                  outline: isOver ? `2px dashed ${isRest ? '#6366F1' : st.solid}` : 'none',
                }}>

                <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 group/col">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: isRest ? '#CBD5E1' : st.solid }} />
                  <p className="text-[12.5px] font-bold truncate flex-1"
                    style={{ color: isRest ? 'var(--ink-3)' : st.fg }}>
                    {isRest ? 'Не розподілені' : name}
                  </p>
                  <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/80"
                    style={{ color: 'var(--ink-2)' }}>{list.length}</span>
                  {board && !isRest && (
                    <span className="hidden lg:flex items-center opacity-0 group-hover/col:opacity-100 transition-opacity">
                      <button onClick={() => renameColumn(name)} className="p-1 press" style={{ color: 'var(--ink-3)' }} aria-label="Перейменувати">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => removeColumn(name)} className="p-1 press text-red-500" aria-label="Видалити колонку">
                        <Trash2 size={11} />
                      </button>
                    </span>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-2 pb-2 space-y-1.5">
                  {list.map(o => {
                    const cst = statusStyle(o.status);
                    const pct = o.total > 0 ? Math.round((100 * o.done) / o.total) : 0;
                    const isPinned = pinned.has(o.projectId);
                    return (
                      <div key={o.headerRow}
                        draggable
                        onDragStart={() => setDrag(o)}
                        onDragEnd={() => { setDrag(null); setOver(''); }}
                        onClick={() => onOpen(o)}
                        className={`group bg-white rounded-xl p-2.5 cursor-pointer shadow-sm transition-all ${
                          drag?.headerRow === o.headerRow ? 'opacity-40' : ''
                        }`}
                        style={{
                          borderLeft: `3px solid ${cst.solid}`,
                          boxShadow: o.headerRow === activeRow ? '0 0 0 2px var(--accent)' : undefined,
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

                        {/* На власній дошці статус лишається видимим міткою */}
                        {board && (
                          <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: cst.bg, color: cst.fg }}>
                            {o.status || 'без статусу'}
                          </span>
                        )}

                        {o.total > 0 && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-[10.5px] mb-0.5" style={{ color: 'var(--ink-3)' }}>
                              <span className="flex items-center gap-1"><Package size={10} /> {o.done}/{o.total}</span>
                              <span className="font-bold tabular-nums" style={{ color: cst.fg }}>{pct}%</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cst.solid }} />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: 'var(--ink-3)' }}>
                          <span className="font-mono">{o.projectId}</span>
                          {o.deadline && (
                            <span className="flex items-center gap-0.5 font-semibold" style={{ color: 'var(--ink-2)' }}>
                              <Clock size={9} /> {o.deadline}
                            </span>
                          )}
                          <button onClick={e => { e.stopPropagation(); setMovePick(o); }}
                            className="lg:hidden ml-auto p-1 rounded-lg press" style={{ color: 'var(--accent)' }}
                            aria-label="Перенести">
                            <ArrowRightLeft size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {!list.length && (
                    <p className="text-center text-[11px] py-6" style={{ color: 'var(--ink-3)' }}>
                      {isOver ? 'Відпустіть тут' : 'порожньо'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Нова колонка — тільки на власних дошках */}
          {board && (
            <div className="w-[220px] flex-shrink-0">
              {adding ? (
                <div className="bg-white rounded-2xl p-2 ring-1 ring-gray-200">
                  <input autoFocus value={newCol} onChange={e => setNewCol(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setAdding(false); }}
                    placeholder="Назва колонки"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200 outline-none text-[12.5px]" />
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={addColumn} className="flex-1 py-1.5 rounded-xl text-[12px] font-bold text-white press"
                      style={{ background: 'var(--accent)' }}>Додати</button>
                    <button onClick={() => setAdding(false)} className="p-2 press" style={{ color: 'var(--ink-3)' }}><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[12.5px] font-bold press"
                  style={{ background: '#F4F5F7', color: 'var(--ink-2)' }}>
                  <Plus size={14} /> Колонка
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Телефон: куди перенести */}
      {movePick && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMovePick(null)} />
          <div className="relative w-full lg:w-[380px] bg-white rounded-t-3xl lg:rounded-3xl shadow-2xl animate-sheet-up max-h-[70dvh] flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <p className="font-bold text-[15px]">{board ? `Перенести на «${board.name}»` : 'Змінити статус'}</p>
              <p className="text-[12px] truncate" style={{ color: 'var(--ink-3)' }}>
                {movePick.orderNum || movePick.projectId}{movePick.client ? ` · ${movePick.client}` : ''}
              </p>
            </div>
            <div className="p-2 overflow-y-auto">
              {columns.map(({ name }) => {
                const st = statusStyle(name || 'без статусу');
                const cur = board ? board.cards[movePick.projectId] === name || (!name && !board.cards[movePick.projectId])
                                  : (movePick.status || 'без статусу') === name;
                return (
                  <button key={name || '__rest__'}
                    onClick={() => { const o = movePick; setMovePick(null); if (!cur) { setDrag(o); setTimeout(() => drop(name), 0); } }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-gray-50 press">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: name ? st.solid : '#CBD5E1' }} />
                    <span className="flex-1 text-[14px] font-semibold" style={{ color: name ? st.fg : 'var(--ink-3)' }}>
                      {name || 'Не розподілені'}
                    </span>
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
