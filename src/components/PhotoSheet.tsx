// ================================================================
//  src/components/PhotoSheet.tsx — 🎨 «Фотошоп» креслень, як у
//  таблиці: файли беруться З ПАПКИ замовлення (PDF + JPG/PNG),
//  фільтр «оброблені / ні» (позначка живе на файлі в Диску),
//  навігація між файлами (кнопки і стрілки ←→), сусідні файли
//  підвантажуються наперед — відкриття миттєве. Прямокутники
//  чорні/білі, растеризація: текст під ними зникає назавжди.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Paintbrush, Loader2, Undo2, ChevronLeft, ChevronRight, Save, Square,
  ExternalLink, ArrowLeft, ArrowRight, Search,
} from 'lucide-react';
import { api } from '../api';
import { OrderDetail, FolderFile } from '../types';
import { Rect, RenderedPage } from '../lib/photoPdf';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onSaved: () => void;
}

type Phase = 'load' | 'files' | 'render' | 'edit' | 'save' | 'done';
type Filter = '' | 'todo' | 'done';

// Кеш рендерів ЖИВЕ поза компонентом — повторне відкриття шторки миттєве
const renderCache = new Map<string, RenderedPage[]>();

export default function PhotoSheet({ detail, onClose, onToast, onSaved }: Props) {
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [phase, setPhase] = useState<Phase>('load');
  const [filter, setFilter] = useState<Filter>('todo');
  const [q, setQ] = useState('');
  const [file, setFile] = useState<FolderFile | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [rects, setRects] = useState<Rect[][]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [color, setColor] = useState<'black' | 'white'>('black');
  const [savedUrl, setSavedUrl] = useState('');
  const prefetching = useRef<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<Rect | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);

  useEffect(() => {
    api.folderFiles(detail.header.headerRow)
      .then(d => { setFiles(d.files); setPhase('files'); })
      .catch(e => { onToast(e?.message || 'Не вдалося прочитати папку', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => files.filter(f => {
    if (filter === 'todo' && f.processed) return false;
    if (filter === 'done' && !f.processed) return false;
    const query = q.trim().toLowerCase();
    return !query || f.name.toLowerCase().includes(query) || f.folderName.toLowerCase().includes(query);
  }), [files, filter, q]);

  const stats = useMemo(() => ({
    todo: files.filter(f => !f.processed).length,
    done: files.filter(f => f.processed).length,
  }), [files]);

  const fileIdx = file ? visible.findIndex(v => v.id === file.id) : -1;

  /** Рендер файлу в кеш (без зміни стану) — для передзавантаження. */
  async function renderToCache(f: FolderFile): Promise<RenderedPage[]> {
    const hit = renderCache.get(f.id);
    if (hit) return hit;
    const fd = await api.fileData(f.id);
    const { renderDocument } = await import('../lib/photoPdf');
    const rendered = await renderDocument(fd.base64, fd.mime);
    renderCache.set(f.id, rendered);
    return rendered;
  }

  /** Тихе передзавантаження наступних необроблених файлів. */
  function prefetchNext(from: FolderFile, count = 2) {
    const start = visible.findIndex(v => v.id === from.id);
    let queued = 0;
    for (let i = start + 1; i < visible.length && queued < count; i++) {
      const f = visible[i];
      if (f.processed || renderCache.has(f.id) || prefetching.current.has(f.id)) continue;
      prefetching.current.add(f.id);
      queued++;
      renderToCache(f).catch(() => {}).finally(() => prefetching.current.delete(f.id));
    }
  }

  async function openFile(f: FolderFile) {
    setFile(f);
    setPhase(renderCache.has(f.id) ? 'edit' : 'render');
    try {
      const rendered = await renderToCache(f);
      setPages(rendered);
      setRects(rendered.map(() => []));
      setPageIdx(0);
      setPhase('edit');
      prefetchNext(f);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відкрити файл', true);
      setPhase('files');
    }
  }

  function step(dir: 1 | -1) {
    if (fileIdx < 0) return;
    const next = visible[fileIdx + dir];
    if (next) openFile(next);
  }

  /** Наступний необроблений після поточного (для автопереходу після збереження). */
  function nextTodo(): FolderFile | null {
    for (let i = fileIdx + 1; i < visible.length; i++) {
      if (!visible[i].processed) return visible[i];
    }
    return null;
  }

  // Стрілки ←/→ — гортання файлів у редакторі
  useEffect(() => {
    if (phase !== 'edit') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fileIdx, visible]);

  // Малювання сторінки + прямокутників
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
      const res = await api.savePdf(file.id, base64, file.name, file.row || undefined);
      renderCache.delete(file.id);
      setFiles(prev => prev.map(f => (f.id === file.id
        ? { ...f, id: res.newId, name: res.newName, processed: true }
        : f)));
      setSavedUrl(res.newUrl);
      setPhase('done');
      onSaved();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
      setPhase('edit');
    }
  }

  const backToFiles = () => { setPhase('files'); setFile(null); setPages([]); setRects([]); };

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={phase === 'save' ? undefined : onClose} />
      <div className={`relative w-full ${phase === 'edit' ? 'lg:w-[980px]' : 'lg:w-[600px]'} max-h-[94dvh] lg:max-h-[92vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden`}>

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
            <Paintbrush size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Фотошоп креслень</p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {file
                ? `${fileIdx + 1} з ${visible.length} · ${file.name}`
                : `${detail.header.orderNum || detail.header.projectId} · з папки замовлення`}
            </p>
          </div>
          {phase !== 'save' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-pink-600" /></div>
        )}

        {/* Вибір файлу */}
        {phase === 'files' && (
          <>
            <div className="flex-shrink-0 px-4 pt-2.5 flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук файлу…"
                  className="w-full pl-7 pr-2 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]" />
              </div>
              {([['todo', `Не оброблені · ${stats.todo}`], ['done', `Оброблені · ${stats.done}`], ['', 'Всі']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setFilter(v as Filter)}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors flex-shrink-0"
                  style={filter === v ? { background: 'var(--ink)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2.5 space-y-1">
              {visible.map(f => (
                <button key={f.id} onClick={() => openFile(f)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl ring-1 ring-gray-200/70 bg-white text-left press hover:bg-gray-50">
                  <span className="text-[14px] flex-shrink-0">{f.ext === 'pdf' ? '📄' : '🖼️'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-semibold truncate">{f.name}</span>
                    <span className="block text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {f.folderName || '—'}{f.row ? ' · у таблиці' : ''} · {(f.size / 1024).toFixed(0)} КБ
                    </span>
                  </span>
                  {f.processed
                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 flex-shrink-0">✅ оброблено</span>
                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 flex-shrink-0">⏳</span>}
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
              {!visible.length && (
                <p className="text-center text-[12.5px] py-10" style={{ color: 'var(--ink-3)' }}>
                  {filter === 'todo' && stats.done > 0 ? 'Все оброблено 🎉' : 'Файлів не знайдено'}
                </p>
              )}
            </div>
          </>
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
              <button onClick={backToFiles}
                className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press" style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                ← Файли
              </button>
              {/* Навігація між файлами */}
              <span className="flex items-center gap-0.5">
                <button onClick={() => step(-1)} disabled={fileIdx <= 0}
                  className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Попередній файл">
                  <ArrowLeft size={15} />
                </button>
                <span className="text-[11.5px] font-bold tabular-nums px-0.5">{fileIdx + 1}/{visible.length}</span>
                <button onClick={() => step(1)} disabled={fileIdx >= visible.length - 1}
                  className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Наступний файл">
                  <ArrowRight size={15} />
                </button>
              </span>
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
                    className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Попередня сторінка">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11.5px] font-bold tabular-nums">стор. {pageIdx + 1}/{pages.length}</span>
                  <button onClick={() => setPageIdx(p => Math.min(pages.length - 1, p + 1))} disabled={pageIdx === pages.length - 1}
                    className="p-1.5 rounded-lg press disabled:opacity-30" style={{ color: 'var(--ink-2)' }} aria-label="Наступна сторінка">
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

            <div className="flex-shrink-0 p-3 border-t hairline flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <p className="hidden lg:block text-[10.5px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                ← → — інший файл
              </p>
              <button onClick={save} disabled={!totalRects}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                style={{ background: '#DB2777' }}>
                <Save size={15} /> Зберегти ({totalRects} прямок.)
              </button>
              <button onClick={() => step(1)} disabled={fileIdx >= visible.length - 1}
                className="px-4 py-2.5 rounded-2xl font-bold text-[12.5px] press border disabled:opacity-40"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                Пропустити →
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
                Файл позначено обробленим, посилання в картці оновлено
              </p>
            </div>
            <div className="flex gap-2">
              <a href={savedUrl} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press text-center inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <ExternalLink size={15} /> Відкрити
              </a>
              {nextTodo() ? (
                <button onClick={() => openFile(nextTodo()!)}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press"
                  style={{ background: '#DB2777' }}>
                  Наступний файл →
                </button>
              ) : (
                <button onClick={backToFiles}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] press border"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                  До списку
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
