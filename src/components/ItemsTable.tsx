// ================================================================
//  src/components/ItemsTable.tsx
//  Десктопний перегляд позицій замовлення у вигляді таблиці —
//  як у Google Таблиці, але з редагуванням клітинок на місці.
//  Списки (операція/виконавець/статус/матеріал) — красивий попап
//  з пошуком; текстові поля — інлайн-інпут. Enter/blur зберігає.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Check, Loader2, Search, CheckSquare, Square, Pencil, Plus } from 'lucide-react';
import { OrderItem, Lists, statusStyle } from '../types';

type Field = 'op' | 'executor' | 'qty' | 'assignedQty' | 'material' | 'thickness' | 'note' | 'rowStatus'
  | 'name' | 'clientPrice' | 'payStatus';

export type TableMode = 'prod' | 'buh';

/** Статуси оплати — як у колонці "Статус оплати" таблиці. */
const PAY_OPTIONS = ['Сформувати', 'Рахунок виставлено', 'Оплачено'];

/** Кольори маршрутних смужок: та сама деталь з різними операціями. */
const ROUTE_COLORS = ['#6366F1', '#0891B2', '#D97706', '#DB2777', '#16A34A', '#7C3AED'];

interface Props {
  items: OrderItem[];
  lists: Lists | null;
  mode: TableMode;
  onSave: (row: number, field: Field, value: string) => Promise<void>;
  onAddOp: (item: OrderItem) => void;
  /** Вибір рядків для масових дій (статус, відправка виконавцю). */
  selected: Set<number>;
  onToggleRow: (row: number) => void;
  onToggleAll: () => void;
}

interface PopState {
  row: number;
  field: Field;
  rect: { left: number; top: number; bottom: number };
  options: string[];
  current: string;
}

