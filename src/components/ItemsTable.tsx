// ================================================================
//  src/components/ItemsTable.tsx
//  Десктопний перегляд позицій замовлення у вигляді таблиці —
//  як у Google Таблиці, але з редагуванням клітинок на місці.
//  Списки (операція/виконавець/статус/матеріал) — красивий попап
//  з пошуком; текстові поля — інлайн-інпут. Enter/blur зберігає.
// ================================================================

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, Check, Loader2, Search, CheckSquare, Square, Pencil, Plus, Filter, FolderOpen,
  Blocks, ChevronDown, ChevronRight,
} from 'lucide-react';
import PurchasedInline, { PurchLine } from './PurchasedInline';
import { OrderItem, Lists, statusStyle } from '../types';

type Field = 'op' | 'executor' | 'qty' | 'assignedQty' | 'material' | 'thickness' | 'note' | 'rowStatus'
  | 'name' | 'clientPrice' | 'payStatus' | 'assembly' | 'time' | 'execPrice';

export type TableMode = 'prod' | 'buh' | 'log' | 'calc';

/** Число з клітинки таблиці («1 200,00» → 1200). */
export function num(v: unknown): number {
  const f = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(f) ? 0 : f;
}
/** Скільки штук рахуємо: призначено, а якщо порожньо — загальна к-сть. */
export function qtyOf(i: OrderItem): number {
  return num(i.assignedQty) || num(i.qty);
}
/** Час на всі призначені штуки, год. */
export function timeAllOf(i: OrderItem): number {
  return num(i.time) * qtyOf(i);
}

/** Мітка доставки з примітки: рядок, що починається з 🚚. */
export function deliveryOf(note: string): string {
  const line = String(note || '').split('\n').find(l => l.trim().startsWith('🚚'));
  return line ? line.trim().replace(/^🚚\s*/, '') : '';
}
/** Примітка без мітки доставки. */
export function noteWithoutDelivery(note: string): string {
  return String(note || '').split('\n').filter(l => !l.trim().startsWith('🚚')).join('\n').trim();
}

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
  /** Вибрати/зняти одразу набір рядків (шапка, Shift-діапазон). */
  onSelectRows: (rows: number[], on: boolean) => void;
  /** Групувати по збірках: збірка і що в неї входить, «Без збірок» знизу. */
  grouped?: boolean;
  /** Покупні по збірках — своїх рядків у картці вони не мають. */
  purchasedBy?: Map<string, PurchLine[]>;
}

interface PopState {
  row: number;
  field: Field;
  rect: { left: number; top: number; bottom: number };
  options: string[];
  current: string;
}

