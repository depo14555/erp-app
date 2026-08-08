// ================================================================
//  src/components/NestingSheet.tsx — ✂️ Розкрій DXF просто в додатку.
//  Групує деталі за матеріалом і ТОВЩИНОЮ, рахує розкладку (щільну
//  true-shape або по полицях), показує листи, вагу, остачу, довжину
//  різу й час, рахує вартість за тарифами і одним рухом кладе суму
//  в Прорахунок («Порізка комплект металу 3мм»).
//  Розкладки зберігаються на Диск DXF-файлами (пробіли в іменах → _).
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Scissors, Loader2, Save, FolderOpen, Calculator, Package, AlertTriangle, Settings2,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { useBusy } from '../lib/busy';
import { api } from '../api';
import { OrderDetail, NestItem, NestPrice, CalcBundle } from '../types';
import {
  parseDxf, computeMetrics, bestAngle, orientAt, packGroup, packTrueShape, buildDxf,
  drawPart, thickOf, densOf, suggestPerM, suggestSpeed, suggestPierceSec, weightOf, safeFileName,
} from '../lib/nesting';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
}

type Phase = 'load' | 'setup' | 'work' | 'done';

const FORMATS: Array<[number, number]> = [[2000, 1000], [2500, 1250], [3000, 1500], [6000, 1500], [6000, 2000]];

interface Group {
  key: string;
  material: string;
  thickness: number;
  items: NestItem[];
  on: boolean;
  fmt: number;      // індекс FORMATS
}

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Розібрані DXF живуть поза компонентом: закрив вікно — повторно не читаємо. */
const parsedCache = new Map<string, any>();

