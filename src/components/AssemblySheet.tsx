// ================================================================
//  src/components/AssemblySheet.tsx — 🧩 Склад збірок.
//
//  Читаємо специфікації складальних креслень і розкладаємо позиції
//  замовлення по збірках: що в яку входить. Далі колонка «Збірка»
//  заповнюється в картці, і завдання в додатку групуються — видно
//  збірку і що в неї входить, а решта лягає в «Без збірок».
//
//  Зіставлення йде по ЧИСЛОВОМУ ЯДРУ децимальника (той самий номер
//  буває з літерним шифром і без), запасний ключ — назва без розділових.
//  Те саме робить хаб у erp.fillAssembly, тож ключі однакові з обох боків.
//
//  Чесність важливіша за красиву цифру: показуємо і те, що зі
//  специфікації не знайшлося в замовленні, і те, що в замовленні є,
//  але в жодну збірку не входить.
// ================================================================

import { useMemo, useRef, useState } from 'react';
import {
  X, Loader2, CheckSquare, Square, Sparkles, Save, AlertTriangle,
  Blocks, FileText, Check, ChevronDown, ChevronRight,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { AiBadge } from './Sidebar';
import { useBusy } from '../lib/busy';
import { api } from '../api';
import {
  parseDrawings, driveIdFromUrl, decimalCore, normName, assemblyLabel,
  ParsedDrawing, ParseProgress,
} from '../lib/ai';
import { OrderDetail, OrderItem } from '../types';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Після запису — перечитати картку, щоб колонка «Збірка» з'явилась. */
  onRefresh: (label?: string) => void;
  /** Прочитали нові креслення — смузі вгорі є що перерахувати. */
  onParsed?: () => void;
}

/** Позиції, які є складальними кресленнями. */
function isAssemblyRow(i: OrderItem): boolean {
  return !i.group
    && /\.pdf$/i.test(String(i.name || ''))
    && !!i.url
    && /сл\.?\s*-?\s*св|слюсар|зварюв|збир/i.test(String(i.op || ''));
}

/** «1 позиція · 4 позиції · 5 позицій» — щоб підпис читався як українська. */
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return few;
  return many;
}

/** Рядок складу: позиція специфікації і що їй відповідає в замовленні. */
interface Part {
  key: string;
  assembly: string;
  pos: string;
  code: string;
  name: string;
  qty: string;
  /** Рядки замовлення, що збіглися. */
  rows: OrderItem[];
  /** Ця ж деталь уже віднесена до іншої збірки (спільна деталь). */
  alsoIn?: string;
}

