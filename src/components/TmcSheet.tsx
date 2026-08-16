// ================================================================
//  src/components/TmcSheet.tsx — ⚖️ ТМЦ і вага конструкції.
//
//  Матеріал, товщину, діаметр, профіль і масу ми вже витягуємо зі
//  штампа креслення й зберігаємо в аркуші «Розбір» — але досі нікуди
//  не переносили. Тут вони потрапляють у колонки картки.
//
//  Нічого не пишеться мовчки: спершу видно ТАБЛИЦЮ ЗМІН — що стоїть
//  зараз, що прочитано, і чи це доповнення порожнього поля, чи
//  розбіжність із тим, що заповнили руками. Розбіжності за
//  замовчуванням НЕ застосовуються: людина, яка вписала матеріал,
//  зазвичай знає більше за штамп.
//
//  Вага рахується двічі: зі штампа і з геометрії розкрою
//  (площа × товщина × густина). Розбіжність — сигнал, що товщина
//  або матеріал зазначені неправильно, а не просто цифра.
// ================================================================

import { useMemo, useRef, useState } from 'react';
import {
  X, Loader2, CheckSquare, Square, Sparkles, Save, AlertTriangle,
  Scale, FileText, Check,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { AiBadge } from './Sidebar';
import { useBusy } from '../lib/busy';
import { api } from '../api';
import { parseDrawings, driveIdFromUrl, ParsedDrawing, ParseProgress } from '../lib/ai';
import { OrderDetail, OrderItem } from '../types';
import { num, qtyOf } from './ItemsTable';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onRefresh: (label?: string) => void;
}

/** Позиції з кресленням, з якого взагалі є що читати. */
function hasDrawing(i: OrderItem): boolean {
  return !i.group && !!i.url && /\.pdf$/i.test(String(i.name || ''));
}

/** Одне поле картки, яке пропонуємо змінити. */
interface Change {
  field: 'material' | 'thickness';
  was: string;
  now: string;
  conflict: boolean;   // було заповнено іншим — руками
  multi: boolean;      // у штампі кілька варіантів через кому — треба уточнити
}

interface Line {
  item: OrderItem;
  p: ParsedDrawing;
  changes: Change[];
  /** Маса з штампа, кг за штуку. */
  mass: number;
  /** Скільки штук — за призначеним, інакше за загальною к-стю. */
  qty: number;
  /** Та сама деталь у кількох рядках-операціях (маршрут). */
  route: boolean;
}

const DENSITY = 7850; // сталь, кг/м³ — для звірки ваги з геометрії