export default function NestingSheet({ detail, onClose, onMinimize, onToast }: Props) {
  const [phase, setPhase] = useState<Phase>('load');
  const [items, setItems] = useState<NestItem[]>([]);
  const [folderUrl, setFolderUrl] = useState('');
  const [noLink, setNoLink] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [prices, setPrices] = useState<Record<string, NestPrice>>({});

  // Налаштування розкрою
  const [qsrc, setQsrc] = useState<'J' | 'M' | 'name'>('J');
  const [gap, setGap] = useState(5);
  const [margin, setMargin] = useState(10);
  const [rot, setRot] = useState(true);
  const [optAngle, setOptAngle] = useState(true);
  const [trueShape, setTrueShape] = useState(true);
  const [showPrices, setShowPrices] = useState(false);

  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const parsedRef = useRef<Map<string, any>>(parsedCache);

  // Поки читаємо файли / рахуємо / зберігаємо — сторінку не можна втратити
  useBusy(phase === 'work' || saving, 'Розкрій DXF');

  useEffect(() => {
    Promise.all([api.nestItems(detail.header.headerRow), api.nestPrices().catch(() => ({ prices: {} }))])
      .then(([d, p]) => {
        setItems(d.items);
        setFolderUrl(d.folderUrl);
        setNoLink(d.noLink);
        setPrices(p.prices || {});
        setPhase('setup');
      })
      .catch(e => { onToast(e?.message || 'Не вдалося зібрати DXF картки', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Групи «матеріал · товщина мм» — той самий ключ, що й у таблиці
  useEffect(() => {
    const map = new Map<string, Group>();
    items.forEach(it => {
      const key = (it.material || '?') + ' · ' + (it.thickness || '?') + ' мм';
      if (!map.has(key)) {
        map.set(key, {
          key, material: it.material, thickness: thickOf(key),
          items: [], on: true, fmt: 2,
        });
      }
      map.get(key)!.items.push(it);
    });
    setGroups(prev => {
      const byKey = new Map(prev.map(g => [g.key, g]));
      return [...map.values()].map(g => ({ ...g, on: byKey.get(g.key)?.on ?? true, fmt: byKey.get(g.key)?.fmt ?? g.fmt }));
    });
  }, [items]);

  function qtyOf(it: NestItem): number {
    const v = qsrc === 'M' ? it.qtyM : qsrc === 'name' ? it.qtyName : it.qtyJ;
    return Math.max(1, Math.round(v || 0) || 1);
  }

  const chosen = groups.filter(g => g.on);
  const totalParts = chosen.reduce((s, g) => s + g.items.reduce((x, i) => x + qtyOf(i), 0), 0);

  /** Читає DXF пачками по 5 і кешує розібрану геометрію. */
  async function loadDxf(need: NestItem[]) {
    const missing = need.filter(i => !parsedRef.current.has(i.fileId));
    for (let b = 0; b < missing.length; b += 5) {
      const batch = missing.slice(b, b + 5);
      setProgress(`Читаю креслення ${Math.min(b + 5, missing.length)} з ${missing.length}…`);
      const res = await api.nestDxf(batch.map(i => i.fileId));
      (res.files || []).forEach(f => {
        if (!f.text) { setProblems(p => [...p, `${batch.find(i => i.fileId === f.fileId)?.fileName || f.fileId}: ${f.error || 'порожній файл'}`]); return; }
        try {
          const parsed = parseDxf(f.text);
          parsedRef.current.set(f.fileId, parsed);
        } catch (e: any) {
          setProblems(p => [...p, `${f.fileId}: ${e?.message || 'не розібрався DXF'}`]);
        }
      });
    }
  }

  async function run() {
    if (!chosen.length) return;
    setPhase('work');
    setProblems([]);
    setResults([]);
    try {
      const need = chosen.flatMap(g => g.items);
      await loadDxf(need);

      const out: any[] = [];
      for (const g of chosen) {
        setProgress(`Розкладаю ${g.key}…`);
        const instances: any[] = [];
        for (const it of g.items) {
          const parsed = parsedRef.current.get(it.fileId);
          if (!parsed) continue;
          const angle = optAngle ? bestAngle(parsed.hull) : 0;
          const o = orientAt(parsed, angle);
          const metrics = computeMetrics(parsed.prims);
          const qty = qtyOf(it);
          for (let k = 0; k < qty; k++) {
            instances.push({
              fileId: it.fileId, name: it.fileName, parsed, angle,
              w: o.w, h: o.h, metrics, item: it,
            });
          }
        }
        if (!instances.length) { setProblems(p => [...p, `${g.key}: немає розібраних деталей`]); continue; }
        const [sw, sh] = FORMATS[g.fmt];
        const res = trueShape
          ? await packTrueShape(instances, sw, sh, gap, margin, rot, optAngle, (t: string) => setProgress(t))
          : packGroup(instances, sw, sh, gap, margin, rot);
        out.push({ ...res, key: g.key, sheetW: sw, sheetH: sh, gap, margin, group: g });
      }
      setResults(out);
      setPhase('done');
    } catch (e: any) {
      onToast(e?.message || 'Розкрій не вдався', true);
      setPhase('setup');
    } finally {
      setProgress('');
    }
  }

  /** Метрики групи: довжина різу, врізки, вага, вартість. */
  function metricsOf(res: any) {
    let lenMM = 0, pierces = 0;
    res.sheets.forEach((s: any) => s.parts.forEach((p: any) => {
      const m = p.inst?.metrics;
      if (!m) return;
      lenMM += m.len || 0;
      pierces += m.loops || 0;
    }));
    const w = weightOf(res);
    const pr = prices[res.key] || {};
    const perM = pr.perM ?? suggestPerM(res.key) ?? 0;
    const perPierce = pr.perPierce ?? Math.round((perM || 0) * 0.1 * 100) / 100;
    const perSheet = pr.perSheet ?? 0;
    const speed = pr.speed ?? suggestSpeed(res.key) ?? 0;
    const pierceSec = pr.pierceSec ?? suggestPierceSec(res.key);
    const lenM = lenMM / 1000;
    const cost = lenM * perM + pierces * perPierce + res.sheets.length * perSheet;
    const timeMin = (speed ? lenM / speed : 0) + pierces * (pierceSec || 0) / 60;
    return { lenM, pierces, w, cost, timeMin, perM, perPierce, perSheet, speed, pierceSec };
  }

  const totals = useMemo(() => {
    let cost = 0, timeMin = 0, sheets = 0, kg = 0;
    results.forEach(r => {
      const m = metricsOf(r);
      cost += m.cost; timeMin += m.timeMin; sheets += r.sheets.length; kg += m.w.sheets;
    });
    return { cost, timeMin, sheets, kg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, prices]);

  function setPrice(key: string, field: keyof NestPrice, v: string) {
    const n = parseFloat(String(v).replace(',', '.'));
    setPrices(prev => ({ ...prev, [key]: { ...prev[key], [field]: isNaN(n) ? undefined : n } }));
  }

  async function savePrices() {
    try { await api.nestSavePrices(prices); onToast('Тарифи збережено'); }
    catch (e: any) { onToast(e?.message || 'Не вдалося зберегти тарифи', true); }
  }

  /** Розкладки → DXF-файли на Диск + текстовий звіт. */
  async function saveLayouts() {
    if (!results.length) return;
    setSaving(true);
    try {
      const base = safeFileName(detail.header.orderNum || detail.header.projectId || 'Розкрій');
      const files: Array<{ name: string; content: string }> = [];
      const lines: string[] = [`Розкрій ${detail.header.orderNum || detail.header.projectId}`, ''];
      results.forEach(res => {
        const m = metricsOf(res);
        lines.push(`${res.key}: листів ${res.sheets.length} (${res.sheetW}×${res.sheetH}), ` +
          `різ ${m.lenM.toFixed(1)} м, врізок ${m.pierces}, ` +
          `деталі ${m.w.parts.toFixed(1)} кг, метал ${m.w.sheets.toFixed(1)} кг, ` +
          `остача ${m.w.rest.toFixed(1)} кг, заповнення ${m.w.usedPct}%, ` +
          `час ${m.timeMin.toFixed(0)} хв, вартість ${money(m.cost)} грн`);
        res.sheets.forEach((sheet: any, i: number) => {
          files.push({
            name: safeFileName(`${base}_${res.key}_лист${i + 1}`) + '.dxf',
            content: buildDxf(res, sheet),
          });
        });
      });
      lines.push('', `Разом: листів ${totals.sheets}, металу ${totals.kg.toFixed(1)} кг, ` +
        `час ${(totals.timeMin / 60).toFixed(1)} год, вартість ${money(totals.cost)} грн`);
      const res = await api.nestSave({ folderUrl, baseName: base, files, report: lines.join('\n') });
      onToast(`💾 Збережено на Диск: ${res.files.length} файлів`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти розкладки', true);
    } finally {
      setSaving(false);
    }
  }

  /** Пакет для ProNest: DXF по товщинах + Перелік.csv. */
  async function pronest() {
    setSaving(true);
    try {
      const base = safeFileName(detail.header.orderNum || detail.header.projectId || 'Замовлення');
      const payload = {
        folderUrl, baseName: base,
        groups: chosen.map(g => ({
          key: g.key,
          items: g.items.map(i => ({
            fileId: i.fileId, fileName: i.fileName, qty: qtyOf(i),
            material: i.material, thickness: i.thickness,
          })),
        })),
      };
      const res = await api.nestPronest(payload);
      onToast(`📦 Пакет ProNest готовий: ${res.groups.length} груп`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зібрати пакет', true);
    } finally {
      setSaving(false);
    }
  }

  /** Вартість порізки → окрема група в Прорахунку. */
  async function toCalc() {
    if (!results.length) return;
    setSaving(true);
    try {
      const cur = await api.calcGet(detail.header.headerRow);
      const bundles: CalcBundle[] = cur.data?.bundles || [];
      results.forEach(res => {
        const m = metricsOf(res);
        if (!m.cost) return;
        const th = thickOf(res.key);
        bundles.push({
          id: 'nest' + Math.random().toString(36).slice(2, 8),
          kind: 'Порізка металу',
          invoiceName: `Порізка комплект металу ${th ? th + 'мм' : res.key}`,
          payTo: 'client',
          rows: res.group?.items?.map((i: NestItem) => i.row) || [],
          extras: [{ label: `лазерна порізка ${res.key} · ${m.lenM.toFixed(1)} м, врізок ${m.pierces}, листів ${res.sheets.length}`, sum: Math.round(m.cost * 100) / 100 }],
          note: `вага деталей ${m.w.parts.toFixed(1)} кг · металу ${m.w.sheets.toFixed(1)} кг · остача ${m.w.rest.toFixed(1)} кг · час ${m.timeMin.toFixed(0)} хв`,
        });
      });
      await api.calcSave(detail.header.headerRow, { bundles });
      onToast('🧮 Додано у Прорахунок — відкрийте вікно прорахунку');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося передати в прорахунок', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className="relative w-full lg:w-[1180px] max-h-[94dvh] lg:max-h-[92vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Scissors size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Розкрій DXF</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {items.length ? ` · деталей у картці: ${items.length}` : ''}
              {noLink ? ` · без файлу: ${noLink}` : ''}
            </p>
          </div>
          {results.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 mr-2 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
              <span>листів <b>{totals.sheets}</b></span>
              <span>{totals.kg.toFixed(1)} кг</span>
              <span>{(totals.timeMin / 60).toFixed(1)} год</span>
              <span className="text-[14px] font-bold">{money(totals.cost)} грн</span>
            </div>
          )}
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-sky-600" />
            <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Шукаю DXF у картці…</p>
          </div>
        )}

        {phase === 'work' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-sky-600" />
            <p className="text-[13px] font-bold">{progress || 'Рахую розкладку…'}</p>
            <p className="text-[11.5px] text-center" style={{ color: 'var(--ink-3)' }}>
              Щільний розкрій великих партій може зайняти хвилину
            </p>
          </div>
        )}

        {(phase === 'setup' || phase === 'done') && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Налаштування */}
            <div className="px-4 py-3 border-b hairline space-y-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>К-сть з</span>
                {([['J', 'К-сть'], ['M', 'Призначено'], ['name', 'з назви файлу']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setQsrc(v)}
                    className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-colors"
                    style={qsrc === v ? { background: 'var(--ink)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                    {label}
                  </button>
                ))}
                <span className="ml-2 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>Зазор</span>
                <input value={gap} onChange={e => setGap(parseFloat(e.target.value) || 0)} inputMode="decimal"
                  className="w-[56px] px-2 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200 outline-none text-[12px] tabular-nums text-right" />
                <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>Поле</span>
                <input value={margin} onChange={e => setMargin(parseFloat(e.target.value) || 0)} inputMode="decimal"
                  className="w-[56px] px-2 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200 outline-none text-[12px] tabular-nums text-right" />
                {([['rot', rot, setRot, 'Поворот 90°'], ['opt', optAngle, setOptAngle, 'Авто-кут'], ['ts', trueShape, setTrueShape, 'Щільний розкрій']] as const).map(
                  ([k, val, set, label]) => (
                    <button key={k as string} onClick={() => (set as any)(!val)}
                      className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-colors"
                      style={val ? { background: '#ECFEFF', color: '#0891B2' } : { background: '#F3F4F6', color: 'var(--ink-3)' }}>
                      {val ? '✓ ' : ''}{label}
                    </button>
                  ))}
                <button onClick={() => setShowPrices(v => !v)}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                  style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                  <Settings2 size={12} /> Тарифи різу
                </button>
              </div>

              {/* Групи по товщинах */}
              <div className="space-y-1.5">
                {groups.map((g, gi) => (
                  <div key={g.key} className="flex items-center gap-2 flex-wrap p-2 rounded-2xl ring-1 ring-gray-200/70">
                    <button onClick={() => setGroups(prev => prev.map((x, i) => i === gi ? { ...x, on: !x.on } : x))}
                      className="px-2.5 py-1 rounded-xl text-[12px] font-bold press"
                      style={g.on ? { background: '#ECFEFF', color: '#0891B2' } : { background: '#F3F4F6', color: 'var(--ink-3)' }}>
                      {g.on ? '✓ ' : ''}{g.key}
                    </button>
                    <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                      {g.items.length} найменувань · {g.items.reduce((s, i) => s + qtyOf(i), 0)} шт
                    </span>
                    <select value={g.fmt} onChange={e => setGroups(prev => prev.map((x, i) => i === gi ? { ...x, fmt: +e.target.value } : x))}
                      className="ml-auto px-2 py-1 rounded-xl bg-gray-50 ring-1 ring-gray-200 text-[11.5px] outline-none">
                      {FORMATS.map(([w, h], i) => <option key={i} value={i}>{w}×{h}</option>)}
                    </select>

                    {showPrices && (
                      <div className="w-full flex items-center gap-1.5 flex-wrap pt-1.5 border-t hairline">
                        {([['perM', 'грн/м різу'], ['perPierce', 'грн/врізка'], ['perSheet', 'грн/лист'], ['speed', 'м/хв'], ['pierceSec', 'с/врізка']] as const).map(([f, label]) => (
                          <label key={f} className="flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                            {label}
                            <input
                              value={prices[g.key]?.[f] ?? ''}
                              placeholder={String(
                                f === 'perM' ? (suggestPerM(g.key) ?? '') :
                                f === 'speed' ? (suggestSpeed(g.key) ?? '') :
                                f === 'pierceSec' ? suggestPierceSec(g.key) : ''
                              )}
                              onChange={e => setPrice(g.key, f, e.target.value)}
                              inputMode="decimal"
                              className="w-[62px] px-1.5 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-200 outline-none text-[11px] tabular-nums text-right" />
                          </label>
                        ))}
                        <button onClick={savePrices} className="text-[11px] font-bold press px-2 py-1 rounded-lg" style={{ color: 'var(--accent)' }}>
                          зберегти тарифи
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!groups.length && (
                  <p className="text-center text-[12.5px] py-6" style={{ color: 'var(--ink-3)' }}>
                    У картці немає рядків із DXF-файлами (потрібне посилання на файл у назві)
                  </p>
                )}
              </div>
            </div>

            {/* Результати */}
            {results.map(res => {
              const m = metricsOf(res);
              return (
                <div key={res.key} className="px-4 py-3 border-b hairline">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[13px] font-bold">{res.key}</span>
                    <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                      листів {res.sheets.length} ({res.sheetW}×{res.sheetH}) · заповнення {m.w.usedPct}% ·
                      різ {m.lenM.toFixed(1)} м · врізок {m.pierces} ·
                      деталі {m.w.parts.toFixed(1)} кг · метал {m.w.sheets.toFixed(1)} кг ·
                      остача {m.w.rest.toFixed(1)} кг · {m.timeMin.toFixed(0)} хв
                    </span>
                    <span className="ml-auto text-[14px] font-bold tabular-nums">{money(m.cost)} грн</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {res.sheets.map((sheet: any, i: number) => (
                      <SheetCanvas key={i} res={res} sheet={sheet} index={i} />
                    ))}
                  </div>
                </div>
              );
            })}

            {problems.length > 0 && (
              <div className="mx-4 my-3 p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11.5px] flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{problems.slice(0, 6).join('; ')}{problems.length > 6 ? '…' : ''}</span>
              </div>
            )}
          </div>
        )}

        {(phase === 'setup' || phase === 'done') && (
          <div className="flex-shrink-0 border-t hairline p-3 flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={run} disabled={!chosen.length}
              className="flex-1 min-w-[220px] py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-40"
              style={{ background: '#0891B2' }}>
              ✂️ Розкроїти · {chosen.length} груп ({totalParts} деталей)
            </button>
            {results.length > 0 && (
              <>
                <button onClick={saveLayouts} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[12px] font-bold press disabled:opacity-40"
                  style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                  <Save size={13} /> Зберегти розкладки
                </button>
                <button onClick={toCalc} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[12px] font-bold press disabled:opacity-40"
                  style={{ background: '#CCFBF1', color: '#0F766E' }}>
                  <Calculator size={13} /> У прорахунок
                </button>
              </>
            )}
            <button onClick={pronest} disabled={saving || !chosen.length}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[12px] font-bold press disabled:opacity-40"
              style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
              <Package size={13} /> Пакет ProNest
            </button>
            {folderUrl && (
              <a href={folderUrl} target="_blank" rel="noreferrer"
                className="p-2.5 rounded-2xl press" style={{ color: 'var(--ink-3)' }} title="Папка замовлення">
                <FolderOpen size={15} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Один лист розкладки — малюємо тим самим кодом, що й у таблиці. */
function SheetCanvas({ res, sheet, index }: { res: any; sheet: any; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 300, H = Math.round(W * res.sheetH / res.sheetW);
    cv.width = W * 2; cv.height = H * 2;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const scale = W / res.sheetW;
    // Координати як у таблиці: DXF-вісь Y дивиться вгору, тож рахуємо від низу листа
    sheet.parts.forEach((p: any) => {
      const x = (res.margin + p.x) * scale;
      const y = H - (res.margin + p.y) * scale;
      const w = (p.w - res.gap) * scale;
      const h = (p.h - res.gap) * scale;
      ctx.strokeStyle = '#DBEAFE'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y - h, w, h);
      ctx.strokeStyle = '#1D4ED8';
      try { drawPart(ctx, p, x, y, scale, res.gap); } catch (e) { /* деталь без геометрії */ }
    });
  }, [res, sheet]);
  return (
    <div className="flex-shrink-0">
      <canvas ref={ref} className="rounded-xl ring-1 ring-gray-200 bg-white" />
      <p className="text-[10.5px] text-center mt-0.5" style={{ color: 'var(--ink-3)' }}>
        лист {index + 1} · {sheet.parts.length} дет. · {Math.round(100 * (sheet.util || 0))}%
      </p>
    </div>
  );
}