export default function AssemblySheet({ detail, onClose, onMinimize, onToast, onRefresh, onParsed }: Props) {
  const order = detail.header.projectId;
  const candidates = useMemo(() => detail.items.filter(isAssemblyRow), [detail.items]);

  const [sel, setSel] = useState<Set<number>>(() => new Set(candidates.map(i => i.row)));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<ParseProgress | null>(null);
  const [parsed, setParsed] = useState<ParsedDrawing[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  useBusy(busy, 'Склад збірок');

  const toggle = (row: number) =>
    setSel(prev => { const n = new Set(prev); n.has(row) ? n.delete(row) : n.add(row); return n; });

  async function run() {
    const picked = candidates.filter(i => sel.has(i.row));
    if (!picked.length) { onToast('Виберіть хоча б одну збірку', true); return; }
    setBusy(true);
    setParsed([]);
    abort.current = new AbortController();
    try {
      const files = picked.map(i => ({ fileId: driveIdFromUrl(i.url), name: i.name, size: 0 }))
        .filter(f => f.fileId);
      const res = await parseDrawings(order, files, {
        onProgress: setProg,
        signal: abort.current.signal,
      });
      setParsed(res);
      onParsed?.();          // смуга вгорі має перерахуватись одразу
      setOpen(new Set(res.filter(r => !r.error).map(r => r.fileId)));
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

  /** Позиції замовлення за ключами зіставлення — щоб знайти рядок деталі. */
  const index = useMemo(() => {
    const byCore = new Map<string, OrderItem[]>();
    const byName = new Map<string, OrderItem[]>();
    detail.items.forEach(i => {
      if (i.group || !i.name) return;
      const c = decimalCore(i.name);
      if (c) { const a = byCore.get(c) || []; a.push(i); byCore.set(c, a); }
      const n = normName(i.name);
      if (n) { const a = byName.get(n) || []; a.push(i); byName.set(n, a); }
    });
    return { byCore, byName };
  }, [detail.items]);

  /** Склад по збірках + карта для запису в картку. */
  const { groups, map, missing, orphans } = useMemo(() => {
    const groups: Array<{ p: ParsedDrawing; label: string; parts: Part[]; own: OrderItem | null }> = [];
    const map: Record<string, string> = {};
    const claimed = new Set<number>();   // рядки, що вже потрапили в якусь збірку
    const owner: Record<string, string> = {}; // ключ → перша збірка, що його зайняла
    let missing = 0;

    parsed.filter(p => !p.error).forEach(p => {
      const label = assemblyLabel(p);
      const parts: Part[] = [];

      // Саме складальне креслення теж належить своїй збірці
      const own = candidates.find(i => driveIdFromUrl(i.url) === p.fileId) || null;
      if (own) {
        claimed.add(own.row);
        const c = decimalCore(own.name); if (c && !owner[c]) { map[c] = label; owner[c] = label; }
        const n = normName(own.name); if (n && !owner[n]) { map[n] = label; owner[n] = label; }
      }

      p.items.filter(it => !it.purchased).forEach(it => {
        const core = decimalCore(it.code) || decimalCore(it.name);
        const nm = normName(it.name);
        const rows = (core && index.byCore.get(core)) || (nm && index.byName.get(nm)) || [];
        rows.forEach(r => claimed.add(r.row));
        if (!rows.length) missing++;

        const already = (core && owner[core]) || (nm && owner[nm]) || '';
        if (core && !owner[core]) { map[core] = label; owner[core] = label; }
        if (nm && !owner[nm]) { map[nm] = label; owner[nm] = label; }

        parts.push({
          key: `${p.fileId}:${it.pos}:${it.code}:${it.name}`,
          assembly: label, pos: it.pos, code: it.code, name: it.name, qty: it.qty,
          rows, alsoIn: already && already !== label ? already : undefined,
        });
      });

      groups.push({ p, label, parts, own });
    });

    const orphans = groups.length
      ? detail.items.filter(i => !i.group && i.name && !claimed.has(i.row))
      : [];
    return { groups, map, missing, orphans };
  }, [parsed, candidates, index, detail.items]);

  const matched = groups.reduce((s, g) => s + g.parts.filter(p => p.rows.length).length, 0);

  async function save() {
    if (!Object.keys(map).length) { onToast('Немає що записувати', true); return; }
    setSaving(true);
    try {
      const res = await api.fillAssembly(detail.header.headerRow, map);
      onToast(`💾 Збірку проставлено ${res.updated} позиціям`);
      onRefresh('Проставляю збірки…');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося записати', true);
    } finally {
      setSaving(false);
    }
  }

  const flip = (id: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[1120px] max-h-[94dvh] lg:h-[92vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <Blocks size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight flex items-center gap-1.5">
              Склад збірок <AiBadge />
            </p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || order} · збірок Сл.Св: {candidates.length}
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

          {/* ЛІВОРУЧ: які збірки читаємо */}
          <div className="lg:w-[340px] flex-shrink-0 lg:border-r hairline flex flex-col min-h-0">
            <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
              <button onClick={() => setSel(sel.size === candidates.length ? new Set() : new Set(candidates.map(i => i.row)))}
                className="p-1 press" aria-label="Вибрати все">
                {sel.size === candidates.length && candidates.length > 0
                  ? <CheckSquare size={15} className="text-[var(--accent)]" />
                  : <Square size={15} className="text-gray-300" />}
              </button>
              <p className="text-[12px] font-bold flex-1">
                Складальні креслення <span style={{ color: 'var(--ink-3)' }}>({sel.size} з {candidates.length})</span>
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {candidates.map(i => {
                const on = sel.has(i.row);
                const got = parsed.find(p => p.fileId === driveIdFromUrl(i.url));
                const g = groups.find(x => x.p.fileId === got?.fileId);
                return (
                  <button key={i.row} onClick={() => toggle(i.row)} disabled={busy}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left press disabled:opacity-60"
                    style={on ? { background: 'var(--accent-soft)' } : { background: '#FAFBFC' }}>
                    {on ? <CheckSquare size={14} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        : <Square size={14} className="text-gray-300 mt-0.5 flex-shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold truncate">{i.name}</span>
                      <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                        {i.id}
                        {g && ` · деталей ${g.parts.length}`}
                        {got?.fromCache && ' · з кешу'}
                      </span>
                    </span>
                    {got?.error && <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />}
                    {got && !got.error && <Check size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })}
              {!candidates.length && (
                <p className="text-center text-[12px] py-10" style={{ color: 'var(--ink-3)' }}>
                  У цьому замовленні немає позицій з операцією Сл.Св і PDF-кресленням
                </p>
              )}
            </div>

            <div className="flex-shrink-0 p-2.5 border-t hairline">
              <button onClick={run} disabled={busy || !sel.size}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-[13px] text-white press disabled:opacity-40"
                style={{ background: '#7C3AED' }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? 'Читаю специфікації…' : 'Прочитати склад'}
              </button>
              {prog && (
                <div className="mt-2">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.round(100 * prog.done / Math.max(prog.total, 1))}%`, background: '#7C3AED' }} />
                  </div>
                  <p className="text-[10.5px] mt-1 truncate" style={{ color: 'var(--ink-3)' }}>
                    {prog.done} з {prog.total}
                    {prog.cached ? ` · з кешу ${prog.cached}` : ''}
                    {prog.cost ? ` · $${prog.cost.toFixed(3)}` : ''}
                    {prog.name ? ` · ${prog.name}` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ПРАВОРУЧ: що в яку збірку входить */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!groups.length && !busy && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <FileText size={30} className="text-gray-300" />
                <p className="text-[13px] font-bold">Виберіть збірки і натисніть «Прочитати склад»</p>
                <p className="text-[11.5px] max-w-[440px]" style={{ color: 'var(--ink-3)' }}>
                  Система прочитає специфікації і розкладе позиції замовлення по збірках.
                  Після запису колонка «Збірка» заповниться в картці, а завдання в додатку
                  згрупуються: збірка і що в неї входить, решта — у «Без збірок».
                </p>
              </div>
            )}

            {!!groups.length && (
              <>
                <div className="flex-shrink-0 px-3 py-2 border-b hairline flex items-center gap-2 flex-wrap">
                  <p className="text-[12.5px] font-bold">
                    Знайдено в замовленні: <span className="text-[var(--accent)]">{matched}</span>{' '}
                    {plural(matched, 'позиція', 'позиції', 'позицій')}
                  </p>
                  {missing > 0 && (
                    <span className="text-[11px] font-bold flex items-center gap-1 text-amber-700">
                      <AlertTriangle size={12} /> нема в замовленні: {missing}
                    </span>
                  )}
                  {orphans.length > 0 && (
                    <span className="text-[11px] font-bold" style={{ color: 'var(--ink-3)' }}>
                      без збірки: {orphans.length}
                    </span>
                  )}
                  <button onClick={save} disabled={saving}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[12px] press disabled:opacity-50"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Проставити «Збірку» в картці
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                  {groups.map(g => {
                    const on = open.has(g.p.fileId);
                    const inOrder = g.parts.filter(p => p.rows.length).length;
                    return (
                      <div key={g.p.fileId} className="rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
                        <button onClick={() => flip(g.p.fileId)}
                          className="w-full px-3 py-2 flex items-center gap-2 bg-[#FAFBFC] text-left press">
                          {on ? <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                              : <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold truncate">{g.label}</span>
                            <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                              {g.p.designation || g.p.name}
                              {g.p.mass && ` · маса ${g.p.mass}`}
                            </span>
                          </span>
                          <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: '#7C3AED' }}>
                            {inOrder}/{g.parts.length}
                          </span>
                        </button>

                        {on && (
                          <div className="divide-y hairline">
                            {g.parts.map(part => (
                              <div key={part.key} className="px-3 py-1.5 flex items-start gap-2">
                                <span className="text-[11px] tabular-nums w-6 flex-shrink-0 pt-0.5" style={{ color: 'var(--ink-3)' }}>
                                  {part.pos}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[12px] font-semibold truncate">
                                    {part.name} {part.code && <span className="font-normal" style={{ color: 'var(--ink-3)' }}>{part.code}</span>}
                                  </span>
                                  <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                                    {part.rows.length
                                      ? `у замовленні: ${part.rows.map(r => r.id).join(', ')}`
                                      : 'нема в замовленні'}
                                    {part.alsoIn && ` · також у «${part.alsoIn}»`}
                                  </span>
                                </span>
                                <span className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
                                  {part.qty || '—'} шт
                                </span>
                                {part.rows.length
                                  ? <Check size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                  : <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {orphans.length > 0 && (
                    <div className="rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
                      <div className="px-3 py-2 bg-[#FAFBFC] flex items-center gap-2">
                        <span className="text-[13px] font-bold flex-1">Без збірок</span>
                        <span className="text-[11.5px] font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          {orphans.length}
                        </span>
                      </div>
                      <div className="divide-y hairline max-h-[220px] overflow-y-auto">
                        {orphans.slice(0, 60).map(i => (
                          <div key={i.row} className="px-3 py-1.5 flex items-center gap-2">
                            <span className="text-[10.5px] font-mono flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{i.id}</span>
                            <span className="text-[12px] truncate flex-1">{i.name}</span>
                            <span className="text-[10.5px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{i.op}</span>
                          </div>
                        ))}
                      </div>
                      {orphans.length > 60 && (
                        <p className="px-3 py-1.5 text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          …і ще {orphans.length - 60}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 px-4 py-2 border-t hairline flex items-center gap-3">
          <p className="text-[10.5px] flex-1" style={{ color: 'var(--ink-3)' }}>
            Спільна деталь лишається за першою збіркою, де вона зустрілась — це видно в списку.
          </p>
          <p className="text-[10.5px] hidden lg:block" style={{ color: 'var(--ink-3)' }}>
            Повторне читання тих самих файлів безкоштовне — береться з аркуша «Розбір»
          </p>
        </div>
      </div>
    </div>
  );
}
