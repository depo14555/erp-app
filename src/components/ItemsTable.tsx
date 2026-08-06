// ================================================================
//  src/components/ItemsTable.tsx
//  Десктопний перегляд позицій замовлення у вигляді таблиці —
//  як у Google Таблиці, але з редагуванням клітинок на місці.
//  Клік по клітинці → інлайн-редактор (список або поле) → Enter/blur
//  зберігає у таблицю.
// ================================================================

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Check, Loader2 } from 'lucide-react';
import { OrderItem, Lists, statusStyle } from '../types';

type Field = 'op' | 'executor' | 'qty' | 'assignedQty' | 'material' | 'thickness' | 'note' | 'rowStatus';

interface Props {
  items: OrderItem[];
  lists: Lists | null;
  onSave: (row: number, field: Field, value: string) => Promise<void>;
}

const COLS: Array<{ key: Field | 'name' | 'id'; label: string; w: string; type?: 'list' | 'text' | 'num' }> = [
  { key: 'id', label: 'ID', w: 'w-[110px]' },
  { key: 'name', label: 'Найменування', w: 'min-w-[280px]' },
  { key: 'material', label: 'Матеріал', w: 'w-[110px]', type: 'list' },
  { key: 'thickness', label: 'S', w: 'w-[60px]', type: 'text' },
  { key: 'qty', label: 'К-сть', w: 'w-[70px]', type: 'num' },
  { key: 'op', label: 'Операція', w: 'w-[150px]', type: 'list' },
  { key: 'executor', label: 'Виконавець', w: 'w-[160px]', type: 'list' },
  { key: 'rowStatus', label: 'Статус', w: 'w-[150px]', type: 'list' },
  { key: 'note', label: 'Примітка', w: 'min-w-[160px]', type: 'text' },
];

export default function ItemsTable({ items, lists, onSave }: Props) {
  const [edit, setEdit] = useState<{ row: number; field: Field } | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (edit) inputRef.current?.focus(); }, [edit]);

  function optionsFor(field: Field): string[] | null {
    if (!lists) return null;
    if (field === 'op') return lists.operations;
    if (field === 'executor') return lists.executors;
    if (field === 'rowStatus') return lists.rowStatus;
    if (field === 'material') return lists.materials;
    return null;
  }

  async function commit(item: OrderItem, field: Field, value: string) {
    setEdit(null);
    const current = String((item as any)[field] ?? '');
    if (value === current) return;
    const key = `${item.row}:${field}`;
    setSaving(key);
    try {
      await onSave(item.row, field, value);
    } finally {
      setSaving(null);
    }
  }

  function Cell({ item, field }: { item: OrderItem; field: Field }) {
    const value = String((item as any)[field] ?? '');
    const isEditing = edit?.row === item.row && edit.field === field;
    const key = `${item.row}:${field}`;
    const opts = optionsFor(field);

    if (isEditing) {
      if (opts) {
        return (
          <select
            autoFocus
            defaultValue={value}
            onChange={e => commit(item, field, e.target.value)}
            onBlur={() => setEdit(null)}
            className="w-full px-2 py-1 rounded-lg border border-[var(--accent)] outline-none text-[12.5px] bg-white"
          >
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
            {value && !opts.includes(value) && <option value={value}>{value}</option>}
          </select>
        );
      }
      return (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(item, field, draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(item, field, draft);
            if (e.key === 'Escape') setEdit(null);
          }}
          className="w-full px-2 py-1 rounded-lg border border-[var(--accent)] outline-none text-[12.5px]"
        />
      );
    }

    if (field === 'rowStatus') {
      const st = statusStyle(value);
      return (
        <button
          onClick={() => { setDraft(value); setEdit({ row: item.row, field }); }}
          className="w-full text-left px-2 py-1 rounded-lg text-[11.5px] font-semibold press"
          style={{ background: value ? st.bg : 'transparent', color: value ? st.fg : 'var(--ink-3)' }}
        >
          {saving === key ? <Loader2 size={12} className="animate-spin inline" /> : (value || '—')}
        </button>
      );
    }

    return (
      <button
        onClick={() => { setDraft(value); setEdit({ row: item.row, field }); }}
        className="w-full text-left px-2 py-1 rounded-lg text-[12.5px] hover:bg-gray-50 truncate press"
        style={{ color: value ? 'var(--ink)' : 'var(--ink-3)' }}
        title={value}
      >
        {saving === key
          ? <Loader2 size={12} className="animate-spin inline" />
          : (value || '—')}
      </button>
    );
  }

  return (
    <div className="overflow-auto thin-scrollbar h-full">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#FAFBFC]">
            {COLS.map(c => (
              <th key={c.key}
                className={`${c.w} text-left font-semibold text-[11px] uppercase tracking-wide text-[var(--ink-3)] px-3 py-2 border-b hairline whitespace-nowrap`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.row} className="border-b hairline hover:bg-[#FCFCFD] group">
              <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--ink-3)] whitespace-nowrap">
                {item.id}
              </td>
              <td className="px-3 py-1.5">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer"
                    className="text-[var(--accent)] hover:underline inline-flex items-start gap-1">
                    <span className="line-clamp-1">{item.name}</span>
                    <ExternalLink size={11} className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <span className="line-clamp-1">{item.name}</span>
                )}
              </td>
              <td className="px-1 py-1"><Cell item={item} field="material" /></td>
              <td className="px-1 py-1"><Cell item={item} field="thickness" /></td>
              <td className="px-1 py-1 tabular-nums"><Cell item={item} field="qty" /></td>
              <td className="px-1 py-1"><Cell item={item} field="op" /></td>
              <td className="px-1 py-1"><Cell item={item} field="executor" /></td>
              <td className="px-1 py-1"><Cell item={item} field="rowStatus" /></td>
              <td className="px-1 py-1"><Cell item={item} field="note" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <p className="text-center text-[var(--ink-3)] text-[13px] py-14">Позицій немає</p>
      )}

      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--ink-3)]">
        <Check size={12} /> Клік по клітинці — редагування, Enter — зберегти в таблицю
      </div>
    </div>
  );
}
