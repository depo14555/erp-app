// ================================================================
//  src/components/FileReplaceSheet.tsx — 🔄 Заміна КД з додатка.
//  Той самий процес, що й діалог «Заміна файлів» у таблиці: кидаєш
//  нові версії креслень, система зіставляє їх з позиціями картки за
//  числовим ядром децимальника, показує пари на перевірку — і міняє.
//  Хаб при цьому: старий файл → «_Замінені/<дата>», рядок
//  перелінковується, копія в папці виконавця (якщо КД вже
//  розподілене) теж оновлюється, кеш ШІ по файлу скидається,
//  на позиції з'являється мітка 🔄.
// ================================================================

import { useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Loader2, Upload, Check, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { OrderDetail } from '../types';
import { normalizeDecimal } from '../lib/decimal';

interface Props {
  detail: OrderDetail;
  /** Відкрито з перегляду конкретної позиції — вона стає ціллю за замовчуванням. */
  preselectRow?: number | null;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Після успішних замін — перечитати замовлення. */
  onDone: () => void;
}

interface Pick_ {
  file: File;
  name: string;
  /** Рядок картки, куди ставимо; 0 = не заміняти. */
  row: number;
  /** Ціль знайдена автоматично за децимальником. */
  auto: boolean;
}

interface Result { name: string; ok: boolean; msg: string; }

/** Файл → base64 без префікса data-URL (надійно для бінарників). */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    r.readAsDataURL(file);
  });
}

