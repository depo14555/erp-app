// ================================================================
//  src/pages/ContractorsPage.tsx — 🤝 Контрагенти з аркуша «Контрагенти».
//  Перелік з пошуком і фільтром за операціями (матриця з таблиці),
//  редагування будь-якого поля і додавання нового контрагента —
//  усе пишеться назад у таблицю.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Search, X, Save, ExternalLink, Phone, MapPin, Check, Building2,
  Wallet, Trash2,
} from 'lucide-react';
import { api } from '../api';
import { ContractorsData, ContractorRow, PriceRow } from '../types';

interface Props {
  onToast: (msg: string, err?: boolean) => void;
  refreshSignal?: number;
}

/** Порожній контрагент для форми додавання. */
const EMPTY: ContractorRow = { row: 0, name: '', values: {}, ops: [], tableUrl: '', invoiceUrl: '' };

export default function ContractorsPage({ onToast, refreshSignal }: Props) {
  const [data, setData] = useState<ContractorsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [fOps, setFOps] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<ContractorRow | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftOps, setDraftOps] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newOp, setNewOp] = useState<{ name: string; group: string } | null>(null);
  /** Прайс відкритого контрагента: операція → значення колонок 3..11. */
  const [prices, setPrices] = useState<Record<string, Record<string, string>>>({});
  const [priceCols, setPriceCols] = useState<Array<{ col: number; label: string }>>([]);
  const [priceBusy, setPriceBusy] = useState('');
  const [openPrice, setOpenPrice] = useState('');   // яка операція розгорнута

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.contractors());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати контрагентів', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => {
      if (fOps.size && ![...fOps].every(op => r.ops.includes(op))) return false;
      if (!query) return true;
      return (r.name + ' ' + Object.values(r.values).join(' ')).toLowerCase().includes(query);
    });
  }, [data, q, fOps]);

  /** Групи операцій — як у шапці таблиці. */
  const opGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    (data?.ops || []).forEach(o => {
      const arr = map.get(o.group) || [];
      arr.push(o.name);
      map.set(o.group, arr);
    });
    return [...map.entries()];
  }, [data]);

  function openEdit(r: ContractorRow) {
    setEdit(r);
    setDraft({ ...r.values });
    setDraftOps(new Set(r.ops));
    setOpenPrice('');
    setPrices({});
    if (r.name) loadPrices(r.name);
  }

  /** Прайс і потужності контрагента — окремий аркуш «Прайси». */
  async function loadPrices(name: string) {
    try {
      const d = await api.prices(name);
      setPriceCols(d.fields.filter(f => f.col >= 3 && f.col <= 11));
      const map: Record<string, Record<string, string>> = {};
      d.rows.forEach((row: PriceRow) => {
        const op = String(row[2] ?? '');
        const vals: Record<string, string> = {};
        for (let c = 3; c <= 11; c++) vals[c] = String(row[c] ?? '');
        map[op] = vals;
      });
      setPrices(map);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати прайс', true);
    }
  }

  async function savePrice(op: string) {
    if (!edit?.name) { onToast('Спершу збережіть контрагента', true); return; }
    setPriceBusy(op);
    try {
      await api.priceSave(edit.name, op, prices[op] || {});
      onToast(`💾 Прайс «${op}» збережено`);
      await loadPrices(edit.name);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти прайс', true);
    } finally {
      setPriceBusy('');
    }
  }

  async function dropPrice(op: string) {
    if (!edit?.name) return;
    setPriceBusy(op);
    try {
      await api.priceSave(edit.name, op, {}, true);
      setPrices(p => { const n = { ...p }; delete n[op]; return n; });
      onToast(`Прайс «${op}» прибрано`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прибрати', true);
    } finally {
      setPriceBusy('');
    }
  }

  /** Помилково додану операцію прибираємо з матриці (колонка аркуша). */
  async function dropOp(name: string) {
    setSaving(true);
    try {
      await api.contractorAddOp(name, '', true);
      onToast(`Операцію «${name}» прибрано з матриці`);
      setDraftOps(prev => { const n = new Set(prev); n.delete(name); return n; });
      await load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прибрати операцію', true);
    } finally {
      setSaving(false);
    }
  }

  /** Нова операція = нова колонка в аркуші «Контрагенти». */
  async function addOp() {
    if (!newOp) return;
    const name = newOp.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.contractorAddOp(name, newOp.group);
      onToast(`✅ Операцію «${name}» додано в матрицю`);
      setNewOp(null);
      setDraftOps(prev => new Set([...prev, name]));
      await load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося додати операцію', true);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!edit) return;
    const name = (draft['1'] || '').trim();
    if (!name) { onToast('Вкажіть назву компанії', true); return; }
    setSaving(true);
    try {
      const ops: Record<string, boolean> = {};
      (data?.ops || []).forEach(o => { ops[o.name] = draftOps.has(o.name); });
      const res = await api.contractorSave(edit.row, draft, ops);
      onToast(res.isNew ? `✅ Додано «${name}»` : `💾 Збережено «${name}»`);
      setEdit(null);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setSaving(false);
    }
  }

  const fieldOf = (col: number) => data?.fields.find(f => f.col === col);
  /** Довгі текстові поля — багаторядкові. */
  const isLong = (col: number) => col >= 5 && col <= 9;

  return (
    <div className="flex flex-col h-full">
      {/* Панель */}
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[420px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Пошук за назвою, телефоном, містом…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]" />
          </div>
          <p className="hidden md:block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
            Показано <b style={{ color: 'var(--ink-2)' }}>{rows.length}</b> з {data?.rows.length ?? 0}
          </p>
          <button onClick={() => openEdit(EMPTY)}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold text-white press"
            style={{ background: 'var(--accent)' }}>
            <Plus size={14} /> Новий контрагент
          </button>
        </div>

        {/* Фільтр за операціями — та сама матриця, що в таблиці */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(data?.ops || []).map(o => {
            const on = fOps.has(o.name);
            return (
              <button key={o.name}
                onClick={() => setFOps(prev => {
                  const n = new Set(prev);
                  n.has(o.name) ? n.delete(o.name) : n.add(o.name);
                  return n;
                })}
                title={o.group}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-colors"
                style={on ? { background: 'var(--ink)', color: '#fff' } : { background: '#fff', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px #E5E7EB' }}>
                {o.name}
              </button>
            );
          })}
          {fOps.size > 0 && (
            <button onClick={() => setFOps(new Set())}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-bold press"
              style={{ color: 'var(--accent)' }}>
              скинути
            </button>
          )}
        </div>
      </div>

      {/* Перелік */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        {!data && loading && (
          <div className="py-14 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}
        {data && rows.length === 0 && (
          <p className="text-center text-[13px] py-14" style={{ color: 'var(--ink-3)' }}>Нічого не знайдено</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {rows.map(r => (
            <button key={r.row} onClick={() => openEdit(r)}
              className="text-left bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 press hover:ring-gray-300">
              <div className="flex items-start gap-2">
                <span className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[13.5px] truncate">{r.name || '—'}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                    {[r.values['2'], r.values['4']].filter(Boolean).join(' · ') || 'без деталей'}
                  </p>
                </div>
                {r.tableUrl && (
                  <a href={r.tableUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg press flex-shrink-0" style={{ color: 'var(--ink-3)' }} title="Таблиця виконавця">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>

              {r.values['3'] && (
                <p className="text-[11.5px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                  <Phone size={11} /> {r.values['3']}
                </p>
              )}
              {r.values['5'] && (
                <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--ink-3)' }}>{r.values['5']}</p>
              )}

              {r.ops.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.ops.map(op => (
                    <span key={op} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                      {op}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Редагування / новий */}
      {edit && data && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setEdit(null)} />
          <div className="relative w-full lg:w-[760px] max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                <Building2 size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] leading-tight">
                  {edit.row ? 'Контрагент' : 'Новий контрагент'}
                </p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                  {edit.row ? `рядок ${edit.row} в аркуші «Контрагенти»` : 'буде додано в кінець аркуша'}
                </p>
              </div>
              <button onClick={() => setEdit(null)} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {/* Поля з таблиці */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data.fields.map(f => (
                  <label key={f.col} className={isLong(f.col) ? 'sm:col-span-2' : ''}>
                    <span className="block text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
                      {f.label}
                    </span>
                    {isLong(f.col) ? (
                      <textarea rows={2} value={draft[f.col] || ''}
                        onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px] resize-y" />
                    ) : (
                      <input value={draft[f.col] || ''}
                        onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                        placeholder={f.col === 1 ? 'Назва компанії' : ''}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px]" />
                    )}
                  </label>
                ))}
              </div>

              {/* Матриця операцій */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    Що вміє робити
                  </p>
                  <button onClick={() => setNewOp({ name: '', group: opGroups[0]?.[0] || '' })}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold press"
                    style={{ color: 'var(--accent)' }}
                    title="Додати нову операцію в матрицю (нова колонка в аркуші)">
                    <Plus size={12} /> операція
                  </button>
                </div>

                {newOp && (
                  <div className="mb-2 p-2.5 rounded-xl ring-1 ring-gray-200 bg-[#FAFBFC] flex items-center gap-1.5 flex-wrap">
                    <input autoFocus value={newOp.name}
                      onChange={e => setNewOp({ ...newOp, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') addOp(); if (e.key === 'Escape') setNewOp(null); }}
                      placeholder="Назва операції"
                      className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12.5px]" />
                    <select value={newOp.group} onChange={e => setNewOp({ ...newOp, group: e.target.value })}
                      className="px-2 py-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-[12px] outline-none">
                      {opGroups.map(([g]) => <option key={g} value={g}>{g}</option>)}
                      <option value="">без групи</option>
                    </select>
                    <button onClick={addOp} disabled={saving || !newOp.name.trim()}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white press disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}>Додати</button>
                    <button onClick={() => setNewOp(null)} className="p-1.5 press" style={{ color: 'var(--ink-3)' }} aria-label="Скасувати">
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {opGroups.map(([group, names]) => (
                    <div key={group}>
                      <p className="text-[10.5px] mb-1" style={{ color: 'var(--ink-3)' }}>{group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {names.map(op => {
                          const on = draftOps.has(op);
                          return (
                            <span key={op} className="inline-flex items-center rounded-xl"
                              style={on
                                ? { background: '#ECFDF5', boxShadow: 'inset 0 0 0 1px #A7F3D0' }
                                : { background: '#F3F4F6' }}>
                              <button
                                onClick={() => setDraftOps(prev => {
                                  const n = new Set(prev);
                                  n.has(op) ? n.delete(op) : n.add(op);
                                  return n;
                                })}
                                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-[12px] font-bold transition-colors"
                                style={{ color: on ? '#059669' : 'var(--ink-3)' }}>
                                {on && <Check size={12} />} {op}
                              </button>
                              <button onClick={() => dropOp(op)} disabled={saving}
                                className="pr-2 pl-0.5 py-1.5 press" style={{ color: '#CBD5E1' }}
                                title={`Прибрати операцію «${op}» з матриці (колонку аркуша)`}
                                aria-label="Прибрати операцію">
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ціни та потужності — по кожній операції, яку вміє контрагент */}
              {draftOps.size > 0 && (
                <div className="rounded-2xl ring-1 ring-gray-200/80 p-3">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-3)' }}>
                    <Wallet size={13} /> Ціни та потужності
                    <span className="font-normal normal-case ml-1" style={{ color: 'var(--ink-3)' }}>
                      підставлятиметься в прорахунок
                    </span>
                  </p>
                  <div className="space-y-1">
                    {[...draftOps].map(op => {
                      const has = !!prices[op];
                      const on = openPrice === op;
                      const v = prices[op] || {};
                      return (
                        <div key={op} className="rounded-xl" style={{ background: on ? '#FAFBFC' : undefined }}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <button onClick={() => setOpenPrice(on ? '' : op)}
                              className="flex-1 min-w-0 text-left text-[12px] font-semibold press truncate">
                              {op}
                            </button>
                            {has && !on && (
                              <span className="text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                                <b>{v[3] || '—'}</b> <span style={{ color: 'var(--ink-3)' }}>{v[4] || ''}</span>
                                {v[6] ? <span style={{ color: 'var(--ink-3)' }}> · {v[6]}</span> : null}
                              </span>
                            )}
                            {!has && !on && (
                              <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>ціни немає</span>
                            )}
                            <button onClick={() => setOpenPrice(on ? '' : op)}
                              className="text-[11px] font-bold press flex-shrink-0" style={{ color: 'var(--accent)' }}>
                              {on ? 'згорнути' : has ? 'змінити' : 'задати'}
                            </button>
                          </div>

                          {on && (
                            <div className="px-2 pb-2.5">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {priceCols.map(f => (
                                  <label key={f.col}>
                                    <span className="block text-[10px] mb-0.5" style={{ color: 'var(--ink-3)' }}>{f.label}</span>
                                    <input value={v[f.col] || ''}
                                      onChange={e => setPrices(p => ({
                                        ...p, [op]: { ...(p[op] || {}), [f.col]: e.target.value },
                                      }))}
                                      inputMode={[3, 5, 7, 8, 9, 10].includes(f.col) ? 'decimal' : undefined}
                                      placeholder={f.col === 4 ? 'грн/шт · грн/м · грн/год' : ''}
                                      className="w-full px-2 py-1.5 rounded-lg bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12px]" />
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => savePrice(op)} disabled={priceBusy === op}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white press disabled:opacity-50"
                                  style={{ background: 'var(--accent)' }}>
                                  {priceBusy === op ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                  Зберегти
                                </button>
                                {has && (
                                  <button onClick={() => dropPrice(op)} disabled={priceBusy === op}
                                    className="p-1.5 press text-red-500" aria-label="Прибрати прайс" title="Прибрати прайс цієї операції">
                                    <Trash2 size={13} />
                                  </button>
                                )}
                                {v[12] && (
                                  <span className="ml-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>онов. {v[12]}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(edit.tableUrl || edit.invoiceUrl) && (
                <div className="flex gap-2 flex-wrap">
                  {edit.tableUrl && (
                    <a href={edit.tableUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press ring-1 ring-gray-200"
                      style={{ color: 'var(--ink-2)' }}>
                      <ExternalLink size={13} /> Таблиця виконавця
                    </a>
                  )}
                  {edit.invoiceUrl && (
                    <a href={edit.invoiceUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold press ring-1 ring-gray-200"
                      style={{ color: 'var(--ink-2)' }}>
                      <ExternalLink size={13} /> Рахунки
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t hairline p-3 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {fieldOf(4) && draft['4'] && (
                <span className="hidden sm:flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  <MapPin size={12} /> {draft['4']}
                </span>
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
