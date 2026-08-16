// ================================================================
//  src/components/PurchasedSheet.tsx — 🔩 Покупні вироби.
//
//  Беремо позиції Сл.Св (складальні креслення), читаємо їхні
//  специфікації і зводимо все, що треба купити: болти, гайки,
//  підшипники — з кількістю на одну збірку і на все замовлення.
//
//  Що бачить людина, а не тільки машина:
//   • з якої збірки взято позицію;
//   • сторінку і ДОСЛІВНИЙ рядок специфікації як доказ;
//   • впевненість — рядки з «low» підсвічені, їх варто глянути;
//   • правку можна внести тут же, і вона лягає в журнал поруч
//     із відповіддю ШІ (з цього росте вимірювана точність).
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, CheckSquare, Square, Sparkles, Save, ExternalLink,
  AlertTriangle, ShoppingCart, FileText, Check,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { AiBadge } from './Sidebar';
import { useBusy } from '../lib/busy';
import { api } from '../api';
import { parseDrawings, driveIdFromUrl, assemblyLabel, ParsedDrawing, ParseProgress } from '../lib/ai';
import { OrderDetail, OrderItem } from '../types';
import { num, qtyOf } from './ItemsTable';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Прочитали нові креслення — смузі вгорі є що перерахувати. */
  onParsed?: () => void;
}

/** Позиція зведення: одна номенклатура в межах однієї збірки. */
interface Line {
  key: string;
  assembly: string;
  assemblyRow: number;
  file: string;
  fileId: string;
  pos: string;
  code: string;
  name: string;
  perOne: number;
  sets: number;
  total: number;
  material: string;
  page: number;
  sourceText: string;
  confidence: 'high' | 'medium' | 'low';
  itemRow?: number;
  corrected?: string;
}

const CONF: Record<string, { bg: string; color: string; label: string }> = {
  high: { bg: '#ECFDF5', color: '#059669', label: 'точно' },
  medium: { bg: '#FEF3C7', color: '#92400E', label: 'перевірити' },
  low: { bg: '#FEF2F2', color: '#B91C1C', label: 'сумнівно' },
};

/** Позиції, які є складальними кресленнями. */
function isAssemblyRow(i: OrderItem): boolean {
  return !i.group
    && /\.pdf$/i.test(String(i.name || ''))
    && !!i.url
    && /сл\.?\s*-?\s*св|слюсар|зварюв|збир/i.test(String(i.op || ''));
}