export default function FileReplaceSheet({ detail, preselectRow, onClose, onToast, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick_[]>([]);
  const [busy, setBusy] = useState<{ i: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  /** Кандидати на заміну: реальні позиції картки (не збірки). */
  const targets = useMemo(
    () => detail.items.filter(i => !i.group && i.name),
    [detail.items],
  );
  const coreOf = useMemo(() => {
    const m = new Map<number, string>();
    targets.forEach(i => m.set(i.row, normalizeDecimal(i.name)));
    return m;
  }, [targets]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Pick_[] = [...picks];
    Array.from(list).forEach(file => {
      if (next.some(p => p.name === file.name)) return;
      const core = normalizeDecimal(file.name);
      // Збіг за ядром децимальника; серед маршрутних рядків-двійників
      // (PDF-креслення і DXF-розгортка з одним ядром) перевага тому,
      // що має те саме розширення, що й новий файл
      const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
      let cands = core ? targets.filter(t => coreOf.get(t.row) === core) : [];
      if (!cands.length) {
        // Файл без децимальника (F01_Plyta_...) — збіг за початком імені:
        // нова версія зазвичай стара назва + суфікс «_зм2»
        const stem = file.name.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
        const pref = targets.filter(t => {
          const ts = t.name.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
          return ts.length > 5 && (stem.startsWith(ts) || ts.startsWith(stem));
        });
        // Маршрутні рядки дублюють один файл — рахуємо унікальні ІМЕНА
        const uniq = new Set(pref.map(t => t.name.toLowerCase()));
        if (pref.length && uniq.size <= 3) cands = pref;
      }
      const hit = cands.find(t => ext && t.name.toLowerCase().endsWith('.' + ext)) || cands[0];
      const row = hit ? hit.row
        : (list.length === 1 && preselectRow ? preselectRow : 0);
      next.push({ file, name: file.name, row, auto: !!hit });
    });
    setPicks(next);
  }

  const ready = picks.filter(p => p.row > 0);

  async function run() {
    if (!ready.length || busy) return;
    const out: Result[] = [];
    for (let i = 0; i < ready.length; i++) {
      const p = ready[i];
      setBusy({ i: i + 1, total: ready.length, name: p.name });
      try {
        const base64 = await toBase64(p.file);
        const r = await api.fileReplace({
          headerRow: detail.header.headerRow, row: p.row,
          name: p.name, mime: p.file.type || 'application/octet-stream', base64,
        });
        out.push({
          name: p.name, ok: true,
          msg: r.execUpdated ? `оновлено і у виконавця: ${r.execUpdated}` : (r.archived ? 'стара версія в архіві' : 'файл додано'),
        });
      } catch (e: any) {
        out.push({ name: p.name, ok: false, msg: e?.message || 'не вдалося' });
      }
      setResults([...out]);
    }
    setBusy(null);
    const okN = out.filter(r => r.ok).length;
    onToast(okN === out.length
      ? `🔄 Замінено ${okN} файл(ів)`
      : `Замінено ${okN} з ${out.length} — див. список`, okN !== out.length);
    if (okN) onDone();
  }

  const done = !busy && results.length > 0 && results.length >= ready.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[720px] max-h-[92dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <RefreshCw size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Заміна КД</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId} · стара версія — в «_Замінені», копія у виконавця оновиться
            </p>
          </div>
          <button onClick={onClose} disabled={!!busy} className="p-2 rounded-xl press disabled:opacity-40"
            style={{ color: 'var(--ink-3)' }} aria-label="Закрити"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {/* Вибір файлів */}
          <input ref={inputRef} type="file" multiple accept=".pdf,.dxf,.dwg,.png,.jpg,.jpeg"
            className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          <button onClick={() => inputRef.current?.click()} disabled={!!busy}
            className="w-full py-4 rounded-2xl text-[13px] font-bold press disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--blue-bg)', color: 'var(--blue)', boxShadow: 'inset 0 0 0 1px var(--blue-line)' }}>
            <Upload size={15} /> Вибрати нові версії креслень (можна кілька)
          </button>

          {/* Пари файл → позиція */}
          {picks.length > 0 && (
            <div className="space-y-1.5">
              {picks.map((p, i) => (
                <div key={p.name} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 p-2.5 rounded-xl"
                  style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                  {/* Рядок 1: ім'я файлу + вердикт; на ПК все в одну лінію */}
                  <span className="flex items-center gap-2 min-w-0 sm:flex-1">
                    <span className="text-[12.5px] font-semibold min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
                    {p.auto && <span className="k-chip flex-shrink-0"
                      style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-line)' }}>
                      збіг ✓
                    </span>}
                    {!p.row && <span className="k-chip flex-shrink-0"
                      style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                      виберіть позицію
                    </span>}
                    <button onClick={() => setPicks(prev => prev.filter((_, k) => k !== i))} disabled={!!busy}
                      className="p-1 rounded press flex-shrink-0 disabled:opacity-30" aria-label="Прибрати файл"
                      style={{ color: 'var(--ink-3)' }}><X size={13} /></button>
                  </span>
                  {/* Рядок 2: ціль — на телефоні на всю ширину, пальцем зручно */}
                  <select value={p.row} disabled={!!busy}
                    onChange={e => setPicks(prev => prev.map((x, k) => k === i ? { ...x, row: +e.target.value, auto: false } : x))}
                    className="k-input w-full sm:w-[300px] px-2 py-2 sm:py-1 rounded-lg text-[12px] outline-none flex-shrink-0">
                    <option value={0}>— не заміняти —</option>
                    {targets.map(t => (
                      <option key={t.row} value={t.row}>{t.id} · {t.name.slice(0, 46)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Хід та результати */}
          {busy && (
            <p className="text-[12px] font-bold flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" style={{ color: 'var(--blue)' }} />
              Заміняю {busy.i} з {busy.total}: {busy.name}
            </p>
          )}
          {results.map(r => (
            <p key={r.name} className="text-[12px] flex items-center gap-1.5">
              {r.ok ? <Check size={12} style={{ color: 'var(--green)' }} />
                : <AlertTriangle size={12} style={{ color: 'var(--red, #B3261E)' }} />}
              <span className="font-semibold">{r.name}</span>
              <span style={{ color: 'var(--ink-3)' }}>· {r.msg}</span>
            </p>
          ))}
        </div>

        <div className="flex-shrink-0 border-t hairline p-3 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="k-label flex-1">
            {ready.length ? `до заміни: ${ready.length}` : 'мітка 🔄 з’явиться на замінених позиціях'}
          </span>
          {done ? (
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-2xl text-[13px] font-bold text-white press"
              style={{ background: 'var(--green)' }}>Готово</button>
          ) : (
            <button onClick={run} disabled={!ready.length || !!busy}
              className="px-4 py-2.5 rounded-2xl text-[13px] font-bold text-white press disabled:opacity-40 flex items-center gap-2"
              style={{ background: 'var(--blue)' }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Замінити {ready.length || ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