export default function TmcSheet({ detail, onClose, onMinimize, onToast, onRefresh }: Props) {
  const order = detail.header.projectId;
  const candidates = useMemo(() => detail.items.filter(hasDrawing), [detail.items]);

  /** За замовчуванням беремо ті, де матеріалу або товщини бракує. */
  const [sel, setSel] = useState<Set<number>>(() => new Set(
    candidates.filter(i => !String(i.material || '').trim() || !String(i.thickness || '').trim())
      .map(i => i.row)
  ));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<ParseProgress | null>(null);
  const [parsed, setParsed] = useState<ParsedDrawing[]>([]);
  const [saving, setSaving] = useState(false);
  const [applyConflicts, setApplyConflicts] = useState(false);
  const [applyMulti, setApplyMulti] = useState(false);
  const [skip, setSkip] = useState<Set<string>>(new Set());   // «рядок:поле», зняті вручну
  const abort = useRef<AbortController | null>(null);
  useBusy(busy, 'ТМЦ і вага');

  const toggle = (row: number) =>
    setSel(prev => { const n = new Set(prev); n.has(row) ? n.delete(row) : n.add(row); return n; });

  async function run() {
    const picked = candidates.filter(i => sel.has(i.row));
    if (!picked.length) { onToast('Виберіть хоча б одне креслення', true); return; }
    setBusy(true);
    setParsed([]);
    abort.current = new AbortController();
    try {
      // Одне креслення може стояти в кількох рядках-операціях —
      // читаємо його ОДИН раз, інакше платимо двічі за те саме
      const seen = new Set<string>();
      const files = picked
        .map(i => ({ fileId: driveIdFromUrl(i.url), name: i.name, size: 0 }))
        .filter(f => f.fileId && !seen.has(f.fileId) && seen.add(f.fileId));
      const res = await parseDrawings(order, files, {
        onProgress: setProg,
        signal: abort.current.signal,
      });
      setParsed(res);
      const bad = res.filter(r => r.error);
      const spent = res.reduce((s, r) => s + r.cost, 0);
      const cached = res.filter(r => r.fromCache).length;
      onToast(bad.length
        ? `Прочитано ${res.length - bad.length} з ${res.length}; не вдалося: ${bad[0].name}`
        : `✅ Прочитано ${res.length} · з кешу ${cached} · витрачено $${spent.toFixed(3)}`,
        bad.length > 0);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати', true);
    } finally {
      setBusy(false);
      setProg(null);
    }
  }

  /**
   * Що саме зміниться в картці.
   *
   * Одне креслення часто стоїть у кількох рядках — та сама деталь на
   * різних операціях (маршрут: гнуття, потім фарбування). Читаємо файл
   * один раз, а ТМЦ проставляємо ВСІМ його рядкам: інакше половина
   * маршруту лишиться порожньою.
   */
  const lines = useMemo<Line[]>(() => {
    const byFileId = new Map<string, OrderItem[]>();
    candidates.forEach(i => {
      const id = driveIdFromUrl(i.url);
      if (!id) return;
      const arr = byFileId.get(id) || [];
      arr.push(i);
      byFileId.set(id, arr);
    });

    const out: Line[] = [];
    const done = new Set<string>();
    parsed.filter(p => !p.error).forEach(p => {
      if (done.has(p.fileId)) return;   // той самий файл міг прийти двічі
      done.add(p.fileId);
      const rows = byFileId.get(p.fileId) || [];
      rows.forEach(item => {
        const changes: Change[] = [];
        const add = (field: Change['field'], now: string) => {
          const clean = String(now || '').trim();
          if (!clean) return;
          const was = String((item as any)[field] || '').trim();
          if (was === clean) return;                    // уже те саме — не чіпаємо
          changes.push({
            field, was, now: clean,
            conflict: !!was,
            // «Сталь 40Х, Сталь45, Сталь 09Г2С» — у штампі перелік
            // допустимих марок, а не одна. Тут має вирішити людина.
            multi: field === 'material' && /[,/]/.test(clean),
          });
        };
        add('material', p.material);
        // Товщина в штампі буває як «S 1,5» або просто числом
        add('thickness', String(p.thickness || '').replace(/[^\d.,]/g, ''));

        out.push({
          item, p, changes,
          mass: num(String(p.mass || '').replace(',', '.')),
          qty: qtyOf(item) || 1,
          route: rows.length > 1,
        });
      });
    });
    return out;
  }, [parsed, candidates]);

  /** Правки до запису: конфлікти лише якщо їх увімкнули, мінус зняті вручну. */
  const toWrite = useMemo(() => {
    const rows: Array<{ row: number; fields: Record<string, string> }> = [];
    lines.forEach(l => {
      const fields: Record<string, string> = {};
      l.changes.forEach(c => {
        if (c.conflict && !applyConflicts) return;
        if (c.multi && !applyMulti) return;
        if (skip.has(`${l.item.row}:${c.field}`)) return;
        fields[c.field] = c.now;
      });
      if (Object.keys(fields).length) rows.push({ row: l.item.row, fields });
    });
    return rows;
  }, [lines, applyConflicts, applyMulti, skip]);

  const cells = toWrite.reduce((s, r) => s + Object.keys(r.fields).length, 0);
  const conflicts = lines.reduce((s, l) => s + l.changes.filter(c => c.conflict).length, 0);
  const multis = lines.reduce((s, l) => s + l.changes.filter(c => c.multi).length, 0);

  /**
   * Вага: зі штампа і — де можливо — з геометрії розкрою.
   *
   * Рахуємо ПО КРЕСЛЕННЮ, а не по рядках: та сама деталь на гнутті й
   * фарбуванні — це два рядки, але один шматок металу. Інакше вага
   * замовлення множиться на кількість операцій.
   */
  const weight = useMemo(() => {
    let stamp = 0, known = 0, unknown = 0;
    const mismatch: Array<{ item: OrderItem; stamp: number; calc: number }> = [];
    const seen = new Set<string>();
    lines.forEach(l => {
      if (seen.has(l.p.fileId)) return;
      seen.add(l.p.fileId);
      if (!l.mass) { unknown++; return; }
      known++;
      stamp += l.mass * l.qty;

      // Звірка з геометрією: маємо габарити й товщину — рахуємо самі
      const t = num(String(l.p.thickness || '').replace(',', '.'));
      const w = num(l.item.width);
      const h = num(l.item.length);
      if (t > 0 && w > 0 && h > 0) {
        const calc = (w / 1000) * (h / 1000) * (t / 1000) * DENSITY;
        if (calc > 0 && Math.abs(calc - l.mass) / Math.max(calc, l.mass) > 0.25) {
          mismatch.push({ item: l.item, stamp: l.mass, calc });
        }
      }
    });
    return { stamp, known, unknown, mismatch };
  }, [lines]);

  async function save() {
    if (!toWrite.length) { onToast('Немає що записувати', true); return; }
    setSaving(true);
    try {
      const res = await api.rowsUpdate(toWrite);
      onToast(`💾 Записано: ${res.cells} значень у ${res.rows} позиціях`);
      onRefresh('Записую ТМЦ…');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося записати', true);
    } finally {
      setSaving(false);
    }
  }

  const flipSkip = (row: number, field: string) =>
    setSkip(prev => {
      const k = `${row}:${field}`;
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const FIELD_LABEL: Record<string, string> = { material: 'Матеріал', thickness: 'Товщина' };

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[1120px] max-h-[94dvh] lg:h-[92vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <Scale size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight flex items-center gap-1.5">
              ТМЦ і вага <AiBadge />
            </p>
            <p className="k-label truncate">
              {detail.header.orderNum || order} · креслень {candidates.length}
            </p>
          </div>
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          {!busy && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

          {/* ЛІВОРУЧ: які креслення читаємо */}
          <div className="lg:w-[330px] flex-shrink-0 lg:border-r hairline flex flex-col min-h-0">
            <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
              <button onClick={() => setSel(sel.size === candidates.length ? new Set() : new Set(candidates.map(i => i.row)))}
                className="p-1 press" aria-label="Вибрати все">
                {sel.size === candidates.length && candidates.length > 0
                  ? <CheckSquare size={15} className="text-[var(--accent)]" />
                  : <Square size={15} style={{ color: 'var(--line-2)' }} />}
              </button>
              <p className="text-[12px] font-bold flex-1">
                Креслення <span style={{ color: 'var(--ink-3)' }}>({sel.size} з {candidates.length})</span>
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {candidates.map(i => {
                const on = sel.has(i.row);
                const got = parsed.find(p => p.fileId === driveIdFromUrl(i.url));
                const need = !String(i.material || '').trim() || !String(i.thickness || '').trim();
                return (
                  <button key={i.row} onClick={() => toggle(i.row)} disabled={busy}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left press disabled:opacity-60"
                    style={on ? { background: 'var(--accent-soft)' } : { background: 'var(--bg)' }}>
                    {on ? <CheckSquare size={14} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        : <Square size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--line-2)' }} />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold truncate">{i.name}</span>
                      <span className="block k-label truncate">
                        {i.id}
                        {need ? ' · бракує ТМЦ' : ' · заповнено'}
                        {got?.fromCache && ' · з кешу'}
                      </span>
                    </span>
                    {got?.error && <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />}
                    {got && !got.error && <Check size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--green)' }} />}
                  </button>
                );
              })}
              {!candidates.length && (
                <p className="text-center text-[12px] py-10" style={{ color: 'var(--ink-3)' }}>
                  У цьому замовленні немає позицій із PDF-кресленням
                </p>
              )}
            </div>

            <div className="flex-shrink-0 p-2.5 border-t hairline">
              <button onClick={run} disabled={busy || !sel.size}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-[13px] text-white press disabled:opacity-40"
                style={{ background: 'var(--blue)' }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? 'Читаю штампи…' : 'Прочитати ТМЦ'}
              </button>
              {prog && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.round(100 * prog.done / Math.max(prog.total, 1))}%`, background: 'var(--blue)' }} />
                  </div>
                  <p className="k-label mt-1 truncate">
                    {prog.done} з {prog.total}
                    {prog.cached ? ` · з кешу ${prog.cached}` : ''}
                    {prog.cost ? ` · $${prog.cost.toFixed(3)}` : ''}
                    {prog.name ? ` · ${prog.name}` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ПРАВОРУЧ: що зміниться і скільки це важить */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!lines.length && !busy && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <FileText size={30} style={{ color: 'var(--line-2)' }} />
                <p className="text-[13px] font-bold">Виберіть креслення і натисніть «Прочитати ТМЦ»</p>
                <p className="text-[11.5px] max-w-[440px]" style={{ color: 'var(--ink-3)' }}>
                  Зі штампа беруться матеріал, товщина й маса. Спершу покажемо таблицю змін —
                  що стоїть зараз і що прочитано, — і тільки після вашого підтвердження
                  це потрапить у картку.
                </p>
              </div>
            )}

            {!!lines.length && (
              <>
                {/* Вага конструкції */}
                <div className="flex-shrink-0 grid grid-cols-2 lg:grid-cols-4 border-b hairline">
                  <div className="px-3 py-2 border-r hairline">
                    <span className="k-label block">Маса, всього</span>
                    <span className="k-value block text-[15px]">
                      {weight.stamp ? `${weight.stamp.toFixed(1)} кг` : '—'}
                    </span>
                  </div>
                  <div className="px-3 py-2 border-r hairline">
                    <span className="k-label block">Креслень із масою</span>
                    <span className="k-value block">{weight.known} з {weight.known + weight.unknown}</span>
                  </div>
                  <div className="px-3 py-2 border-r hairline">
                    <span className="k-label block">Без маси</span>
                    <span className="k-value block" style={weight.unknown ? { color: 'var(--accent)' } : undefined}>
                      {weight.unknown}
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <span className="k-label block">Не сходиться з геометрією</span>
                    <span className="k-value block" style={weight.mismatch.length ? { color: 'var(--accent)' } : undefined}>
                      {weight.mismatch.length}
                    </span>
                  </div>
                </div>

                {/* Панель запису */}
                <div className="flex-shrink-0 px-3 py-2 border-b hairline flex items-center gap-2 flex-wrap">
                  <p className="text-[12.5px] font-bold">
                    До запису: <span style={{ color: 'var(--accent)' }}>{cells}</span> значень
                    у {toWrite.length} позиціях
                  </p>
                  {conflicts > 0 && (
                    <button onClick={() => setApplyConflicts(v => !v)}
                      className="k-chip press flex items-center gap-1.5"
                      style={applyConflicts
                        ? { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }
                        : undefined}
                      title="Показані жовтим — там уже щось стоїть, вписане руками">
                      {applyConflicts ? <CheckSquare size={11} /> : <Square size={11} />}
                      перезаписати вписане руками ({conflicts})
                    </button>
                  )}
                  {multis > 0 && (
                    <button onClick={() => setApplyMulti(v => !v)}
                      className="k-chip press flex items-center gap-1.5"
                      style={applyMulti
                        ? { background: 'var(--blue-bg)', color: 'var(--blue)', borderColor: 'var(--blue-line)' }
                        : undefined}
                      title="У штампі перелічено кілька допустимих марок — яку саме взяти, машина не вирішує">
                      {applyMulti ? <CheckSquare size={11} /> : <Square size={11} />}
                      писати перелік марок як є ({multis})
                    </button>
                  )}
                  <button onClick={save} disabled={saving || !cells}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[12px] press disabled:opacity-40"
                    style={{ background: 'var(--accent)', color: '#fff' }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Записати в картку
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-white">
                        {['ID', 'Найменування', 'Поле', 'Зараз', 'Прочитано', 'Маса, кг'].map(h => (
                          <th key={h} className="k-label text-left px-2.5 py-[7px] whitespace-nowrap"
                            style={{ borderBottom: '1.5px solid var(--ink)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => {
                        if (!l.changes.length) {
                          return (
                            <tr key={l.item.row} className="k-dash border-b">
                              <td className="px-2.5 py-[6px] font-mono text-[11.5px]" style={{ color: 'var(--ink-2)' }}>{l.item.id}</td>
                              <td className="px-2.5 py-[6px] truncate max-w-[280px]">{l.item.name}</td>
                              <td className="px-2.5 py-[6px] k-label" colSpan={3}>усе вже збігається</td>
                              <td className="px-2.5 py-[6px] font-mono text-[11.5px] text-right">
                                {l.mass ? l.mass.toFixed(2) : <span className="k-empty">—</span>}
                              </td>
                            </tr>
                          );
                        }
                        return l.changes.map((c, ci) => {
                          const off = skip.has(`${l.item.row}:${c.field}`)
                            || (c.conflict && !applyConflicts)
                            || (c.multi && !applyMulti);
                          return (
                            <tr key={`${l.item.row}:${c.field}`} className="k-dash border-b"
                              style={off ? { opacity: 0.45 }
                                : c.conflict ? { background: 'var(--amber-bg)' }
                                : c.multi ? { background: 'var(--blue-bg)' } : undefined}>
                              <td className="px-2.5 py-[6px] font-mono text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                                {ci === 0 ? l.item.id : ''}
                              </td>
                              <td className="px-2.5 py-[6px] truncate max-w-[280px]">
                                {ci === 0 && (
                                  <>
                                    {l.item.name}
                                    {l.route && <span className="k-label ml-1.5">маршрут · {l.item.op}</span>}
                                  </>
                                )}
                              </td>
                              <td className="px-2.5 py-[6px]">
                                <button onClick={() => flipSkip(l.item.row, c.field)} className="k-chip press"
                                  title={off ? 'Увімкнути цю правку' : 'Не писати це поле'}>
                                  {FIELD_LABEL[c.field]}
                                </button>
                              </td>
                              <td className="px-2.5 py-[6px]">
                                {c.was || <span className="k-empty">порожньо</span>}
                              </td>
                              <td className="px-2.5 py-[6px] font-semibold" style={{ color: 'var(--green)' }}>
                                {c.now}
                              </td>
                              <td className="px-2.5 py-[6px] font-mono text-[11.5px] text-right">
                                {ci === 0 && (l.mass ? l.mass.toFixed(2) : <span className="k-empty">—</span>)}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>

                  {/* Розбіжності ваги — окремо, це вже не запис, а перевірка */}
                  {weight.mismatch.length > 0 && (
                    <div className="m-3 rounded-xl overflow-hidden" style={{ boxShadow: 'inset 0 0 0 1px var(--amber-line)' }}>
                      <p className="k-head px-3 py-1.5" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
                        Маса зі штампа не сходиться з геометрією
                      </p>
                      {weight.mismatch.map(m => (
                        <p key={m.item.row} className="px-3 py-1.5 text-[12px] border-t hairline">
                          <span className="font-mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{m.item.id}</span>{' '}
                          {m.item.name}: у штампі <b>{m.stamp.toFixed(2)}</b> кг,
                          за габаритами й товщиною виходить <b>{m.calc.toFixed(2)}</b> кг —
                          варто перевірити товщину або матеріал.
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 px-4 py-2 border-t hairline">
          <p className="k-label">
            Жовтим — де вже щось вписано руками; такі поля не перезаписуються, поки не дозволите.
            Повторне читання тих самих файлів безкоштовне — береться з аркуша «Розбір».
          </p>
        </div>
      </div>
    </div>
  );
}
