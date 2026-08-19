// ================================================================
//  src/pages/StaffPage.tsx — 👷 Працівники.
//  Свої люди: посада, ставка, контакти, графік, паспортні дані,
//  фото і МАТРИЦЯ КВАЛІФІКАЦІЇ за шкалою 0–4 з аркуша «Штат»:
//    0 не навчений · 1 навчається · 2 під наглядом
//    3 самостійно · 4 може навчити іншого
//  Носієм операції рахується оцінка 2 і вище («0 і 1 не
//  враховуються в розрахунках» — примітка з вашого аркуша).
//  Дані живуть на аркуші «Працівники» (створюється автоматично);
//  авторський аркуш «Штат» не чіпається.
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, Search, X, Save, Trash2, Phone, Mail, UserRound, BadgeCheck,
  Camera, ScrollText, GraduationCap, Users,
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
  11: 'дд.мм.рррр', 12: 'ВМ 123456', 13: 'ким виданий', 14: 'дд.мм.рррр',
  15: '10 цифр', 16: 'місто, вулиця, буд.',
};
const STATUS_OPTIONS = ['Працює', 'Відпустка', 'Лікарняний', 'Звільнений'];
/** Колонки, що йдуть у блок паспортних даних. */
const DOC_COLS = [11, 12, 13, 14, 15, 16];
/** Кольори оцінок 0..4. */
const LEVEL_STYLE: Record<number, { background: string; color: string }> = {
  0: { background: '#F3F4F6', color: '#6B7280' },
  1: { background: '#FEF3C7', color: '#92400E' },
  2: { background: '#DBEAFE', color: '#1E40AF' },
  3: { background: '#D1FAE5', color: '#065F46' },
  4: { background: '#0D9488', color: '#FFFFFF' },
};