export default function PurchasedSheet({ detail, onClose, onMinimize, onToast, onParsed }: Props) {
  const order = detail.header.projectId;
  const candidates = useMemo(() => detail.items.filter(isAssemblyRow), [detail.items]);

  const [sel, setSel] = useState<Set<number>>(() => new Set(candidates.map(i => i.row)));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<ParseProgress | null>(null);
  const [parsed, setParsed] = useState<ParsedDrawing[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [editing, setEditing] = useState<string>('');
  const [draft, setDraft] = useState('');
  const abort = useRef<AbortController | null>(null);
  useBusy(busy, 'Покупні');

  // Що вже записано в аркуш «Покупні» — показуємо одразу при відкритті
  useEffect(() => {
    api.purchasedGet(order)
      .then(d => { if (d.rows.length) setSavedAt(String(d.rows[0]['14'] || '')); })
      .catch(() => { /* не критично */ });
  }, [order]);

  const toggle = (row: number) =>
    setSel(prev => { const n = new Set(prev); n.has(row) ? n.delete(row) : n.add(row); return n; });

  async function run() {
    const picked = candidates.filter(i => sel.has(i.row));
    if (!picked.length) { onToast('Виберіть хоча б одну збірку', true); return; }
    setBusy(true);
    setParsed([]);
    abort.current = new AbortController();
    try {
      const files = picked.map(i => ({
        fileId: driveIdFromUrl(i.url), name: i.name, size: 0,
      })).filter(f => f.fileId);
      const res = await parseDrawings(order, files, {
        onProgress: setProg,
        signal: abort.current.signal,
      });
      setParsed(res);
      onParsed?.();          // смуга вгорі має перерахуватись одразу
      const bad = res.filter(r => r.error);
      const spent = res.reduce((s, r) => s + r.cost, 0);
      const cached = res.filter(r => r.fromCache).length;
      onToast(bad.length
        ? `Розібрано ${res.length - bad.length} з ${res.length}; не вдалося: ${bad[0].name}`
        : `✅ Розібрано ${res.length} · з кешу ${cached} · витрачено $${spent.toFixed(3)}`,
        bad.length > 0);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося розібрати', true);
    } finally {
      setBusy(false);
      setProg(null);
    }
  }

  /** Зведення: покупні з усіх розібраних збірок × кількість самих збірок. */
  const lines = useMemo<Line[]>(() => {
    const byFileId = new Map<string, OrderItem>();
    candidates.forEach(i => { const id = driveIdFromUrl(i.url); if (id) byFileId.set(id, i); });

    const out: Line[] = [];
    parsed.forEach(p => {
      const src = byFileId.get(p.fileId);
      const sets = src ? (qtyOf(src) || 1) : 1;
      p.items.filter(it => it.purchased).forEach(it => {
        const perOne = num(it.qty) || 0;
        out.push({
          key: `${p.fileId}:${it.pos}:${it.code}:${it.name}`,
          // Той самий підпис, що й у колонці «Збірка» картки — інакше
          // покупні не приліпляться до своєї групи в таблиці позицій
          assembly: assemblyLabel(p),
          assemblyRow: src?.row ?? 0,
          file: p.name, fileId: p.fileId,
          pos: it.pos, code: it.code, name: it.name,
          perOne, sets, total: perOne * sets,
          material: it.material, page: it.page, sourceText: it.sourceText,
          confidence: it.confidence, itemRow: it.row, corrected: it.corrected,
        });
      });
    });
    return out;
  }, [parsed, candidates]);

  /** Те саме, але згруповане по номенклатурі — це і є список на закупівлю. */
  const grouped = useMemo(() => {
    const m = new Map<string, { code: string; name: string; material: string; total: number; from: Line[] }>();
    lines.forEach(l => {
      // Ключ — назва разом із позначенням: «Гайка M6x30» і «Гайка M8x40» не одне й те саме
      const k = `${l.name} ${l.code}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const e = m.get(k) || { code: l.code, name: l.name, material: l.material, total: 0, from: [] };
      e.total += l.total;
      e.from.push(l);
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [lines]);

  const doubtful = lines.filter(l => l.confidence === 'low').length;

  async function save() {
    if (!lines.length) { onToast('Немає що записувати', true); return; }
    setSaving(true);
    try {
      const res = await api.purchasedSave(order, lines.map(l => ({
        assembly: l.assembly, file: l.file, pos: l.pos, code: l.code, name: l.name,
        perOne: l.perOne, sets: l.sets, total: l.total, material: l.material,
        confidence: l.confidence, page: l.page, sourceText: l.sourceText,
      })));
      setSavedAt(res.at || '');
      onToast(`💾 Записано в аркуш «Покупні»: ${res.saved} позицій`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося записати', true);
    } finally {
      setSaving(false);
    }
  }

  /** Правка лягає ПОРУЧ із відповіддю ШІ — це і є еталон, що росте сам. */
  async function correct(l: Line) {
    if (!l.itemRow) { onToast('Цей рядок ще не збережено в «Розбір»', true); return; }
    try {
      await api.aiCorrect(l.itemRow, draft);
      setParsed(prev => prev.map(p => p.fileId !== l.fileId ? p : {
        ...p, items: p.items.map(it => it.row === l.itemRow ? { ...it, corrected: draft } : it),
      }));
      setEditing('');
      onToast(draft ? `Виправлення збережено: ${draft}` : 'Виправлення знято');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти виправлення', true);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[1120px] max-h-[94dvh] lg:h-[92vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <ShoppingCart size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight flex items-center gap-1.5">
              Покупні вироби <AiBadge />
            </p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || order} · збірок Сл.Св: {candidates.length}
              {savedAt && ` · записано ${savedAt}`}
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
                return (
                  <button key={i.row} onClick={() => toggle(i.row)} disabled={busy}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left press disabled:opacity-60"
                    style={on ? { background: 'var(--accent-soft)' } : { background: '#FAFBFC' }}>
                    {on ? <CheckSquare size={14} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        : <Square size={14} className="text-gray-300 mt-0.5 flex-shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold truncate">{i.name}</span>
                      <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                        {i.id} · {qtyOf(i) || 1} шт
                        {got && !got.error && ` · покупних ${got.items.filter(x => x.purchased).length}`}
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
                style={{ background: '#EA580C' }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? 'Читаю специфікації…' : 'Знайти покупні'}
              </button>
              {prog && (
                <div className="mt-2">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.round(100 * prog.done / Math.max(prog.total, 1))}%`, background: '#EA580C' }} />
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

          {/* ПРАВОРУЧ: що треба купити */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!parsed.length && !busy && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <FileText size={30} className="text-gray-300" />
                <p className="text-[13px] font-bold">Виберіть збірки і натисніть «Знайти покупні»</p>
                <p className="text-[11.5px] max-w-[420px]" style={{ color: 'var(--ink-3)' }}>
                  Система прочитає специфікації складальних креслень, візьме звідти кріплення
                  й покупні вузли, помножить на кількість збірок і покаже, що саме треба закупити.
                  Кожен рядок можна перевірити — видно сторінку і дослівний текст.
                </p>
              </div>
            )}

            {!!parsed.length && (
              <>
                <div className="flex-shrink-0 px-3 py-2 border-b hairline flex items-center gap-2 flex-wrap">
                  <p className="text-[12px] font-bold">
                    До закупівлі: {grouped.length} <span style={{ color: 'var(--ink-3)' }}>найменувань</span>
                  </p>
                  {doubtful > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg"
                      style={CONF.low}>
                      <AlertTriangle size={11} /> перевірте {doubtful}
                    </span>
                  )}
                  <button onClick={save} disabled={saving || !lines.length}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-40"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Записати в «Покупні»
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                  {grouped.map(g => (
                    <div key={g.code + g.name} className="rounded-2xl ring-1 ring-gray-200/70 bg-white overflow-hidden">
                      <div className="px-3 py-2 flex items-center gap-2 bg-[#FAFBFC]">
                        <span className="min-w-0 flex-1">
                          {/* Постачальнику потрібен весь рядок разом: «Гайка M6x30 D10» */}
                          <span className="block text-[13px] font-bold truncate">
                            {[g.name, g.code && !String(g.name).includes(g.code) ? g.code : '']
                              .filter(Boolean).join(' ') || g.code}
                          </span>
                          {g.material && (
                            <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>{g.material}</span>
                          )}
                        </span>
                        <span className="text-[15px] font-bold tabular-nums flex-shrink-0" style={{ color: '#EA580C' }}>
                          {g.total} <span className="text-[11px] font-normal" style={{ color: 'var(--ink-3)' }}>шт</span>
                        </span>
                      </div>

                      <div className="divide-y hairline">
                        {g.from.map(l => (
                          <div key={l.key} className="px-3 py-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                                поз. {l.pos} · {l.assembly}
                              </span>
                              <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                                {l.perOne} × {l.sets} збірок = <b style={{ color: 'var(--ink-2)' }}>{l.total}</b>
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={CONF[l.confidence]}>
                                {CONF[l.confidence].label}
                              </span>
                              {l.corrected && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">
                                  виправлено: {l.corrected}
                                </span>
                              )}
                              <button onClick={() => { setEditing(l.key); setDraft(l.corrected || String(l.perOne)); }}
                                className="ml-auto text-[10.5px] font-bold press" style={{ color: 'var(--accent)' }}>
                                виправити
                              </button>
                            </div>
                            {l.sourceText && (
                              <p className="text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}
                                title={l.sourceText}>
                                стор. {l.page}: «{l.sourceText}»
                              </p>
                            )}
                            {editing === l.key && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') correct(l); if (e.key === 'Escape') setEditing(''); }}
                                  placeholder="як має бути"
                                  className="flex-1 px-2 py-1 rounded-lg bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12px]" />
                                <button onClick={() => correct(l)}
                                  className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold text-white press"
                                  style={{ background: 'var(--accent)' }}>Зберегти</button>
                                <button onClick={() => setEditing('')} className="p-1 press" style={{ color: 'var(--ink-3)' }}>
                                  <X size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {!grouped.length && (
                    <p className="text-center text-[12.5px] py-10" style={{ color: 'var(--ink-3)' }}>
                      У специфікаціях цих креслень покупних не знайдено
                    </p>
                  )}

                  {parsed.some(p => p.error) && (
                    <div className="rounded-2xl bg-red-50 p-3">
                      <p className="text-[12px] font-bold text-red-700 mb-1">Не вдалося прочитати:</p>
                      {parsed.filter(p => p.error).map(p => (
                        <p key={p.fileId} className="text-[11.5px] text-red-600 truncate">
                          {p.name} — {p.error}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {detail.header.folderUrl && (
          <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2">
            <a href={detail.header.folderUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-[11.5px] font-bold press" style={{ color: 'var(--ink-2)' }}>
              <ExternalLink size={12} /> Папка замовлення
            </a>
            <span className="ml-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
              Повторний розбір тих самих файлів безкоштовний — береться з аркуша «Розбір»
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