export default function ItemsTable({ items, lists, mode, onSave, onAddOp, selected, onToggleRow, onSelectRows, grouped, purchasedBy }: Props) {
  const [edit, setEdit] = useState<{ row: number; field: Field } | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Фільтри колонок: поле → вибрані значення (порожньо = без фільтра). */
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  /** Згорнуті збірки (ключ '' — «Без збірок»). */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filterPop, setFilterPop] = useState<{ field: string; label: string; rect: { left: number; top: number; bottom: number } } | null>(null);
  const lastRow = useRef<number | null>(null);

  // Інше замовлення або інша зона — фільтри колонок скидаємо
  useEffect(() => { setColFilters({}); setFilterPop(null); }, [mode, items.length]);

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

  // ВАЖЛИВО: це звичайні функції, що повертають JSX, а не вкладені компоненти.
  // Вкладений компонент має нову ідентичність на кожен рендер — React
  // перемонтовував би <input> після кожної літери, і поле губило б фокус
  // (саме через це не вписувалась ціна та інші значення).
  function cell(item: OrderItem, field: Field) {
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
          className={`text-left press ${value ? 'k-chip' : 'k-empty px-2'}`}
          style={value ? { background: st.bg, color: st.fg, borderColor: st.fg + '44' } : undefined}
        >
          {saving === key ? <Loader2 size={12} className="animate-spin inline" /> : (value || '—')}
        </button>
      );
    }

    // Операція — обведений моно-чіп, як позначення виду обробки на кресленні
    if (field === 'op') {
      return (
        <button onClick={e => openEditor(e, item, field)}
          className={`text-left press ${value ? 'k-chip' : 'k-empty px-2'}`}>
          {saving === key ? <Loader2 size={12} className="animate-spin inline" /> : (value || '—')}
        </button>
      );
    }

    // Виконавець із посиланням на папку (після розподілу КД) — поруч значок
    const folder = field === 'executor' ? (item.executorUrl || '') : '';
    const isList = !!optionsFor(field)?.length;
    const numeric = /qty|Qty|[Pp]rice|thickness|time/.test(field);
    const blank = !value;
    return (
      <span className="flex items-center gap-0.5 w-full">
      <button
        onClick={e => openEditor(e, item, field)}
        className={`w-full text-left px-1.5 py-[3px] rounded text-[12.5px] truncate press hover:bg-[var(--bg)]
          ${numeric ? 'font-mono text-[11.5px]' : ''}
          ${field === 'executor' && value ? 'font-semibold' : ''}
          ${blank ? 'k-empty text-center' : ''}`}
        title={value}
      >
        {saving === key
          ? <Loader2 size={12} className="animate-spin inline" />
          : (value || '—')}
        {isList && !blank && <span className="float-right text-[8px] opacity-0 group-hover:opacity-40 ml-1 mt-1">▼</span>}
      </button>
      {folder && (
        <a href={folder} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="p-0.5 rounded press flex-shrink-0" style={{ color: 'var(--accent)' }}
          title="Папка виконавця з кресленнями (розподіл КД)">
          <FolderOpen size={12} />
        </a>
      )}
      </span>
    );
  }

  /** Клітинка найменування: посилання + ✏️ редагування (лінк зберігається) + маршрут. */
  function nameCell(item: OrderItem) {
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
            className="text-[var(--blue)] hover:underline inline-flex items-start gap-1 min-w-0">
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
  const log = mode === 'log';
  const calc = mode === 'calc';
  const cols = buh ? COLS_BUH : log ? COLS_LOG : calc ? COLS_CALC : COLS_PROD;

  // ── Фільтри прямо в шапці колонок ──
  const shown = useMemo(() => {
    const active = Object.entries(colFilters).filter(([, v]) => v.size);
    if (!active.length) return items;
    return items.filter(i => active.every(([f, set]) => set.has(String((i as any)[f] ?? '').trim() || '—')));
  }, [items, colFilters]);

  /** Значення колонки з кількістю — для списку фільтра. */
  function valuesOf(field: string): Array<{ v: string; n: number }> {
    const map = new Map<string, number>();
    items.forEach(i => {
      const v = String((i as any)[field] ?? '').trim() || '—';
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].map(([v, n]) => ({ v, n }))
      .sort((a, b) => a.v.localeCompare(b.v, undefined, { numeric: true }));
  }

  const allShownSelected = shown.length > 0 && shown.every(i => selected.has(i.row));
  const filterCount = Object.values(colFilters).filter(s => s.size).length;

  /**
   * Групування по збірках: збірка і що в неї входить, «Без збірок» — останнім.
   * key === null означає «без групування» — тоді шапок немає взагалі.
   */
  const blocks = useMemo<Array<{ key: string | null; items: OrderItem[] }>>(() => {
    if (!grouped) return [{ key: null, items: shown }];
    const m = new Map<string, OrderItem[]>();
    shown.forEach(i => {
      const k = String(i.assembly || '').trim();
      const a = m.get(k) || [];
      a.push(i);
      m.set(k, a);
    });
    const named = [...m.keys()].filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'uk', { numeric: true }));
    const out = named.map(k => ({ key: k, items: m.get(k)! }));
    if (m.has('')) out.push({ key: '', items: m.get('')! });   // порожній ключ = «Без збірок», завжди знизу
    return out;
  }, [shown, grouped]);

  const flip = (k: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  /** Клік по галочці: Shift — діапазон від попередньої вибраної. */
  function clickRow(e: React.MouseEvent, row: number) {
    if (e.shiftKey && lastRow.current !== null) {
      const a = shown.findIndex(i => i.row === lastRow.current);
      const b = shown.findIndex(i => i.row === row);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        onSelectRows(shown.slice(from, to + 1).map(i => i.row), !selected.has(row));
        lastRow.current = row;
        return;
      }
    }
    lastRow.current = row;
    onToggleRow(row);
  }

  return (
    <div className="overflow-auto thin-scrollbar h-full">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-white">
            <th className="w-[32px] px-2 py-[7px]" style={{ borderBottom: '1.5px solid var(--ink)' }}>
              <button onClick={() => onSelectRows(shown.map(i => i.row), !allShownSelected)}
                className="flex press" aria-label="Вибрати все видиме"
                title={allShownSelected ? 'Зняти вибір' : 'Вибрати всі видимі рядки'}>
                {allShownSelected
                  ? <CheckSquare size={15} className="text-[var(--accent)]" />
                  : <Square size={15} className="text-gray-300" />}
              </button>
            </th>
            {cols.map(c => {
              const on = !!colFilters[c.key]?.size;
              return (
                <th key={c.key}
                  className={`${c.w} text-left k-label px-2.5 py-[7px] whitespace-nowrap`}
                  style={{ borderBottom: '1.5px solid var(--ink)' }}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.filter && (
                      <button
                        onClick={e => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setFilterPop({ field: c.key, label: c.label, rect: { left: r.left, top: r.top, bottom: r.bottom } });
                        }}
                        className={`p-0.5 rounded press ${on ? '' : 'opacity-30 hover:opacity-70'}`}
                        style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }}
                        title="Фільтр колонки">
                        <Filter size={11} fill={on ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    {on && (
                      <span className="text-[9px] font-bold px-1 rounded bg-[var(--accent-soft)] text-[var(--accent)] normal-case">
                        {colFilters[c.key].size}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {blocks.map(b => (
            <Fragment key={b.key ?? '#усі'}>

            {b.key !== null && (
              <tr style={{ background: 'var(--violet-bg)' }}>
                <td colSpan={cols.length + 1} className="px-2 py-[5px] border-y"
                  style={{ borderColor: 'var(--violet-line)' }}>
                  <span className="flex items-center gap-2">
                    <button onClick={() => flip(b.key!)} className="p-0.5 press flex-shrink-0"
                      style={{ color: 'var(--ink-3)' }}
                      aria-label={collapsed.has(b.key!) ? 'Розгорнути збірку' : 'Згорнути збірку'}>
                      {collapsed.has(b.key!) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => onSelectRows(b.items.map(i => i.row), !b.items.every(i => selected.has(i.row)))}
                      className="flex press flex-shrink-0" aria-label="Вибрати збірку"
                      title="Вибрати всі позиції збірки">
                      {b.items.every(i => selected.has(i.row))
                        ? <CheckSquare size={14} className="text-[var(--accent)]" />
                        : <Square size={14} className="text-gray-300" />}
                    </button>
                    <Blocks size={13} className="flex-shrink-0" style={{ color: b.key ? 'var(--violet)' : 'var(--ink-2)' }} />
                    <span className="text-[12.5px] font-extrabold truncate">{b.key || 'Без збірок'}</span>
                    <span className="k-chip" style={{ color: 'var(--violet)', borderColor: 'var(--violet-line)', background: 'transparent' }}>
                      {b.items.length} поз.
                    </span>
                  </span>
                </td>
              </tr>
            )}

            {/* Покупні цієї збірки — окремих рядків у картці вони не мають */}
            {b.key && !collapsed.has(b.key) && !!purchasedBy?.get(b.key)?.length && (
              <tr>
                <td colSpan={cols.length + 1} className="px-2 py-1.5 border-b hairline">
                  <PurchasedInline lines={purchasedBy.get(b.key)!} />
                </td>
              </tr>
            )}

            {(b.key === null || !collapsed.has(b.key)) && b.items.map(item => {
            const route = routes.get(item.row);
            return (
            <tr key={item.row} data-row={item.row}
              className="k-dash border-b hover:bg-[#F8FAFB] group"
              style={selected.has(item.row) ? { background: 'var(--accent-soft)' } : undefined}>
              <td className="px-2 py-[6px]" style={route ? { boxShadow: `inset 3px 0 0 ${route.color}` } : undefined}>
                <button onClick={e => clickRow(e, item.row)} className="flex press" aria-label="Вибрати рядок"
                  title="Shift+клік — вибрати діапазон">
                  {selected.has(item.row)
                    ? <CheckSquare size={15} className="text-[var(--accent)]" />
                    : <Square size={15} className="text-gray-300" />}
                </button>
              </td>
              <td className="px-2.5 py-[6px] font-mono text-[11.5px] whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                {item.id}
              </td>
              <td className="px-2.5 py-[6px]">{nameCell(item)}</td>
              {log ? (
                <>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'qty')}</td>
                  <td className="px-1 py-1">{cell(item, 'executor')}</td>
                  <td className="px-1 py-1">{cell(item, 'rowStatus')}</td>
                  <td className="px-3 py-1.5">
                    {deliveryOf(item.note)
                      ? <span className="inline-block text-[11px] font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 whitespace-nowrap">
                          🚚 {deliveryOf(item.note)}
                        </span>
                      : <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>— виберіть галочкою → «Доставка»</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                    {noteWithoutDelivery(item.note) || '—'}
                  </td>
                </>
              ) : calc ? (
                <>
                  <td className="px-1 py-1">{cell(item, 'assembly')}</td>
                  <td className="px-1 py-1">{cell(item, 'op')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'qty')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'assignedQty')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'time')}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[12px] whitespace-nowrap"
                    style={{ color: timeAllOf(item) ? 'var(--ink)' : 'var(--ink-3)' }}>
                    {timeAllOf(item) ? `${timeAllOf(item).toFixed(2)} год` : '—'}
                  </td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'clientPrice')}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[12px] font-semibold whitespace-nowrap">
                    {item.clientSum || (qtyOf(item) && num(item.clientPrice)
                      ? (qtyOf(item) * num(item.clientPrice)).toFixed(2)
                      : '—')}
                  </td>
                </>
              ) : buh ? (
                <>
                  <td className="px-1 py-1">{cell(item, 'op')}</td>
                  <td className="px-1 py-1">{cell(item, 'executor')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'qty')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'clientPrice')}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[12px] font-semibold whitespace-nowrap">
                    {item.clientSum || '—'}
                  </td>
                  <td className="px-1 py-1">{cell(item, 'payStatus')}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {item.invoiceNum ? (
                      item.invoiceUrl
                        ? <a href={item.invoiceUrl} target="_blank" rel="noreferrer"
                            className="text-[var(--blue)] hover:underline text-[12px] font-semibold inline-flex items-center gap-1">
                            {item.invoiceNum} <ExternalLink size={10} />
                          </a>
                        : <span className="text-[12px]">{item.invoiceNum}</span>
                    ) : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {item.execInvoice
                      ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">
                          {item.execInvoice}
                        </span>
                      : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td className="px-1 py-1">{cell(item, 'note')}</td>
                </>
              ) : (
                <>
                  <td className="px-1 py-1">{cell(item, 'material')}</td>
                  <td className="px-1 py-1">{cell(item, 'thickness')}</td>
                  <td className="px-1 py-1 tabular-nums">{cell(item, 'qty')}</td>
                  <td className="px-1 py-1">{cell(item, 'op')}</td>
                  <td className="px-1 py-1">{cell(item, 'executor')}</td>
                  <td className="px-1 py-1">{cell(item, 'rowStatus')}</td>
                  <td className="px-1 py-1">{cell(item, 'note')}</td>
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
            </Fragment>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <p className="text-center text-[var(--ink-3)] text-[13px] py-14">Позицій немає</p>
      )}

      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--ink-3)] flex-wrap">
        <Check size={12} /> Клік по клітинці — редагування · ✏️ — перейменувати · ➕ — додати операцію ·
        <Filter size={11} className="inline" /> у шапці — фільтр колонки · Shift+клік — діапазон
        {filterCount > 0 && (
          <>
            <span className="ml-2 font-bold" style={{ color: 'var(--ink-2)' }}>
              Показано {shown.length} з {items.length}
            </span>
            <button onClick={() => setColFilters({})}
              className="px-2 py-0.5 rounded-lg font-bold press"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              скинути фільтри ({filterCount})
            </button>
          </>
        )}
      </div>

      {pop && (
        <ListPopover
          state={pop}
          onPick={v => commit(pop.row, pop.field, v, pop.current)}
          onClose={() => setPop(null)}
        />
      )}

      {filterPop && (
        <ColumnFilterPopover
          label={filterPop.label}
          rect={filterPop.rect}
          values={valuesOf(filterPop.field)}
          selected={colFilters[filterPop.field] || new Set()}
          onChange={set => setColFilters(prev => ({ ...prev, [filterPop.field]: set }))}
          onClose={() => setFilterPop(null)}
        />
      )}
    </div>
  );
}

interface Col { key: string; label: string; w: string; filter?: boolean }

const COLS_PROD: Col[] = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[280px]' },
  { key: 'material', label: 'Матеріал', w: 'w-[110px]', filter: true },
  { key: 'thickness', label: 'S', w: 'w-[60px]', filter: true },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'op', label: 'Операція', w: 'w-[150px]', filter: true },
  { key: 'executor', label: 'Виконавець', w: 'w-[160px]', filter: true },
  { key: 'rowStatus', label: 'Статус', w: 'w-[150px]', filter: true },
  { key: 'note', label: 'Примітка', w: 'min-w-[160px]' },
  { key: 'add', label: '', w: 'w-[34px]' },
];

const COLS_LOG: Col[] = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[280px]' },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'executor', label: 'Виконавець', w: 'w-[150px]', filter: true },
  { key: 'rowStatus', label: 'Статус', w: 'w-[140px]', filter: true },
  { key: 'delivery', label: 'Доставка', w: 'min-w-[200px]' },
  { key: 'note', label: 'Примітка', w: 'min-w-[130px]' },
];