export default function ItemsTable({ items, lists, mode, onSave, onAddOp, selected, onToggleRow, onToggleAll }: Props) {
  const [edit, setEdit] = useState<{ row: number; field: Field } | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (edit) inputRef.current?.focus(); }, [edit]);

  function optionsFor(field: Field): string[] | null {
    if (field === 'payStatus') return PAY_OPTIONS;
    if (!lists) return null;
    if (field === 'op') return lists.operations;
    if (field === 'executor') return lists.executors;
    if (field === 'rowStatus') return lists.rowStatus;
    if (field === 'material') return lists.materials;
    return null;
  }

  // Маршрути: однакова деталь (назва) з кількома рядками → спільна кольорова смужка
  const routes = useMemo(() => {
    const byName = new Map<string, number[]>();
    items.forEach(i => {
      const key = i.name.trim().toLowerCase();
      const arr = byName.get(key) || [];
      arr.push(i.row);
      byName.set(key, arr);
    });
    const map = new Map<number, { color: string; step: number; total: number }>();
    let gi = 0;
    for (const rows of byName.values()) {
      if (rows.length < 2) continue;
      const color = ROUTE_COLORS[gi % ROUTE_COLORS.length];
      gi++;
      rows.forEach((r, i2) => map.set(r, { color, step: i2 + 1, total: rows.length }));
    }
    return map;
  }, [items]);

  async function commit(row: number, field: Field, value: string, current: string) {
    setEdit(null);
    setPop(null);
    if (value === current) return;
    const key = `${row}:${field}`;
    setSaving(key);
    try {
      await onSave(row, field, value);
    } finally {
      setSaving(null);
    }
  }

  function openEditor(e: React.MouseEvent, item: OrderItem, field: Field) {
    const value = String((item as any)[field] ?? '');
    const opts = optionsFor(field);
    if (opts && opts.length) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPop({ row: item.row, field, rect: { left: r.left, top: r.top, bottom: r.bottom }, options: opts, current: value });
    } else {
      setDraft(value);
      setEdit({ row: item.row, field });
    }
  }

  function Cell({ item, field }: { item: OrderItem; field: Field }) {
    const value = String((item as any)[field] ?? '');
    const isEditing = edit?.row === item.row && edit.field === field;
    const key = `${item.row}:${field}`;

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(item.row, field, draft, value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(item.row, field, draft, value);
            if (e.key === 'Escape') setEdit(null);
          }}
          className="w-full px-2 py-1 rounded-lg border border-[var(--accent)] outline-none text-[12.5px] shadow-sm"
        />
      );
    }

    if (field === 'rowStatus') {
      const st = statusStyle(value);
      return (
        <button
          onClick={e => openEditor(e, item, field)}
          className="w-full text-left px-2 py-1 rounded-lg text-[11.5px] font-semibold press"
          style={{ background: value ? st.bg : 'transparent', color: value ? st.fg : 'var(--ink-3)' }}
        >
          {saving === key ? <Loader2 size={12} className="animate-spin inline" /> : (value || '—')}
        </button>
      );
    }

    const isList = !!optionsFor(field)?.length;
    return (
      <button
        onClick={e => openEditor(e, item, field)}
        className={`w-full text-left px-2 py-1 rounded-lg text-[12.5px] truncate press hover:bg-gray-50 ${isList ? 'hover:ring-1 hover:ring-gray-200' : ''}`}
        style={{ color: value ? 'var(--ink)' : 'var(--ink-3)' }}
        title={value}
      >
        {saving === key
          ? <Loader2 size={12} className="animate-spin inline" />
          : (value || '—')}
        {isList && <span className="float-right text-[8px] opacity-0 group-hover:opacity-40 ml-1 mt-1">▼</span>}
      </button>
    );
  }

  /** Клітинка найменування: посилання + ✏️ редагування (лінк зберігається) + маршрут. */
  function NameCell({ item }: { item: OrderItem }) {
    const isEditing = edit?.row === item.row && edit.field === 'name';
    const route = routes.get(item.row);
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(item.row, 'name', draft, item.name)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(item.row, 'name', draft, item.name);
            if (e.key === 'Escape') setEdit(null);
          }}
          className="w-full px-2 py-1 rounded-lg border border-[var(--accent)] outline-none text-[12.5px] shadow-sm"
        />
      );
    }
    return (
      <span className="inline-flex items-center gap-1 max-w-full">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer"
            className="text-[var(--accent)] hover:underline inline-flex items-start gap-1 min-w-0">
            <span className="line-clamp-1">{item.name}</span>
            <ExternalLink size={11} className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ) : (
          <span className="line-clamp-1">{item.name}</span>
        )}
        {route && (
          <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded"
            style={{ background: route.color + '18', color: route.color }}
            title="Маршрут деталі: та сама деталь, різні операції">
            {route.step}/{route.total}
          </span>
        )}
        <button
          onClick={() => { setDraft(item.name); setEdit({ row: item.row, field: 'name' }); }}
          className="flex-shrink-0 p-0.5 rounded press opacity-0 group-hover:opacity-60 hover:!opacity-100"
          style={{ color: 'var(--ink-3)' }} aria-label="Перейменувати" title="Перейменувати (посилання збережеться)">
          <Pencil size={11} />
        </button>
      </span>
    );
  }

  const buh = mode === 'buh';
  const cols = buh ? COLS_BUH : COLS_PROD;

  return (
    <div className="overflow-auto thin-scrollbar h-full">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#FAFBFC]">
            <th className="w-[36px] px-2 py-2 border-b hairline">
              <button onClick={onToggleAll} className="flex press" aria-label="Вибрати все">
                {items.length > 0 && items.every(i => selected.has(i.row))
                  ? <CheckSquare size={15} className="text-[var(--accent)]" />
                  : <Square size={15} className="text-gray-300" />}
              </button>
            </th>
            {cols.map(c => (
              <th key={c.key}
                className={`${c.w} text-left font-semibold text-[11px] uppercase tracking-wide text-[var(--ink-3)] px-3 py-2 border-b hairline whitespace-nowrap`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const route = routes.get(item.row);
            return (
            <tr key={item.row}
              className="border-b hairline hover:bg-[#FCFCFD] group"
              style={selected.has(item.row) ? { background: 'var(--accent-soft)' } : undefined}>
              <td className="px-2 py-1.5" style={route ? { boxShadow: `inset 3px 0 0 ${route.color}` } : undefined}>
                <button onClick={() => onToggleRow(item.row)} className="flex press" aria-label="Вибрати рядок">
                  {selected.has(item.row)
                    ? <CheckSquare size={15} className="text-[var(--accent)]" />
                    : <Square size={15} className="text-gray-300" />}
                </button>
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--ink-3)] whitespace-nowrap">
                {item.id}
              </td>
              <td className="px-3 py-1.5"><NameCell item={item} /></td>
              {buh ? (
                <>
                  <td className="px-1 py-1 tabular-nums"><Cell item={item} field="qty" /></td>
                  <td className="px-1 py-1 tabular-nums"><Cell item={item} field="clientPrice" /></td>
                  <td className="px-3 py-1.5 tabular-nums text-[12px] font-semibold whitespace-nowrap">
                    {item.clientSum || '—'}
                  </td>
                  <td className="px-1 py-1"><Cell item={item} field="payStatus" /></td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {item.invoiceNum ? (
                      item.invoiceUrl
                        ? <a href={item.invoiceUrl} target="_blank" rel="noreferrer"
                            className="text-[var(--accent)] hover:underline text-[12px] font-semibold inline-flex items-center gap-1">
                            {item.invoiceNum} <ExternalLink size={10} />
                          </a>
                        : <span className="text-[12px]">{item.invoiceNum}</span>
                    ) : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td className="px-1 py-1"><Cell item={item} field="note" /></td>
                </>
              ) : (
                <>
                  <td className="px-1 py-1"><Cell item={item} field="material" /></td>
                  <td className="px-1 py-1"><Cell item={item} field="thickness" /></td>
                  <td className="px-1 py-1 tabular-nums"><Cell item={item} field="qty" /></td>
                  <td className="px-1 py-1"><Cell item={item} field="op" /></td>
                  <td className="px-1 py-1"><Cell item={item} field="executor" /></td>
                  <td className="px-1 py-1"><Cell item={item} field="rowStatus" /></td>
                  <td className="px-1 py-1"><Cell item={item} field="note" /></td>
                  <td className="px-1 py-1 w-[34px]">
                    <button onClick={() => onAddOp(item)}
                      className="p-1 rounded-lg press opacity-0 group-hover:opacity-70 hover:!opacity-100"
                      style={{ color: 'var(--accent)' }} aria-label="Додати операцію"
                      title="Додати операцію цій деталі (рядок-дубль → маршрут)">
                      <Plus size={14} />
                    </button>
                  </td>
                </>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>

      {items.length === 0 && (
        <p className="text-center text-[var(--ink-3)] text-[13px] py-14">Позицій немає</p>
      )}

      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--ink-3)]">
        <Check size={12} /> Клік по клітинці — редагування · ✏️ — перейменувати · ➕ — додати операцію (маршрут)
      </div>

      {pop && (
        <ListPopover
          state={pop}
          onPick={v => commit(pop.row, pop.field, v, pop.current)}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}

const COLS_PROD: Array<{ key: string; label: string; w: string }> = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[280px]' },
  { key: 'material', label: 'Матеріал', w: 'w-[110px]' },
  { key: 'thickness', label: 'S', w: 'w-[60px]' },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'op', label: 'Операція', w: 'w-[150px]' },
  { key: 'executor', label: 'Виконавець', w: 'w-[160px]' },
  { key: 'rowStatus', label: 'Статус', w: 'w-[150px]' },
  { key: 'note', label: 'Примітка', w: 'min-w-[160px]' },
  { key: 'add', label: '', w: 'w-[34px]' },
];

const COLS_BUH: Array<{ key: string; label: string; w: string }> = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[280px]' },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'clientPrice', label: 'Ціна', w: 'w-[90px]' },
  { key: 'clientSum', label: 'Сума', w: 'w-[100px]' },
  { key: 'payStatus', label: 'Оплата', w: 'w-[160px]' },
  { key: 'invoice', label: 'Рахунок', w: 'w-[110px]' },
  { key: 'note', label: 'Примітка', w: 'min-w-[140px]' },
];

/** Попап-список: фіксована позиція біля клітинки, пошук, чек на поточному. */
function ListPopover({ state, onPick, onClose }: {
  state: PopState;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isStatus = state.field === 'rowStatus';

  useEffect(() => { searchRef.current?.focus(); }, []);

  const options = useMemo(() => {
    const base = state.options.filter((v, i, a) => a.indexOf(v) === i);
    if (state.current && !base.includes(state.current)) base.unshift(state.current);
    const query = q.trim().toLowerCase();
    return query ? base.filter(o => o.toLowerCase().includes(query)) : base;
  }, [state, q]);

  // Позиція: під клітинкою; якщо знизу мало місця — над нею
  const H = Math.min(320, 92 + options.length * 34);
  const below = state.rect.bottom + H + 8 < window.innerHeight;
  const top = below ? state.rect.bottom + 4 : Math.max(8, state.rect.top - H - 4);
  const left = Math.min(state.rect.left, window.innerWidth - 264);

  return (
    <div className="fixed inset-0 z-[75]" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className="absolute w-[256px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-pop-in flex flex-col"
        style={{ left, top, maxHeight: 320 }}
      >
        {state.options.length > 6 && (
          <div className="flex-shrink-0 p-2 border-b hairline">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') onClose();
                  if (e.key === 'Enter' && options.length === 1) onPick(options[0]);
                }}
                placeholder="Пошук…"
                className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 text-[12px]"
              />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto thin-scrollbar p-1">
          <button
            onClick={() => onPick('')}
            className="w-full text-left px-2.5 py-1.5 rounded-xl text-[12px] hover:bg-gray-50 press"
            style={{ color: 'var(--ink-3)' }}
          >
            — очистити —
          </button>
          {options.map(o => {
            const on = o === state.current;
            const st = isStatus ? statusStyle(o) : null;
            return (
              <button
                key={o}
                onClick={() => onPick(o)}
                className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-xl text-[12.5px] hover:bg-gray-50 press"
                style={on ? { background: 'var(--accent-soft)' } : undefined}
              >
                {st ? (
                  <span className="flex-1 truncate font-semibold text-[11.5px] px-2 py-0.5 rounded-lg"
                    style={{ background: st.bg, color: st.fg }}>{o}</span>
                ) : (
                  <span className="flex-1 truncate" style={{ color: 'var(--ink)' }}>{o}</span>
                )}
                {on && <Check size={13} className="flex-shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
          {!options.length && (
            <p className="text-center text-[11.5px] py-3" style={{ color: 'var(--ink-3)' }}>Нічого не знайдено</p>
          )}
        </div>
      </div>
    </div>
  );
}
