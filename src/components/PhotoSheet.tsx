// ================================================================
//  src/components/PhotoSheet.tsx — 🎨 «Фотошоп» для креслень:
//  вибрати PDF із замовлення → чорні/білі прямокутники поверх
//  конфіденційної інформації (мишею або пальцем) → зберегти.
//  Сторінки растеризуються (як у таблиці) — текст під прямокутником
//  зникає назавжди; новий файл замінює старий, посилання в картці
//  оновлюється автоматично.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Paintbrush, Loader2, Undo2, ChevronLeft, ChevronRight, Save, Square, ExternalLink,
} from 'lucide-react';
import { api } from '../api';
import { OrderDetail, OrderItem, fileKind } from '../types';
import { Rect, RenderedPage } from '../lib/photoPdf';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onSaved: () => void;
}

function driveId(url: string): string | null {
  const m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

type Phase = 'files' | 'render' | 'edit' | 'save' | 'done';

export default function PhotoSheet({ detail, onClose, onToast, onSaved }: Props) {
  const pdfItems = useMemo(
    () => detail.items.filter(i => !i.group && fileKind(i.name) === 'pdf' && driveId(i.url)),
    [detail.items],
  );

  const [phase, setPhase] = useState<Phase>('files');
  const [file, setFile] = useState<OrderItem | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [rects, setRects] = useState<Rect[][]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [color, setColor] = useState<'black' | 'white'>('black');
  const [savedUrl, setSavedUrl] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<Rect | null>(null); // актуальне значення для onUp (стан оновлюється асинхронно)
  const [preview, setPreview] = useState<Rect | null>(null);

  async function openFile(item: OrderItem) {
    setFile(item);
    setPhase('render');
    try {
      const fd = await api.fileData(driveId(item.url)!);
      const { renderDocument } = await import('../lib/photoPdf');
      const pgs = await renderDocument(fd.base64, fd.mime);
      setPages(pgs);
      setRects(pgs.map(() => []));
      setPageIdx(0);
      setPhase('edit');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відкрити файл', true);
      setPhase('files');
    }
  }

  // Малюємо сторінку + прямокутники на видимому канвасі
  useEffect(() => {
    if (phase !== 'edit' || !pages[pageIdx]) return;
    const src = pages[pageIdx];
    const canvas = canvasRef.current!;
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(src.canvas, 0, 0);
    for (const r of rects[pageIdx] || []) {
      ctx.fillStyle = r.color === 'white' ? '#fff' : '#000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (preview) {
      ctx.fillStyle = preview.color === 'white' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
      ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(preview.x, preview.y, preview.w, preview.h);
    }
  }, [phase, pages, rects, pageIdx, preview]);

  function toCanvasXY(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const b = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - b.left) * (canvas.width / b.width),
      y: (e.clientY - b.top) * (canvas.height / b.height),
    };
  }

  function onDown(e: React.PointerEvent) {
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* не критично */ }
    drag.current = toCanvasXY(e);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = toCanvasXY(e);
    const r: Rect = {
      x: Math.min(drag.current.x, p.x), y: Math.min(drag.current.y, p.y),
      w: Math.abs(p.x - drag.current.x), h: Math.abs(p.y - drag.current.y), color,
    };
    previewRef.current = r;
    setPreview(r);
  }
  function onUp() {
    const r = previewRef.current;
    if (drag.current && r && r.w > 4 && r.h > 4) {
      setRects(prev => prev.map((arr, i) => (i === pageIdx ? [...arr, r] : arr)));
    }
    drag.current = null;
    previewRef.current = null;
    setPreview(null);
  }
  function undo() {
    setRects(prev => prev.map((arr, i) => (i === pageIdx ? arr.slice(0, -1) : arr)));
  }

  const totalRects = rects.reduce((s, a) => s + a.length, 0);

  async function save() {
    if (!file) return;
    setPhase('save');
    try {
      const { assemblePdf } = await import('../lib/photoPdf');
      const base64 = await assemblePdf(pages, rects);
      const res = await api.savePdf(driveId(file.url)!, base64, file.name, file.row);
      setSavedUrl(res.newUrl);
      setPhase('done');
      onSaved();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
      setPhase('edit');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={phase === 'save' ? undefined : onClose} />
      <div className={`relative w-full ${phase === 'edit' ? 'lg:w-[900px]' : 'lg:w-[560px]'} max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden`}>

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
            <Paintbrush size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Фотошоп креслень</p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {file ? file.name : `${detail.header.orderNum || detail.header.projectId} · закрити конфіденційну інформацію`}
            </p>
          </div>
          {phase !== 'save' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Вибір файлу */}
        {phase === 'files' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1">
            {pdfItems.map(i => (
              <button key={i.row} onClick={() => openFile(i)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl ring-1 ring-gray-200/70 bg-white text-left press hover:bg-gray-50">
                <span className="text-[15px]">📄</span>
                <span className="flex-1 text-[12.5px] font-semibold truncate">{i.name}</span>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              </button>
            ))}
            {!pdfItems.length && (
              <p className="text-center text-[12.5px] py-10" style={{ color: 'var(--ink-3)' }}>
                У замовленні немає PDF із посиланнями
              </p>
            )}
          </div>
        )}

        {phase === 'render' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={26} className="animate-spin text-pink-600" />
            <p className="text-[13px] font-bold">Відкриваю креслення…</p>
          </div>
        )}

        {/* Редактор */}
        {phase === 'edit' && (
          <>
            <div className="flex-shrink-0 px-3 py-2 flex items-center gap-1.5 border-b hairline flex-wrap">
              <button onClick={() => setColor('black')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-colors"
                style={color === 'black' ? { background: '#111', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                <Square size={12} fill="currentColor" /> Чорний
              </button>
              <button onClick={() => setColor('white')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-colors ring-1 ring-gray-200"
                style={color === 'white' ? { background: '#fff', color: 'var(--accent)' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                <Square size={12} /> Білий
              </button>
              <button onClick={undo} disabled={!(rects[pageIdx] || []).length}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-40"
                style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                <Undo2 size={12} /> Відмінити
              </button>
              <span className="ml-auto text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {totalRects} прямок.
              </span>
              {pages.length > 1 && (
                <span className="flex items-center gap-0.5">
                  <button onClick={() => setPageIdx(p => Math.max(0, p - 1))} disabled={pageIdx === 0}
                    className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Попередня">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11.5px] font-bold tabular-nums">{pageIdx + 1}/{pages.length}</span>
                  <button onClick={() => setPageIdx(p => Math.min(pages.length - 1, p + 1))} disabled={pageIdx === pages.length - 1}
                    className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Наступна">
                    <ChevronRight size={15} />
                  </button>
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-gray-100 p-2 flex items-start justify-center">
              <canvas
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                className="max-w-full h-auto shadow-lg rounded-sm touch-none cursor-crosshair bg-white"
              />
            </div>

            <div className="flex-shrink-0 p-3 border-t hairline flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={() => { setPhase('files'); setFile(null); setPages([]); setRects([]); }}
                className="px-4 py-2.5 rounded-2xl font-bold text-[12.5px] press border" style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                ← Файли
              </button>
              <button onClick={save} disabled={!totalRects}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                style={{ background: '#DB2777' }}>
                <Save size={15} /> Зберегти ({totalRects} прямок.)
              </button>
            </div>
          </>
        )}

        {phase === 'save' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={26} className="animate-spin text-pink-600" />
            <p className="text-[13px] font-bold">Збираю PDF і зберігаю на Диск…</p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Старий файл піде в кошик, посилання в картці оновиться</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Збережено</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                Конфіденційну інформацію закрито, посилання в картці оновлено
              </p>
            </div>
            <div className="flex gap-2">
              <a href={savedUrl} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press text-center inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <ExternalLink size={15} /> Відкрити файл
              </a>
              <button onClick={() => { setPhase('files'); setFile(null); setPages([]); setRects([]); }}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] press border"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                Ще файл
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