const COLS_BUH: Col[] = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[240px]' },
  { key: 'op', label: 'Операція', w: 'w-[130px]', filter: true },
  { key: 'executor', label: 'Виконавець', w: 'w-[150px]', filter: true },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'clientPrice', label: 'Ціна', w: 'w-[90px]' },
  { key: 'clientSum', label: 'Сума', w: 'w-[100px]' },
  { key: 'payStatus', label: 'Оплата', w: 'w-[160px]', filter: true },
  { key: 'invoice', label: 'Рахунок клієнту', w: 'w-[120px]' },
  // Рахунок, який виставив нам виконавець — заповнюється прив'язкою
  { key: 'execInvoice', label: 'Рахунок від викон.', w: 'w-[130px]', filter: true },
  { key: 'note', label: 'Примітка', w: 'min-w-[140px]' },
];

/** Зона «Прорахунок»: те, з чого рахується вартість роботи. */
const COLS_CALC: Col[] = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[230px]' },
  { key: 'assembly', label: 'Збірка', w: 'w-[150px]', filter: true },
  { key: 'op', label: 'Операція', w: 'w-[130px]', filter: true },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]' },
  { key: 'assignedQty', label: 'Призн.', w: 'w-[80px]' },
  { key: 'time', label: 'Час/шт, год', w: 'w-[95px]' },
  { key: 'timeAll', label: 'Час всього', w: 'w-[100px]' },
  { key: 'clientPrice', label: 'Ціна/шт', w: 'w-[90px]' },
  { key: 'clientSum', label: 'Сума', w: 'w-[100px]' },
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

  /** Свій текст: те, чого немає в списку, можна вписати вручну. */
  const custom = q.trim();
  const showCustom = !!custom && !options.some(o => o.toLowerCase() === custom.toLowerCase());

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
        <div className="flex-shrink-0 p-2 border-b hairline">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Enter') {
                  if (showCustom) onPick(custom);
                  else if (options.length === 1) onPick(options[0]);
                }
              }}
              placeholder="Пошук або свій текст…"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 text-[12px]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar p-1">
          {showCustom && (
            <button
              onClick={() => onPick(custom)}
              className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-xl text-[12.5px] press mb-0.5"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Plus size={13} className="flex-shrink-0" />
              <span className="flex-1 truncate font-semibold">Вписати «{custom}»</span>
            </button>
          )}
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
          {!options.length && !showCustom && (
            <p className="text-center text-[11.5px] py-3" style={{ color: 'var(--ink-3)' }}>Нічого не знайдено</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Фільтр колонки: значення з кількостями, мультивибір, пошук. */
function ColumnFilterPopover({ label, rect, values, selected, onChange, onClose }: {
  label: string;
  rect: { left: number; top: number; bottom: number };
  values: Array<{ v: string; n: number }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? values.filter(x => x.v.toLowerCase().includes(query)) : values;
  }, [values, q]);

  const H = Math.min(340, 120 + list.length * 30);
  const below = rect.bottom + H + 8 < window.innerHeight;
  const top = below ? rect.bottom + 4 : Math.max(8, rect.top - H - 4);
  const left = Math.min(rect.left, window.innerWidth - 268);

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  }

  return (
    <div className="fixed inset-0 z-[75]" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className="absolute w-[260px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-pop-in flex flex-col"
        style={{ left, top, maxHeight: 340 }}
      >
        <div className="flex-shrink-0 px-2.5 pt-2 pb-1.5 border-b hairline">
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
            Фільтр · {label}
          </p>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
              placeholder="Пошук значення…"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 text-[12px]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scrollbar p-1">
          {list.map(({ v, n }) => {
            const on = selected.has(v);
            return (
              <button key={v} onClick={() => toggle(v)}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-xl text-[12.5px] hover:bg-gray-50 press">
                {on
                  ? <CheckSquare size={14} className="flex-shrink-0 text-[var(--accent)]" />
                  : <Square size={14} className="flex-shrink-0 text-gray-300" />}
                <span className="flex-1 truncate" style={{ color: v === '—' ? 'var(--ink-3)' : 'var(--ink)' }}>{v}</span>
                <span className="text-[10.5px] tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{n}</span>
              </button>
            );
          })}
          {!list.length && (
            <p className="text-center text-[11.5px] py-3" style={{ color: 'var(--ink-3)' }}>Нічого не знайдено</p>
          )}
        </div>

        <div className="flex-shrink-0 flex gap-1 p-1.5 border-t hairline">
          <button onClick={() => onChange(new Set(list.map(x => x.v)))}
            className="flex-1 py-1.5 rounded-xl text-[11.5px] font-bold press" style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
            Всі видимі
          </button>
          <button onClick={() => onChange(new Set())}
            className="flex-1 py-1.5 rounded-xl text-[11.5px] font-bold press" style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
            Очистити
          </button>
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-[11.5px] font-bold text-white press" style={{ background: 'var(--accent)' }}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
