// ================================================================
//  src/components/BulkEditSheet.tsx — масова зміна полів позицій.
//  Вибрали галочками кілька рядків → задали одне значення → воно
//  пишеться в усі вибрані рядки одним запитом (як протягування
//  значення по стовпцю в таблиці).
// ================================================================

import { useState } from 'react';
import { X, Loader2, Layers, Check } from 'lucide-react';
import { api } from '../api';
import { Lists, OrderItem, statusStyle } from '../types';

interface Props {
  rows: number[];
  items: OrderItem[];
  lists: Lists | null;
  rowStatusList: string[];
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onDone: () => void;
}

type FieldKey = 'rowStatus' | 'op' | 'executor' | 'material' | 'thickness'
  | 'qty' | 'assignedQty' | 'assembly' | 'time' | 'clientPrice' | 'execPrice' | 'note';

const FIELDS: Array<{ key: FieldKey; label: string; hint: string }> = [
  { key: 'rowStatus',   label: 'Статус',        hint: 'стан позиції' },
  { key: 'op',          label: 'Операція',      hint: 'що робимо' },
  { key: 'executor',    label: 'Виконавець',    hint: 'хто робить' },
  { key: 'material',    label: 'Матеріал',      hint: 'Ст.3, нерж…' },
  { key: 'thickness',   label: 'Товщина S',     hint: 'мм' },
  { key: 'qty',         label: 'К-сть',         hint: 'загальна' },
  { key: 'assignedQty', label: 'Призначено',    hint: 'виконавцю' },
  { key: 'assembly',    label: 'Збірка',        hint: 'назва вузла' },
  { key: 'time',        label: 'Час на 1 шт',   hint: 'год' },
  { key: 'clientPrice', label: 'Ціна клієнту',  hint: 'за 1 шт' },
  { key: 'execPrice',   label: 'Ціна виконавця', hint: 'за 1 шт' },
  { key: 'note',        label: 'Примітка',      hint: 'текст' },
];

export default function BulkEditSheet({ rows, items, lists, rowStatusList, onClose, onToast, onDone }: Props) {
  const [field, setField] = useState<FieldKey>('rowStatus');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  /** Готові варіанти для поля — зі списків таблиці плюс те, що вже є в позиціях. */
  function options(): string[] {
    const fromLists =
      field === 'op' ? lists?.operations :
      field === 'executor' ? lists?.executors :
      field === 'material' ? lists?.materials :
      field === 'rowStatus' ? (rowStatusList.length ? rowStatusList : lists?.rowStatus) : null;
    const used = items.map(i => String((i as any)[field] ?? '').trim()).filter(Boolean);
    return [...new Set([...(fromLists || []), ...used])].slice(0, 40);
  }

  const opts = options();
  const isStatus = field === 'rowStatus';

  async function apply() {
    const v = value.trim();
    if (!v) { onToast('Вкажіть значення', true); return; }
    setBusy(true);
    try {
      await api.bulkUpdate(rows, { [field]: v });
      const label = FIELDS.find(f => f.key === field)?.label || field;
      onToast(`✅ ${label} «${v}» → ${rows.length} поз.`);
      onDone();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося застосувати', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[560px] max-h-[92dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Змінити для {rows.length} позицій</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              одне значення запишеться в усі вибрані рядки
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-3)' }}>
              Що змінюємо
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map(f => {
                const on = field === f.key;
                return (
                  <button key={f.key} onClick={() => { setField(f.key); setValue(''); }} title={f.hint}
                    className="px-2.5 py-1.5 rounded-xl text-[12px] font-bold transition-colors"
                    style={on ? { background: 'var(--ink)', color: '#fff' } : { background: 'var(--bg)', color: 'var(--ink-2)' }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-3)' }}>
              Нове значення
            </p>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(); }}
              placeholder={FIELDS.find(f => f.key === field)?.hint}
              autoFocus
              className="k-input w-full px-3 py-2.5 rounded-xl outline-none text-[13.5px]"
            />
            {opts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {opts.map(o => {
                  const st = isStatus ? statusStyle(o) : null;
                  const on = value === o;
                  return (
                    <button key={o} onClick={() => setValue(o)}
                      className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold transition-colors flex items-center gap-1"
                      style={on
                        ? { background: 'var(--accent)', color: '#fff' }
                        : st ? { background: st.bg, color: st.fg } : { background: 'var(--bg)', color: 'var(--ink-2)' }}>
                      {on && <Check size={11} />} {o}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Можна вписати своє значення — не обов'язково брати зі списку.
            </p>
          </div>

          <div className="rounded-xl bg-[var(--bg)] ring-1 ring-gray-200/70 p-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
              Зміняться позиції
            </p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
              {items.slice(0, 6).map(i => i.name).join('; ')}
              {items.length > 6 ? ` … і ще ${items.length - 6}` : ''}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 border-t hairline p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={apply} disabled={busy || !value.trim()}
            className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: '#4F46E5' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
            Застосувати до {rows.length} позицій
          </button>
        </div>
      </div>
    </div>
  );
}