/** Стискаємо фото перед відправкою — на Диск не треба 5 МБ із камери. */
async function shrink(file: File, max = 900): Promise<{ base64: string; mime: string }> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    return { base64: data.split(',')[1], mime: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Кеш фото (fileId → data-url) живе поза компонентом. */
const photoCache = new Map<string, string>();

export default function StaffPage({ onToast, refreshSignal }: Props) {
  const [data, setData] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [fSkill, setFSkill] = useState('');
  const [edit, setEdit] = useState<StaffRow | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftSkills, setDraftSkills] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [newSkill, setNewSkill] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [upload, setUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.staff());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати перелік працівників', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  // Фото підвантажуються фоном і кешуються між відкриттями сторінки
  useEffect(() => {
    if (!data) return;
    let dead = false;
    (async () => {
      const known: Record<string, string> = {};
      data.rows.forEach(r => { const c = r.photoId && photoCache.get(r.photoId); if (c) known[r.photoId!] = c; });
      if (Object.keys(known).length) setPhotos(p => ({ ...p, ...known }));
      for (const r of data.rows) {
        if (dead) return;
        const id = r.photoId;
        if (!id || photoCache.has(id)) continue;
        try {
          const fd = await api.fileData(id);
          const url = `data:${fd.mime};base64,${fd.base64}`;
          photoCache.set(id, url);
          if (!dead) setPhotos(p => ({ ...p, [id]: url }));
        } catch { /* фото не критичне */ }
      }
    })();
    return () => { dead = true; };
  }, [data]);

  const val = (r: StaffRow, col: number) => String(r[col] ?? '');
  const working = (r: StaffRow) => !/звільн/i.test(val(r, 9));
  const levelOf = (r: StaffRow, skill: string) => (r.skills || {})[skill] || 0;

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => {
      if (fSkill && levelOf(r, fSkill) < (data?.levelOk ?? 2)) return false;
      if (!query) return true;
      const hay = [...Object.values(r).filter(v => typeof v !== 'object'), ...Object.keys(r.skills || {})]
        .join(' ').toLowerCase();
      return hay.includes(query);
    });
  }, [data, q, fSkill]);

  function open(r: StaffRow) {
    setEdit(r);
    setConfirmDel(false);
    setNewSkill(null);
    const d: Record<string, string> = {};
    (data?.fields || []).forEach(f => { d[f.col] = val(r, f.col); });
    setDraft(d);
    setDraftSkills({ ...(r.skills || {}) });
  }

  async function save() {
    if (!edit) return;
    if (!(draft['1'] || '').trim()) { onToast('Вкажіть ПІБ', true); return; }
    setSaving(true);
    try {
      const res = await api.staffSave(edit.row, draft, draftSkills);
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
      await api.staffSave(edit.row, {}, undefined, true);
      onToast('Працівника прибрано з переліку');
      setEdit(null);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося видалити', true);
    } finally {
      setSaving(false);
    }
  }

  /** Нова операція в матриці = нова колонка аркуша. */
  async function addSkill() {
    const name = (newSkill || '').trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.staffAddSkill(name);
      onToast(`✅ Операцію «${name}» додано в матрицю`);
      setNewSkill(null);
      await load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося додати операцію', true);
    } finally {
      setSaving(false);
    }
  }

  async function dropSkill(name: string) {
    setSaving(true);
    try {
      await api.staffAddSkill(name, true);
      onToast(`Операцію «${name}» прибрано з матриці`);
      setDraftSkills(s => { const n = { ...s }; delete n[name]; return n; });
      await load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прибрати операцію', true);
    } finally {
      setSaving(false);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !edit) return;
    if (!edit.row) { onToast('Спершу збережіть працівника — тоді додасться фото', true); return; }
    setUpload(true);
    try {
      const { base64, mime } = await shrink(file);
      const res = await api.staffPhoto(edit.row, base64, mime);
      photoCache.set(res.photoId, `data:${mime};base64,${base64}`);
      setPhotos(p => ({ ...p, [res.photoId]: `data:${mime};base64,${base64}` }));
      setEdit(e => (e ? { ...e, photoId: res.photoId } : e));
      onToast('📷 Фото збережено');
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти фото', true);
    } finally {
      setUpload(false);
    }
  }

  const levels = data?.levels || [];
  const levelOk = data?.levelOk ?? 2;

  /** Аватар: фото або ініціали. */
  function avatar(r: StaffRow, size: number) {
    const src = r.photoId ? photos[r.photoId] : '';
    const on = working(r);
    if (src) {
      return <img src={src} alt="" className="rounded-xl object-cover flex-shrink-0"
        style={{ width: size, height: size, opacity: on ? 1 : 0.55 }} />;
    }
    return (
      <span className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size, ...(on
          ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
          : { background: '#F3F4F6', color: '#94A3B8' }) }}>
        <UserRound size={Math.round(size * 0.45)} />
      </span>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[420px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Пошук за ПІБ, посадою, операцією…"
              className="k-input w-full pl-9 pr-3 py-2 rounded-xl outline-none text-[13px]" />
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

        {/* Хто чим володіє — фільтр за операцією матриці */}
        {!!data?.skills.length && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide mr-0.5" style={{ color: 'var(--ink-3)' }}>
              Уміє
            </span>
            {data.skills.map(s => {
              const n = data.carriers[s.name] || 0;
              const on = fSkill === s.name;
              return (
                <button key={s.name} onClick={() => setFSkill(on ? '' : s.name)}
                  title={`Оцінка ${levelOk}+ : ${n} осіб`}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold transition-colors"
                  style={on
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: n ? '#F3F4F6' : '#FEF2F2', color: n ? 'var(--ink-2)' : '#B91C1C' }}>
                  {s.name} · {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        {!data && loading && (
          <div className="py-14 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}
        {data && rows.length === 0 && (
          <p className="text-center text-[12.5px] py-14 rounded-2xl bg-white ring-1 ring-gray-200/60" style={{ color: 'var(--ink-3)' }}>
            {fSkill ? `Немає нікого з оцінкою ${levelOk}+ за операцією «${fSkill}»`
              : data.rows.length ? 'Нічого не знайдено' : 'Перелік порожній — додайте першого працівника'}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {rows.map(r => {
            const skills = Object.entries(r.skills || {}).sort((a, b) => b[1] - a[1]);
            return (
              <button key={r.row} onClick={() => open(r)}
                className="text-left bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 press hover:ring-gray-300">
                <div className="flex items-start gap-2.5">
                  {avatar(r, 44)}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[13.5px] truncate">{val(r, 1) || '—'}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {val(r, 2) || 'без посади'}
                    </span>
                    <span className="flex items-center gap-3 mt-1 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                      {val(r, 3) && <span className="flex items-center gap-1"><Phone size={11} /> {val(r, 3)}</span>}
                      {val(r, 5) && (
                        <span className="font-bold tabular-nums">
                          {val(r, 5)} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{val(r, 6)}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  {val(r, 9) && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={working(r) ? { background: '#ECFDF5', color: '#059669' } : { background: '#FEF2F2', color: '#B91C1C' }}>
                      {val(r, 9)}
                    </span>
                  )}
                </div>

                {skills.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-2 pt-2 border-t hairline">
                    {skills.slice(0, 6).map(([name, lvl]) => (
                      <span key={name} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                        style={LEVEL_STYLE[lvl]} title={levels.find(l => l.v === lvl)?.full}>
                        {name} {lvl}
                      </span>
                    ))}
                    {skills.length > 6 && (
                      <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>+{skills.length - 6}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {edit && data && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setEdit(null)} />
          <div className="relative w-full lg:w-[760px] max-h-[94dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                <BadgeCheck size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] leading-tight">{edit.row ? 'Працівник' : 'Новий працівник'}</p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                  {edit.row ? `рядок ${edit.row} в аркуші «Працівники»` : 'буде додано в кінець аркуша'}
                </p>
              </div>
              <button onClick={() => setEdit(null)} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {/* Фото + основне */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  {avatar(edit, 88)}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                  <button onClick={() => fileRef.current?.click()} disabled={upload}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold press disabled:opacity-50"
                    style={{ color: 'var(--accent)' }}>
                    {upload ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                    {edit.photoId ? 'змінити' : 'фото'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 min-w-0">
                  {data.fields.filter(f => f.col <= 10).map(f => (
                    <label key={f.col} className={f.col === 10 ? 'sm:col-span-2' : ''}>
                      <span className="k-label block mb-1">
                        {f.label}
                      </span>
                      {f.col === 10 ? (
                        <textarea rows={2} value={draft[f.col] || ''}
                          onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                          placeholder={HINTS[f.col]}
                          className="k-input w-full px-3 py-2 rounded-xl outline-none text-[13px] resize-y" />
                      ) : (
                        <input value={draft[f.col] || ''}
                          onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                          placeholder={HINTS[f.col]}
                          type={f.col === 4 ? 'email' : 'text'}
                          className="k-input w-full px-3 py-2 rounded-xl outline-none text-[13px]" />
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
              </div>

              {/* Паспортні дані */}
              <div className="rounded-2xl ring-1 ring-gray-200/80 p-3">
                <p className="k-head flex items-center gap-1.5 mb-2">
                  <ScrollText size={13} /> Документи
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {data.fields.filter(f => DOC_COLS.includes(f.col)).map(f => (
                    <label key={f.col} className={f.col === 16 ? 'sm:col-span-3' : ''}>
                      <span className="k-label block mb-1">
                        {f.label}
                      </span>
                      <input value={draft[f.col] || ''}
                        onChange={e => setDraft(d => ({ ...d, [f.col]: e.target.value }))}
                        placeholder={HINTS[f.col]}
                        className="k-input w-full px-3 py-2 rounded-xl outline-none text-[13px]" />
                    </label>
                  ))}
                </div>
              </div>

              {/* Матриця кваліфікації */}
              <div className="rounded-2xl ring-1 ring-gray-200/80 p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <p className="k-head flex items-center gap-1.5">
                    <GraduationCap size={13} /> Матриця кваліфікації
                  </p>
                  <button onClick={() => setNewSkill('')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold press"
                    style={{ color: 'var(--accent)' }} title="Додати операцію (нова колонка в аркуші)">
                    <Plus size={12} /> операція
                  </button>
                  <span className="ml-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    носій операції — оцінка {levelOk}+
                  </span>
                </div>

                {newSkill !== null && (
                  <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                    <input autoFocus value={newSkill}
                      onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addSkill(); if (e.key === 'Escape') setNewSkill(null); }}
                      placeholder="Назва операції"
                      className="k-input flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg outline-none text-[12.5px]" />
                    <button onClick={addSkill} disabled={saving || !newSkill.trim()}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white press disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}>Додати</button>
                    <button onClick={() => setNewSkill(null)} className="p-1.5 press" style={{ color: 'var(--ink-3)' }} aria-label="Скасувати">
                      <X size={13} />
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  {data.skills.map(s => {
                    const lvl = draftSkills[s.name] || 0;
                    return (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="text-[12px] flex-1 min-w-0 truncate">{s.name}</span>
                        <span className="hidden sm:block text-[10.5px] w-[104px] text-right truncate" style={{ color: 'var(--ink-3)' }}>
                          {levels.find(l => l.v === lvl)?.short || ''}
                        </span>
                        <span className="flex gap-0.5 flex-shrink-0">
                          {levels.map(l => (
                            <button key={l.v} onClick={() => setDraftSkills(d => ({ ...d, [s.name]: l.v }))}
                              title={l.full}
                              className="w-7 h-7 rounded-lg text-[11.5px] font-bold press transition-colors"
                              style={lvl === l.v
                                ? LEVEL_STYLE[l.v]
                                : { background: '#FAFAFA', color: '#C7CBD1' }}>
                              {l.v}
                            </button>
                          ))}
                        </span>
                        <button onClick={() => dropSkill(s.name)} disabled={saving}
                          className="p-1 press flex-shrink-0" style={{ color: '#D1D5DB' }}
                          title={`Прибрати операцію «${s.name}» з матриці`} aria-label="Прибрати операцію">
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {!data.skills.length && (
                    <p className="text-[12px] py-3 text-center" style={{ color: 'var(--ink-3)' }}>
                      Операцій ще немає — додайте кнопкою «+ операція»
                    </p>
                  )}
                </div>

                <div className="mt-2.5 pt-2.5 border-t hairline flex flex-wrap gap-x-3 gap-y-1">
                  {levels.map(l => (
                    <span key={l.v} className="text-[10.5px] flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
                      <b className="px-1.5 rounded" style={LEVEL_STYLE[l.v]}>{l.v}</b> {l.short}
                    </span>
                  ))}
                </div>
              </div>

              {(draft['3'] || draft['4']) && (
                <div className="flex gap-2 flex-wrap">
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
              <span className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                <Users size={12} /> {Object.values(draftSkills).filter(v => v >= levelOk).length} операцій на рівні {levelOk}+
              </span>
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
