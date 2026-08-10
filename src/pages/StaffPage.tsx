// ================================================================
//  src/pages/StaffPage.tsx — 👷 Штат працівників.
//  Свої люди: посада, ставка, контакти, графік, статус. Дані живуть
//  на аркуші «Штат» таблиці-хаба (створюється автоматично).
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Search, X, Save, Trash2, Phone, Mail, UserRound, BadgeCheck,
} from 'lucide-react';
import { api } from '../api';
import { StaffData, StaffRow } from '../types';

interface Props {
  onToast: (msg: string, err?: boolean) => void;
  refreshSignal?: number;
}

const EMPTY: StaffRow = { row: 0 };
/** Підказки для полів (за номером колонки аркуша). */
const HINTS: Record<number, string> = {
  1: 'Прізвище Ім\'я', 2: 'Оператор лазера, слюсар…', 3: '+380…', 4: 'пошта',
  5: '180', 6: 'грн/год · грн/зміна · грн/міс', 7: '5/2, зміни', 8: 'дд.мм.рррр',
  9: 'Працює / Відпустка / Звільнений', 10: 'що знає, допуски, нотатки',
};
const STATUS_OPTIONS = ['Працює', 'Відпустка', 'Лікарняний', 'Звільнений'];

export default function StaffPage({ onToast, refreshSignal }: Props) {
  const [data, setData] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<StaffRow | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.staff());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати штат', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => {
      if (!query) return true;
      return Object.values(r).join(' ').toLowerCase().includes(query);
    });
  }, [data, q]);

  const val = (r: StaffRow, col: number) => String(r[col] ?? '');
  const working = (r: StaffRow) => !/звільн/i.test(val(r, 9));

  function open(r: StaffRow) {
    setEdit(r);
    setConfirmDel(false);
    const d: Record<string, string> = {};
    (data?.fields || []).forEach(f => { d[f.col] = val(r, f.col); });
    setDraft(d);
  }

  async function save() {
    if (!edit) return;
    if (!(draft['1'] || '').trim()) { onToast('Вкажіть ПІБ', true); return; }
    setSaving(true);
    try {
      const res = await api.staffSave(edit.row, draft);
      onToast(res.isNew ? `✅ Додано «${draft['1']}»` : `💾 Збережено «${draft['1']}»`);
      setEdit(null);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!edit || !edit.row) return;
    setSaving(true);
    try {
      await api.staffSave(edit.row, {}, true);
      onToast('Працівника видалено з переліку');
      setEdit(null);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося видалити', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[420px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Пошук за ПІБ, посадою, телефоном…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]" />
        </div>
        <p className="hidden md:block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          Працює: <b style={{ color: 'var(--ink-2)' }}>{(data?.rows || []).filter(working).length}</b> з {data?.rows.length ?? 0}
        </p>
        <button onClick={() => open(EMPTY)}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold text-white press"
          style={{ background: 'var(--accent)' }}>
          <Plus size={14} /> Новий працівник
        </button>
        {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        {!data && loading && (
          <div className="py-14 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}
        {data && rows.length === 0 && (
          <p className="text-center text-[12.5px] py-14 rounded-2xl bg-white ring-1 ring-gray-200/60" style={{ color: 'var(--ink-3)' }}>
            {data.rows.length ? 'Нічого не знайдено' : 'Штат порожній — додайте першого працівника'}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {rows.map(r => {
            const on = working(r);
            return (
              <button key={r.row} onClick={() => open(r)}
                className="text-left bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 press hover:ring-gray-300">
                <div className="flex items-start gap-2">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={on ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: '#F3F4F6', color: '#94A3B8' }}>
                    <UserRound size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[13.5px] truncate">{val(r, 1) || '—'}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {val(r, 2) || 'без посади'}
                    </span>
                  </span>
                  {val(r, 9) && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={on ? { background: '#ECFDF5', color: '#059669' } : { background: '#FEF2F2', color: '#B91C1C' }}>
                      {val(r, 9)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                  {val(r, 3) && <span className="flex items-center gap-1"><Phone size={11} /> {val(r, 3)}</span>}
                  {val(r, 5) && (
                    <span className="ml-auto font-bold tabular-nums">
                      {val(r, 5)} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{val(r, 6)}</span>
                    </span>
                  )}
                </div>
                {val(r, 10) && (
                  <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--ink-3)' }}>{val(r, 10)}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {edit && data && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setEdit(null)} />
          <div className="relative w-full lg:w-[640px] max-h-[94dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                <BadgeCheck size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] leading-tight">{edit.row ? 'Працівник' : 'Новий працівник'}</p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                  {edit.row ? `рядок ${edit.row} в аркуші «Штат»` : 'буде додано в кінець аркуша'}
                </p>
              </div>
              <button onClick={() => setEdit(null)} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data.fields.map(f => (
                  <label key={f.col} className={f.col === 10 ? 'sm:col-span-2' : ''}>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
                      {f.label}
                    </span>
                    {f.col === 10 ? (
                      <textarea rows={2} value={draft[f.col] || ''}
                        onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                        placeholder={HINTS[f.col]}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px] resize-y" />
                    ) : (
                      <input value={draft[f.col] || ''}
                        onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                        placeholder={HINTS[f.col]}
                        type={f.col === 4 ? 'email' : 'text'}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px]" />
                    )}
                    {f.col === 9 && (
                      <span className="flex gap-1 mt-1 flex-wrap">
                        {STATUS_OPTIONS.map(o => (
                          <button key={o} onClick={() => setDraft(d => ({ ...d, 9: o }))}
                            className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold press"
                            style={draft['9'] === o
                              ? { background: 'var(--accent)', color: '#fff' }
                              : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                            {o}
                          </button>
                        ))}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {(draft['3'] || draft['4']) && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {draft['3'] && (
                    <a href={`tel:${draft['3'].replace(/\s/g, '')}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press ring-1 ring-gray-200"
                      style={{ color: 'var(--ink-2)' }}>
                      <Phone size={13} /> Подзвонити
                    </a>
                  )}
                  {draft['4'] && (
                    <a href={`mailto:${draft['4']}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press ring-1 ring-gray-200"
                      style={{ color: 'var(--ink-2)' }}>
                      <Mail size={13} /> Написати
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t hairline p-3 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {edit.row > 0 && (
                confirmDel ? (
                  <button onClick={remove} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[12px] font-bold press bg-red-50 text-red-600">
                    <Trash2 size={13} /> Точно видалити?
                  </button>
                ) : (
                  <button onClick={() => { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 4000); }}
                    className="p-2.5 rounded-2xl press text-red-500" aria-label="Видалити">
                    <Trash2 size={15} />
                  </button>
                )
              )}
              <button onClick={save} disabled={saving}
                className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {edit.row ? 'Зберегти' : 'Додати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
