// ================================================================
//  src/components/CalcSheet.tsx — 🧮 Прорахунок замовлення.
//  Ліворуч — позиції з часом і ціною (що вибрано, те й рахується),
//  праворуч — «картки»: групи позицій + інші витрати, з назвою для
//  рахунку («Порізка комплект металу 3мм») і прив'язкою оплати.
//  Зберігається в таблиці-хабі, тож бачать усі.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X, Calculator, Loader2, Plus, Trash2, Save, Clock, Layers,
  ArrowRight, Wallet, CheckSquare, Square,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { api } from '../api';
import { OrderDetail, OrderItem, CalcBundle, CalcData } from '../types';
import { num, qtyOf, timeAllOf } from './ItemsTable';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Ціни записані в картку — оновити замовлення. */
  onApplied: () => void;
}

/** Класифікація групи — як це називається у нас і в рахунку. */
const KINDS = [
  'Порізка металу', 'Гнуття', 'Токарні роботи', 'Фрезерні роботи',
  'Зварювальні роботи', 'Покриття', 'Матеріал', 'Логістика', 'Інше',
];

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function uid(): string {
  return 'b' + Math.random().toString(36).slice(2, 9);
}

export default function CalcSheet({ detail, onClose, onMinimize, onToast, onApplied }: Props) {
  const items = useMemo(() => detail.items.filter(i => !i.group), [detail.items]);
  const [bundles, setBundles] = useState<CalcBundle[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<string>('');
  /** Ціни, введені тут і ще не записані в картку: row → ціна за 1 шт. */
  const [prices, setPrices] = useState<Record<number, string>>({});

  useEffect(() => {
    api.calcGet(detail.header.headerRow)
      .then(r => {
        setBundles(r.data?.bundles || []);
        setUpdatedAt(r.data?.updatedAt || '');
        if (r.data?.bundles?.length) setActive(r.data.bundles[0].id);
      })
      .catch(e => onToast(e?.message || 'Не вдалося прочитати прорахунок', true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byRow = useMemo(() => new Map(items.map(i => [i.row, i])), [items]);
  const priceOf = (i: OrderItem) => (prices[i.row] !== undefined ? num(prices[i.row]) : num(i.clientPrice));
  const sumOf = (i: OrderItem) => priceOf(i) * qtyOf(i);

  /** Рядки, які вже лежать у якійсь групі. */
  const taken = useMemo(() => {
    const s = new Set<number>();
    bundles.forEach(b => b.rows.forEach(r => s.add(r)));
    return s;
  }, [bundles]);

  const totals = useMemo(() => {
    let time = 0, sum = 0;
    items.forEach(i => { time += timeAllOf(i); sum += sumOf(i); });
    const extras = bundles.reduce((s, b) => s + b.extras.reduce((x, e) => x + (e.sum || 0), 0), 0);
    return { time, sum, extras, all: sum + extras };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prices, bundles]);

  function bundleSum(b: CalcBundle): number {
    const rows = b.rows.reduce((s, r) => { const i = byRow.get(r); return s + (i ? sumOf(i) : 0); }, 0);
    return rows + b.extras.reduce((s, e) => s + (e.sum || 0), 0);
  }
  function bundleTime(b: CalcBundle): number {
    return b.rows.reduce((s, r) => { const i = byRow.get(r); return s + (i ? timeAllOf(i) : 0); }, 0);
  }
  function patch(id: string, p: Partial<CalcBundle>) {
    setBundles(prev => prev.map(b => (b.id === id ? { ...b, ...p } : b)));
  }

  function addBundle() {
    const b: CalcBundle = {
      id: uid(), kind: KINDS[0], invoiceName: '', payTo: 'client',
      rows: [...sel], extras: [], note: '',
    };
    setBundles(prev => [...prev, b]);
    setActive(b.id);
    setSel(new Set());
  }
  function addSelected(id: string) {
    if (!sel.size) return;
    patch(id, { rows: [...new Set([...(bundles.find(b => b.id === id)?.rows || []), ...sel])] });
    setSel(new Set());
  }

  async function save() {
    setSaving(true);
    try {
      const data: CalcData = { bundles };
      const res = await api.calcSave(detail.header.headerRow, data);
      setUpdatedAt(res.updatedAt);
      const n = res.bundles;
      const word = n % 10 === 1 && n % 100 !== 11 ? 'група' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'групи' : 'груп');
      onToast(`💾 Прорахунок збережено · ${n} ${word}`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setSaving(false);
    }
  }

  /** Ціни, введені в панелі, записуються в картку (колонка «Ціна клієнту»). */
  async function applyPrices() {
    const rows = Object.keys(prices).map(Number).filter(r => prices[r] !== '' && byRow.has(r));
    if (!rows.length) { onToast('Немає нових цін для запису', true); return; }
    setSaving(true);
    try {
      // однакову ціну пишемо однією дією, різні — по групах значень
      const byPrice = new Map<string, number[]>();
      rows.forEach(r => {
        const v = String(num(prices[r]));
        byPrice.set(v, [...(byPrice.get(v) || []), r]);
      });
      for (const [price, rs] of byPrice) {
        await api.bulkUpdate(rs, { clientPrice: price });
      }
      onToast(`✅ Ціни записані в картку: ${rows.length} поз.`);
      setPrices({});
      onApplied();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося записати ціни', true);
    } finally {
      setSaving(false);
    }
  }

  function toggleRow(row: number) {
    setSel(prev => { const n = new Set(prev); n.has(row) ? n.delete(row) : n.add(row); return n; });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative w-full lg:w-[1180px] max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Calculator size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Прорахунок</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {updatedAt ? ` · збережено ${updatedAt}` : ' · ще не збережено'}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 mr-2">
            <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              <Clock size={11} className="inline -mt-0.5" /> {totals.time.toFixed(1)} год
            </span>
            <span className="text-[14px] font-bold tabular-nums">{money(totals.all)} грн</span>
          </div>
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(380px,460px)]">

            {/* ЛІВОРУЧ: позиції */}
            <div className="flex flex-col min-h-0 border-r hairline">
              <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
                <button onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map(i => i.row)))}
                  className="p-1 press" aria-label="Вибрати все">
                  {sel.size === items.length && items.length > 0
                    ? <CheckSquare size={15} className="text-[var(--accent)]" />
                    : <Square size={15} className="text-gray-300" />}
                </button>
                <p className="text-[12px] font-bold flex-1">
                  Позиції <span style={{ color: 'var(--ink-3)' }}>({items.length})</span>
                </p>
                {sel.size > 0 && (
                  <button onClick={addBundle}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold text-white press"
                    style={{ background: '#0D9488' }}>
                    <Layers size={12} /> Об'єднати {sel.size} у групу
                  </button>
                )}
                {sel.size > 0 && active && (
                  <button onClick={() => addSelected(active)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <ArrowRight size={12} /> у відкриту
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-auto thin-scrollbar">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-[#FAFBFC] z-10">
                    <tr>
                      {['', 'Найменування', 'Призн.', 'Час всього', 'Ціна/шт', 'Сума'].map((h, i) => (
                        <th key={i} className="text-left font-semibold text-[10.5px] uppercase tracking-wide text-[var(--ink-3)] px-2 py-2 border-b hairline whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(i => {
                      const inBundle = taken.has(i.row);
                      return (
                        <tr key={i.row} className="border-b hairline hover:bg-[#FCFCFD]"
                          style={sel.has(i.row) ? { background: 'var(--accent-soft)' } : undefined}>
                          <td className="px-2 py-1.5 w-[32px]">
                            <button onClick={() => toggleRow(i.row)} className="flex press" aria-label="Вибрати">
                              {sel.has(i.row)
                                ? <CheckSquare size={14} className="text-[var(--accent)]" />
                                : <Square size={14} className="text-gray-300" />}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 max-w-[260px]">
                            <span className="block truncate">{i.name}</span>
                            <span className="block text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>
                              {[i.assembly, i.op, i.material, i.thickness && `S${i.thickness}`].filter(Boolean).join(' · ') || i.id}
                              {inBundle && <span className="text-teal-600 font-bold"> · у групі</span>}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{qtyOf(i) || '—'}</td>
                          <td className="px-2 py-1.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                            {timeAllOf(i) ? `${timeAllOf(i).toFixed(2)} год` : '—'}
                          </td>
                          <td className="px-1 py-1 w-[86px]">
                            <input
                              value={prices[i.row] ?? i.clientPrice ?? ''}
                              onChange={e => setPrices(p => ({ ...p, [i.row]: e.target.value }))}
                              inputMode="decimal" placeholder="0"
                              className="w-full px-1.5 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px] tabular-nums text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums font-semibold whitespace-nowrap">
                            {sumOf(i) ? money(sumOf(i)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  Час: <b style={{ color: 'var(--ink-2)' }}>{totals.time.toFixed(1)} год</b> ·
                  Роботи: <b style={{ color: 'var(--ink-2)' }}>{money(totals.sum)}</b> ·
                  Інші: <b style={{ color: 'var(--ink-2)' }}>{money(totals.extras)}</b>
                </span>
                <button onClick={applyPrices} disabled={saving || !Object.keys(prices).length}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-40"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Save size={12} /> Записати ціни в картку
                </button>
              </div>
            </div>

            {/* ПРАВОРУЧ: групи-картки */}
            <div className="flex flex-col min-h-0 bg-[#FAFBFC]">
              <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
                <p className="text-[12px] font-bold flex-1">Групи для рахунку ({bundles.length})</p>
                <button onClick={addBundle}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                  style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                  <Plus size={12} /> Нова
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                {!bundles.length && (
                  <p className="text-center text-[12px] py-10" style={{ color: 'var(--ink-3)' }}>
                    Виберіть позиції ліворуч і натисніть «Об'єднати у групу».<br />
                    Група — це один рядок майбутнього рахунку.
                  </p>
                )}

                {bundles.map(b => {
                  const on = active === b.id;
                  return (
                    <div key={b.id}
                      onClick={() => setActive(b.id)}
                      className={`rounded-2xl bg-white p-2.5 ring-1 transition-colors ${on ? 'ring-teal-300' : 'ring-gray-200/70'}`}>
                      <div className="flex items-center gap-1.5">
                        <select value={b.kind} onChange={e => patch(b.id, { kind: e.target.value })}
                          className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 text-[11.5px] font-bold outline-none">
                          {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                          {!KINDS.includes(b.kind) && <option value={b.kind}>{b.kind}</option>}
                        </select>
                        <span className="ml-auto text-[13px] font-bold tabular-nums">{money(bundleSum(b))} грн</span>
                        <button onClick={() => setBundles(prev => prev.filter(x => x.id !== b.id))}
                          className="p-1 rounded-lg press text-red-500" aria-label="Видалити групу">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <input
                        value={b.invoiceName}
                        onChange={e => patch(b.id, { invoiceName: e.target.value })}
                        placeholder="Назва в рахунку — напр. «Порізка комплект металу 3мм»"
                        className="mt-1.5 w-full px-2 py-1.5 rounded-lg bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]"
                      />

                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          <Wallet size={10} className="inline -mt-0.5" /> оплата:
                        </span>
                        {([['client', 'клієнт нам'], ['executor', 'ми виконавцю']] as const).map(([v, label]) => (
                          <button key={v} onClick={() => patch(b.id, { payTo: v })}
                            className="px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors"
                            style={b.payTo === v
                              ? { background: v === 'client' ? '#ECFDF5' : '#FFF7ED', color: v === 'client' ? '#059669' : '#C2410C' }
                              : { background: '#F3F4F6', color: 'var(--ink-3)' }}>
                            {label}
                          </button>
                        ))}
                        <span className="ml-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          {b.rows.length} поз. · {bundleTime(b).toFixed(1)} год
                        </span>
                      </div>

                      {/* Позиції групи */}
                      {b.rows.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {b.rows.map(r => {
                            const i = byRow.get(r);
                            if (!i) return null;
                            return (
                              <div key={r} className="flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded-lg bg-gray-50">
                                <span className="flex-1 truncate">{i.name}</span>
                                <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                                  {qtyOf(i)}×{money(priceOf(i))}
                                </span>
                                <span className="tabular-nums font-semibold flex-shrink-0">{money(sumOf(i))}</span>
                                <button onClick={() => patch(b.id, { rows: b.rows.filter(x => x !== r) })}
                                  className="p-0.5 press flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-label="Прибрати">
                                  <X size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Інші витрати */}
                      <div className="mt-1.5 space-y-0.5">
                        {b.extras.map((e, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <input value={e.label}
                              onChange={ev => patch(b.id, { extras: b.extras.map((x, k) => k === idx ? { ...x, label: ev.target.value } : x) })}
                              placeholder="Витрата — напр. «метал 3мм, лист»"
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[11.5px]" />
                            <input value={e.sum || ''}
                              onChange={ev => patch(b.id, { extras: b.extras.map((x, k) => k === idx ? { ...x, sum: num(ev.target.value) } : x) })}
                              inputMode="decimal" placeholder="0"
                              className="w-[84px] px-2 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[11.5px] tabular-nums text-right" />
                            <button onClick={() => patch(b.id, { extras: b.extras.filter((_, k) => k !== idx) })}
                              className="p-1 press text-red-500 flex-shrink-0" aria-label="Прибрати витрату">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => patch(b.id, { extras: [...b.extras, { label: '', sum: 0 }] })}
                          className="text-[11px] font-bold press px-1.5 py-1 rounded-lg" style={{ color: 'var(--accent)' }}>
                          + інші витрати (порізка, метал, доставка…)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex-shrink-0 border-t hairline p-2.5 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[12px] font-bold">Разом по замовленню</span>
                  <span className="text-[16px] font-bold tabular-nums">{money(totals.all)} грн</span>
                </div>
                <button onClick={save} disabled={saving}
                  className="w-full py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#0D9488' }}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Зберегти прорахунок
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
