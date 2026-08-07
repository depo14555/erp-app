// ================================================================
//  src/components/PrintSheet.tsx — друк креслень замовлення.
//  Як у таблиці: фільтр по операції / виконавцю / статусу, вибір
//  позицій, титульна сторінка з переліком. Плюс QR-код на кожному
//  кресленні — скан у цеху відкриває деталь у додатку.
// ================================================================

import { useMemo, useState } from 'react';
import { X, Printer, QrCode, Download, ExternalLink, Loader2, CheckSquare, Square } from 'lucide-react';
import { OrderDetail, fileKind } from '../types';
import type { PrintItem } from '../lib/printPdf';

/** Посилання на файл Google Drive → fileId (локально, щоб не тягнути pdf-lib у бандл). */
function driveFileId(url: string): string | null {
  const m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
}

type Phase = 'pick' | 'work' | 'done';

export default function PrintSheet({ detail, onClose, onToast }: Props) {
  const { header, items } = detail;

  // Друкуємо лише PDF з посиланням на файл
  const printable = useMemo(() =>
    items.filter(i => !i.group && fileKind(i.name) === 'pdf' && driveFileId(i.url)),
  [items]);

  const [fOp, setFOp] = useState('');
  const [fExec, setFExec] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [withQr, setWithQr] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<Phase>('pick');
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [result, setResult] = useState<{ url: string; name: string; pages: number; failed: string[] } | null>(null);

  const opts = useMemo(() => uniq(printable.map(i => i.op)), [printable]);
  const execs = useMemo(() => uniq(printable.map(i => i.executor)), [printable]);
  const statuses = useMemo(() => uniq(printable.map(i => i.rowStatus)), [printable]);

  const filtered = useMemo(() => printable.filter(i =>
    (!fOp || i.op === fOp) && (!fExec || i.executor === fExec) && (!fStatus || i.rowStatus === fStatus)
  ), [printable, fOp, fExec, fStatus]);

  const selected = filtered.filter(i => !excluded.has(i.row));

  function toggle(row: number) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });
  }
  function toggleAll() {
    setExcluded(prev => (filtered.some(i => !prev.has(i.row))
      ? new Set([...prev, ...filtered.map(i => i.row)])
      : new Set([...prev].filter(r => !filtered.some(i => i.row === r)))));
  }

  async function run() {
    if (!selected.length) { onToast('Нічого не вибрано', true); return; }
    setPhase('work');
    const filterLabel = [fOp, fExec, fStatus].filter(Boolean).join(' · ') || 'всі';
    const printItems: PrintItem[] = selected.map(i => ({
      fileId: driveFileId(i.url)!,
      fileName: i.name,
      id: i.id,
      qty: i.qty,
      operation: i.op,
      executor: i.executor,
    }));
    try {
      // pdf-lib важкий — вантажимо окремим чанком лише при друці
      const { buildPrintPdf } = await import('../lib/printPdf');
      const res = await buildPrintPdf({
        orderNum: header.orderNum,
        projectId: header.projectId,
        filterLabel,
        items: printItems,
        withQr,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      const ab = new ArrayBuffer(res.bytes.byteLength);
      new Uint8Array(ab).set(res.bytes);
      const blob = new Blob([ab], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const name = `Друк_${header.orderNum || header.projectId}_${filterLabel}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
      setResult({ url, name, pages: res.pages, failed: res.failed });
      setPhase('done');
      window.open(url, '_blank');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зібрати PDF', true);
      setPhase('pick');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className="relative w-full lg:w-[560px] max-h-[92dvh] lg:max-h-[85vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Printer size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Друк креслень</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {header.orderNum || header.projectId} · PDF з посиланням: {printable.length}
            </p>
          </div>
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'pick' && (
          <>
            {/* Фільтри */}
            <div className="flex-shrink-0 px-4 pt-3 grid grid-cols-3 gap-1.5">
              <FilterSelect value={fOp} onChange={setFOp} label="Операція" options={opts} />
              <FilterSelect value={fExec} onChange={setFExec} label="Виконавець" options={execs} />
              <FilterSelect value={fStatus} onChange={setFStatus} label="Статус" options={statuses} />
            </div>

            {/* QR перемикач */}
            <button onClick={() => setWithQr(v => !v)}
              className="flex-shrink-0 mx-4 mt-2.5 flex items-center gap-2.5 p-2.5 rounded-2xl border transition-colors"
              style={withQr ? { background: 'var(--accent-soft)', borderColor: 'transparent' } : { borderColor: 'var(--line)' }}>
              <QrCode size={17} style={{ color: withQr ? 'var(--accent)' : 'var(--ink-3)' }} />
              <span className="flex-1 text-left">
                <span className="block text-[12.5px] font-bold" style={{ color: withQr ? 'var(--accent)' : 'var(--ink-2)' }}>
                  QR-код на кожному кресленні
                </span>
                <span className="block text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                  Скан у цеху відкриє деталь: статус, фото, примітка
                </span>
              </span>
              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${withQr ? 'bg-[var(--accent)]' : 'bg-gray-300'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${withQr ? 'translate-x-4' : ''}`} />
              </span>
            </button>

            {/* Список позицій */}
            <div className="flex-shrink-0 px-4 pt-2.5 pb-1 flex items-center">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-[11.5px] font-bold press rounded-lg px-1 py-0.5"
                style={{ color: 'var(--accent)' }}>
                {filtered.some(i => !excluded.has(i.row)) ? <CheckSquare size={14} /> : <Square size={14} />}
                Вибрано {selected.length} з {filtered.length}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-0.5">
              {filtered.map(i => {
                const on = !excluded.has(i.row);
                return (
                  <button key={i.row} onClick={() => toggle(i.row)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left hover:bg-gray-50 press">
                    {on ? <CheckSquare size={15} className="flex-shrink-0 text-[var(--accent)]" />
                        : <Square size={15} className="flex-shrink-0 text-gray-300" />}
                    <span className={`flex-1 text-[12px] truncate ${on ? '' : 'text-gray-400'}`}>{i.name}</span>
                    {i.qty && <span className="text-[10.5px] font-semibold text-gray-400 tabular-nums flex-shrink-0">{i.qty} шт</span>}
                    {i.op && <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md flex-shrink-0">{i.op}</span>}
                  </button>
                );
              })}
              {!filtered.length && (
                <p className="text-center text-[12.5px] py-8" style={{ color: 'var(--ink-3)' }}>
                  Немає PDF-креслень під цей фільтр
                </p>
              )}
            </div>

            {/* Кнопка */}
            <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={run} disabled={!selected.length}
                className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                🖨️ Зібрати PDF · {selected.length} крес.
              </button>
            </div>
          </>
        )}

        {phase === 'work' && (
          <div className="p-8 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            <p className="text-[13.5px] font-bold">{progress.done} / {progress.total}</p>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${progress.total ? Math.round(100 * progress.done / progress.total) : 0}%`,
                background: 'var(--accent)',
              }} />
            </div>
            <p className="text-[11.5px] truncate max-w-full" style={{ color: 'var(--ink-3)' }}>{progress.label}</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">PDF зібрано — {result.pages} креслень</p>
              <p className="text-[11.5px] mt-0.5 break-all" style={{ color: 'var(--ink-3)' }}>{result.name}</p>
            </div>
            {result.failed.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] leading-relaxed">
                Не додано ({result.failed.length}): {result.failed.slice(0, 5).join('; ')}{result.failed.length > 5 ? '…' : ''}
              </div>
            )}
            <div className="flex gap-2">
              <a href={result.url} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press text-center inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <ExternalLink size={15} /> Відкрити
              </a>
              <a href={result.url} download={result.name}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] press text-center inline-flex items-center justify-center gap-1.5 border"
                style={{ color: 'var(--accent)', borderColor: 'var(--line)' }}>
                <Download size={15} /> Завантажити
              </a>
            </div>
            <button onClick={onClose} className="w-full py-2 text-[12.5px] font-semibold press rounded-xl" style={{ color: 'var(--ink-3)' }}>
              Закрити
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.trim()).filter(Boolean))].sort();
}

function FilterSelect({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: string[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full appearance-none pl-2.5 pr-6 py-2 rounded-xl text-[11.5px] font-semibold border outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        style={{ borderColor: value ? 'var(--accent)' : 'var(--line)', color: value ? 'var(--accent)' : 'var(--ink-2)' }}>
        <option value="">{label}: всі</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'var(--ink-3)' }}>▼</span>
    </div>
  );
}
