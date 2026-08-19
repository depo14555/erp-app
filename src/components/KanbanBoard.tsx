// ================================================================
//  src/components/KanbanBoard.tsx — замовлення як канбан, у стилі Trello.
//  Дошки власні: «Пріоритет», «Пауза» чи будь-які інші — колонки створює
//  користувач, картки розкладає вручну (статус лишається міткою).
//  Перетягування мишею, на телефоні — кнопка ⇄.
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
  pinned: Set<string>;
  onOpen: (o: Order) => void;
  onTogglePin: (projectId: string, on: boolean) => void;
  onToast: (msg: string, err?: boolean) => void;
  activeRow?: number;
}

export default function KanbanBoard({
  orders, pinned, onOpen, onTogglePin, onToast, activeRow,
}: Props) {
  const [boards, setBoards] = useState<KanbanBoardData[]>([]);
  const [boardId, setBoardId] = useState<string>('');
  const [drag, setDrag] = useState<Order | null>(null);
  const [over, setOver] = useState<string>('');
  const [movePick, setMovePick] = useState<Order | null>(null);
  const [newCol, setNewCol] = useState('');
  const [adding, setAdding] = useState(false);
  const [newBoard, setNewBoard] = useState<string | null>(null);   // інлайн-створення дошки
  const [renaming, setRenaming] = useState<string>('');            // колонка, яку перейменовують
  const [renameTo, setRenameTo] = useState('');
  const [confirmDel, setConfirmDel] = useState('');                // id дошки на підтвердженні
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.boards()
      .then(r => {
        const list = r.boards || [];
        setBoards(list);
        if (list.length) setBoardId(prev => prev || list[0].id);
      })
      .catch(e => onToast(e?.message || 'Не вдалося прочитати дошки', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = boards.find(b => b.id === boardId) || boards[0] || null;

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
    if (!board) return [];
    const cols = board.columns.map(name => ({
      name,
      items: orders.filter(o => board.cards[o.projectId] === name),
    }));
    cols.push({ name: '', items: orders.filter(o => !board.cards[o.projectId]) });
    return cols;
  }, [board, orders]);

  const sortPinned = (list: Order[]) =>
    [...list].sort((a, b) => (pinned.has(b.projectId) ? 1 : 0) - (pinned.has(a.projectId) ? 1 : 0));

  function drop(colName: string) {
    const o = drag;
    setDrag(null);
    setOver('');
    if (!o || !board) return;
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
  function renameColumn(oldName: string, raw: string) {
    setRenaming('');
    const name = raw.trim();
    if (!board || !name || name === oldName) return;
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
  function removeBoard(b: KanbanBoardData) {
    const next = boards.filter(x => x.id !== b.id);
    setConfirmDel('');
    setBoardId(next[0]?.id || '');
    persist(next);
    onToast(`Дошку «${b.name}» видалено — замовлення лишились на місці`);
  }

  function addBoard(raw: string) {
    const name = raw.trim();
    setNewBoard(null);
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
        {boards.map(b => {
          const on = board?.id === b.id;
          return (
            <span key={b.id}
              className="inline-flex items-center rounded-xl transition-colors"
              style={on ? { background: 'var(--ink)', color: '#fff' } : { background: '#fff', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px #E5E7EB' }}>
              <button onClick={() => setBoardId(b.id)}
                className="pl-3 pr-2 py-1.5 text-[12px] font-bold press rounded-l-xl">
                {b.name}
                <span className="ml-1.5 opacity-60">
                  {orders.filter(o => b.cards[o.projectId]).length}
                </span>
              </button>
              {/* Видалити дошку — лише активну і з підтвердженням другим кліком */}
              {on && (confirmDel === b.id ? (
                <button onClick={() => removeBoard(b)}
                  className="pr-2.5 pl-1 py-1.5 press rounded-r-xl text-[11px] font-bold text-red-300"
                  title="Натисніть ще раз, щоб видалити">
                  видалити?
                </button>
              ) : (
                <button onClick={() => { setConfirmDel(b.id); setTimeout(() => setConfirmDel(''), 4000); }}
                  className="pr-2 pl-0.5 py-1.5 press rounded-r-xl opacity-70 hover:opacity-100"
                  aria-label={`Видалити дошку ${b.name}`} title="Видалити дошку">
                  <Trash2 size={12} />
                </button>
              ))}
            </span>
          );
        })}
        {newBoard === null ? (
          <button onClick={() => setNewBoard('')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12px] font-bold press"
            style={{ color: 'var(--accent)' }}>
            <Plus size={13} /> дошка
          </button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input autoFocus value={newBoard} onChange={e => setNewBoard(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addBoard(newBoard);
                if (e.key === 'Escape') setNewBoard(null);
              }}
              placeholder="Назва дошки"
              className="k-input w-[150px] px-2.5 py-1.5 rounded-xl outline-none text-[12px]" />
            <button onClick={() => addBoard(newBoard)}
              className="px-2.5 py-1.5 rounded-xl text-[12px] font-bold text-white press"
              style={{ background: 'var(--accent)' }}>Створити</button>
            <button onClick={() => setNewBoard(null)} className="p-1.5 press" style={{ color: 'var(--ink-3)' }} aria-label="Скасувати">
              <X size={13} />
            </button>
          </span>
        )}
        {saving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        <span className="text-[11px] ml-auto" style={{ color: 'var(--ink-3)' }}>
          перетягніть картку в колонку · дошки спільні для всіх
        </span>
      </div>

      {!board && (
        <p className="text-center text-[12.5px] py-14" style={{ color: 'var(--ink-3)' }}>
          Дошок ще немає — натисніть «+ дошка», щоб створити першу
        </p>
      )}

      {/* Дошка */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-3 lg:px-5 pb-4">
        <div className="flex gap-2.5 h-full items-start min-w-max">
          {columns.map(({ name, items }) => {
            const st = statusStyle(name || 'без статусу');
            const isOver = over === name;
            const list = sortPinned(items);
            const isRest = !name;
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
                  {renaming === name && !isRest ? (
                    <input autoFocus value={renameTo} onChange={e => setRenameTo(e.target.value)}
                      onBlur={() => renameColumn(name, renameTo)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') renameColumn(name, renameTo);
                        if (e.key === 'Escape') setRenaming('');
                      }}
                      className="k-input flex-1 min-w-0 px-2 py-1 rounded-lg ring-[var(--accent)] outline-none text-[12.5px] font-bold" />
                  ) : (
                    <p className="text-[12.5px] font-bold truncate flex-1"
                      style={{ color: isRest ? 'var(--ink-3)' : st.fg }}>
                      {isRest ? 'Не розподілені' : name}
                    </p>
                  )}
                  <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/80"
                    style={{ color: 'var(--ink-2)' }}>{list.length}</span>
                  {!isRest && (
                    <span className="hidden lg:flex items-center opacity-0 group-hover/col:opacity-100 transition-opacity">
                      <button onClick={() => { setRenaming(name); setRenameTo(name); }} className="p-1 press" style={{ color: 'var(--ink-3)' }} aria-label="Перейменувати">
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

                        {/* Статус замовлення лишається видимим міткою */}
                        {(
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
                    className="k-input w-full px-2.5 py-1.5 rounded-xl outline-none text-[12.5px]" />
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
              <p className="font-bold text-[15px]">Перенести на «{board?.name}»</p>
              <p className="text-[12px] truncate" style={{ color: 'var(--ink-3)' }}>
                {movePick.orderNum || movePick.projectId}{movePick.client ? ` · ${movePick.client}` : ''}
              </p>
            </div>
            <div className="p-2 overflow-y-auto">
              {columns.map(({ name }) => {
                const st = statusStyle(name || 'без статусу');
                const cur = board
                  ? board.cards[movePick.projectId] === name || (!name && !board.cards[movePick.projectId])
                  : false;
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
