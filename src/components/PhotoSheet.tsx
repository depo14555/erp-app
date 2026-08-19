// ================================================================
//  src/components/PhotoSheet.tsx — 🎨 «Фотошоп» креслень, як у
//  таблиці: широке вікно, збоку перелік файлів папки замовлення
//  (PDF + JPG/PNG) з фільтрами «оброблені / ні» і ЗА ФОРМАТОМ
//  АРКУША (A4/A3/A2…). Прямокутники чорні/білі, растеризація —
//  текст під ними зникає назавжди.
//
//  Шаблон розмітки («повторити на всі») зберігається ОКРЕМО ДЛЯ
//  КОЖНОГО ФОРМАТУ у відносних координатах, тому на кресленні
//  того самого формату лягає точно в те саме місце, а креслення
//  іншого формату не псуються.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Paintbrush, Loader2, Undo2, ChevronLeft, ChevronRight, Save, Square,
  ExternalLink, ArrowLeft, ArrowRight, Search, Copy, Layers, FileText,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { useBusy } from '../lib/busy';
import { api } from '../api';
import { OrderDetail, FolderFile } from '../types';
import { Rect, RenderedPage, SheetFormat, sheetFormat, probeFormat } from '../lib/photoPdf';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onSaved: () => void;
}

type Phase = 'load' | 'files' | 'render' | 'edit' | 'save' | 'done';
type Filter = '' | 'todo' | 'done';
/** Прямокутник шаблону у частках сторінки (0..1). */
type Tpl = { x: number; y: number; w: number; h: number; color: 'black' | 'white' };
/** Шаблони за ключем формату аркуша. */
type Templates = Record<string, Tpl[]>;

// Кеші ЖИВУТЬ поза компонентом — повторне відкриття шторки миттєве
const renderCache = new Map<string, RenderedPage[]>();
const formatCache = new Map<string, SheetFormat>();
/** Завантажені байти — щоб визначення формату і відкриття не качали файл двічі. */
const rawCache = new Map<string, { base64: string; mime: string }>();
const RAW_MAX = 24;
function rawPut(id: string, v: { base64: string; mime: string }) {
  rawCache.set(id, v);
  if (rawCache.size > RAW_MAX) rawCache.delete(rawCache.keys().next().value as string);
}

/** Скільки файлів максимум скануємо на формат (щоб не качати сотні). */
const SCAN_LIMIT = 150;

export default function PhotoSheet({ detail, onClose, onMinimize, onToast, onSaved }: Props) {
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [phase, setPhase] = useState<Phase>('load');
  const [filter, setFilter] = useState<Filter>('todo');
  const [fFmt, setFFmt] = useState('');            // фільтр за форматом аркуша
  const [q, setQ] = useState('');
  const [file, setFile] = useState<FolderFile | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [rects, setRects] = useState<Rect[][]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [color, setColor] = useState<'black' | 'white'>('black');
  const [savedUrl, setSavedUrl] = useState('');
  const [templates, setTemplates] = useState<Templates>({});
  const [formats, setFormats] = useState<Record<string, SheetFormat>>({});
  const [scanning, setScanning] = useState(false);
  const [batch, setBatch] = useState<{ done: number; total: number; name: string } | null>(null);
  const prefetching = useRef<Set<string>>(new Set());
  /** Поки користувач відкриває файл — фонове сканування форматів чекає. */
  const opening = useRef(false);
  // Поки триває операція — сторінку не можна оновити (робота б загубилась)
  useBusy(phase === 'save', 'Фотошоп креслень');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<Rect | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);

  useEffect(() => {
    api.folderFiles(detail.header.headerRow)
      .then(d => {
        setFiles(d.files);
        // формати, що вже відомі з попереднього відкриття
        const known: Record<string, SheetFormat> = {};
        d.files.forEach(f => { const c = formatCache.get(f.id); if (c) known[f.id] = c; });
        setFormats(known);
        setPhase('files');
      })
      .catch(e => { onToast(e?.message || 'Не вдалося прочитати папку', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- фонове визначення форматів аркушів (для фільтра) ----
  useEffect(() => {
    if (!files.length) return;
    let dead = false;
    (async () => {
      const todo = files.filter(f => !formatCache.has(f.id) && f.size < 30 * 1024 * 1024).slice(0, SCAN_LIMIT);
      if (!todo.length) return;
      setScanning(true);
      for (const f of todo) {
        if (dead) return;
        // не забирати канал у файлу, який користувач саме відкриває
        while (opening.current) {
          await new Promise(r => setTimeout(r, 250));
          if (dead) return;
        }
        try {
          const cached = renderCache.get(f.id);
          let fmt: SheetFormat;
          if (cached && cached[0]) {
            fmt = sheetFormat(cached[0]);
          } else {
            const raw = rawCache.get(f.id) || await api.fileData(f.id);
            rawPut(f.id, raw);
            fmt = await probeFormat(raw.base64, raw.mime);
          }
          formatCache.set(f.id, fmt);
          if (!dead) setFormats(p => ({ ...p, [f.id]: fmt }));
        } catch { /* формат лишиться невідомим — файл просто не потрапить у фільтр */ }
      }
      if (!dead) setScanning(false);
    })();
    return () => { dead = true; };
  }, [files]);

  const visible = useMemo(() => files.filter(f => {
    if (filter === 'todo' && f.processed) return false;
    if (filter === 'done' && !f.processed) return false;
    if (fFmt && formats[f.id]?.key !== fFmt) return false;
    const query = q.trim().toLowerCase();
    return !query || f.name.toLowerCase().includes(query) || f.folderName.toLowerCase().includes(query);
  }), [files, filter, q, fFmt, formats]);

  const stats = useMemo(() => ({
    todo: files.filter(f => !f.processed).length,
    done: files.filter(f => f.processed).length,
  }), [files]);

  /** Чіпи форматів — рахуються в межах поточного фільтра оброблених. */
  const fmtChips = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    files.forEach(f => {
      if (filter === 'todo' && f.processed) return;
      if (filter === 'done' && !f.processed) return;
      const fmt = formats[f.id];
      if (!fmt) return;
      const e = m.get(fmt.key) || { label: fmt.label, n: 0 };
      e.n++;
      m.set(fmt.key, e);
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [files, formats, filter]);

  /** Підпис формату за ключем (працює й тоді, коли чіп схований фільтром). */
  const fmtLabel = (key: string) => Object.values(formats).find(f => f.key === key)?.label || key;

  const fileIdx = file ? visible.findIndex(v => v.id === file.id) : -1;
  const curFmt = pages[pageIdx] ? sheetFormat(pages[pageIdx]) : null;
  const curTpl = curFmt ? templates[curFmt.key] : undefined;
  const tplFormats = Object.keys(templates).length;

  /** Рендер файлу в кеш (без зміни стану) — для передзавантаження. */
  async function renderToCache(f: FolderFile): Promise<RenderedPage[]> {
    const hit = renderCache.get(f.id);
    if (hit) return hit;
    const raw = rawCache.get(f.id) || await api.fileData(f.id);
    const { renderDocument } = await import('../lib/photoPdf');
    const rendered = await renderDocument(raw.base64, raw.mime);
    renderCache.set(f.id, rendered);
    rawCache.delete(f.id);          // байти більше не потрібні — тримаємо канваси
    if (rendered[0] && !formatCache.has(f.id)) {
      const fmt = sheetFormat(rendered[0]);
      formatCache.set(f.id, fmt);
      setFormats(p => ({ ...p, [f.id]: fmt }));
    }
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

  // ---- шаблони розмітки ----

  /** Прямокутники поточної сторінки → відносні координати. */
  function tplFromPage(): Tpl[] {
    const pg = pages[pageIdx];
    if (!pg) return [];
    return (rects[pageIdx] || []).map(r => ({
      x: r.x / pg.width, y: r.y / pg.height,
      w: r.w / pg.width, h: r.h / pg.height, color: r.color,
    }));
  }

  /**
   * Шаблони → прямокутники сторінок. Кожна сторінка бере шаблон СВОГО
   * формату; якщо для формату шаблону немає — лишається те, що вже було.
   */
  function applyTemplates(tpls: Templates, pgs: RenderedPage[], keep?: Rect[][]): Rect[][] {
    return pgs.map((pg, i) => {
      const t = tpls[sheetFormat(pg).key];
      if (!t) return keep?.[i] || [];
      return t.map(x => ({
        x: x.x * pg.width, y: x.y * pg.height,
        w: x.w * pg.width, h: x.h * pg.height, color: x.color,
      }));
    });
  }

  /** «Повторити на всі»: запам'ятати розмітку для ЦЬОГО формату аркуша. */
  function repeatOnAll() {
    const tpl = tplFromPage();
    if (!tpl.length) { onToast('Спершу намалюйте прямокутники', true); return; }
    if (!curFmt) return;
    const next = { ...templates, [curFmt.key]: tpl };
    setTemplates(next);
    setRects(applyTemplates(next, pages, rects));
    onToast(`Шаблон для ${curFmt.label} збережено (${tpl.length} прямок.) — ляже на всі креслення цього формату`);
  }

  /** Забути шаблон поточного формату. */
  function dropTemplate() {
    if (!curFmt) return;
    const next = { ...templates };
    delete next[curFmt.key];
    setTemplates(next);
    onToast(`Шаблон для ${curFmt.label} скинуто`);
  }

  /** Відкриття файлу; шаблон свого формату накладається одразу. */
  async function openFile(f: FolderFile) {
    setFile(f);
    setPhase(renderCache.has(f.id) ? 'edit' : 'render');
    opening.current = true;
    try {
      const rendered = await renderToCache(f);
      setPages(rendered);
      setRects(applyTemplates(templates, rendered));
      setPageIdx(0);
      setPhase('edit');
      prefetchNext(f);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відкрити файл', true);
      setPhase('files');
    } finally {
      opening.current = false;
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

  /** Скільки показаних PDF реально піде в пакет (формат має шаблон). */
  const saveAllTargets = useMemo(() => visible.filter(f => {
    if (f.ext !== 'pdf') return false;
    const k = formats[f.id]?.key;
    return k ? !!templates[k] : false;
  }).length, [visible, formats, templates]);

  /** Оновити перелік після збереження файлу (id змінюється — переносимо формат). */
  function markSaved(oldId: string, newId: string, newName: string) {
    const fmt = formatCache.get(oldId);
    if (fmt) { formatCache.set(newId, fmt); setFormats(p => ({ ...p, [newId]: fmt })); }
    setFiles(prev => prev.map(x => (x.id === oldId
      ? { ...x, id: newId, name: newName, processed: true } : x)));
  }

  /** Зберегти всі показані креслення, накладаючи шаблон ЇХНЬОГО формату. */
  async function saveAll() {
    // якщо для поточного формату шаблону ще нема — беремо те, що намальовано зараз
    let tpls = templates;
    if (curFmt && !templates[curFmt.key]) {
      const t = tplFromPage();
      if (t.length) { tpls = { ...templates, [curFmt.key]: t }; setTemplates(tpls); }
    }
    if (!Object.keys(tpls).length) { onToast('Немає шаблону розмітки', true); return; }
    const list = visible.filter(f => f.ext === 'pdf');
    if (!list.length) { onToast('Немає PDF для збереження', true); return; }

    setPhase('save');
    let ok = 0, skipped = 0;
    const failed: string[] = [];
    try {
      const { assemblePdf } = await import('../lib/photoPdf');
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        setBatch({ done: i, total: list.length, name: f.name });
        try {
          const pgs = await renderToCache(f);
          const rs = applyTemplates(tpls, pgs);
          if (!rs.some(a => a.length)) { skipped++; continue; }   // інший формат — не чіпаємо
          const base64 = await assemblePdf(pgs, rs);
          const res = await api.savePdf(f.id, base64, f.name, f.row || undefined);
          renderCache.delete(f.id);
          markSaved(f.id, res.newId, res.newName);
          ok++;
        } catch {
          failed.push(f.name);
        }
      }
      const tail = [
        skipped ? `пропущено ${skipped} (інший формат)` : '',
        failed.length ? `не вдалося: ${failed.slice(0, 3).join('; ')}` : '',
      ].filter(Boolean).join(' · ');
      onToast(`${failed.length ? '' : '✅ '}Збережено ${ok} з ${list.length}${tail ? ' · ' + tail : ''}`, failed.length > 0);
      onSaved();
    } finally {
      setBatch(null);
      setPhase('files');
      setFile(null);
    }
  }

  async function save() {
    if (!file) return;
    setPhase('save');
    try {
      const { assemblePdf } = await import('../lib/photoPdf');
      const base64 = await assemblePdf(pages, rects);
      const res = await api.savePdf(file.id, base64, file.name, file.row || undefined);
      renderCache.delete(file.id);
      markSaved(file.id, res.newId, res.newName);
      setSavedUrl(res.newUrl);
      setPhase('done');
      onSaved();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
      setPhase('edit');
    }
  }

  const backToFiles = () => { setPhase('files'); setFile(null); setPages([]); setRects([]); };

  // ================= перелік файлів (ліва панель) =================
  const fileList = (
    <>
      <div className="flex-shrink-0 px-3 pt-2.5 space-y-1.5">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук файлу…"
            className="k-input w-full pl-7 pr-2 py-1.5 rounded-xl outline-none text-[12px]" />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {([['todo', `Не оброблені · ${stats.todo}`], ['done', `Оброблені · ${stats.done}`], ['', 'Всі']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v as Filter)}
              className="px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors"
              style={filter === v ? { background: 'var(--ink)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Фільтр за форматом аркуша */}
        {(fmtChips.length > 1 || scanning) && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide mr-0.5" style={{ color: 'var(--ink-3)' }}>
              Аркуш
            </span>
            <button onClick={() => setFFmt('')}
              className="px-2 py-1 rounded-lg text-[11px] font-bold transition-colors"
              style={!fFmt ? { background: 'var(--accent)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
              всі
            </button>
            {fmtChips.map(([key, v]) => (
              <button key={key} onClick={() => setFFmt(fFmt === key ? '' : key)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                style={fFmt === key
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: '#F3F4F6', color: 'var(--ink-2)' }}
                title={templates[key] ? 'Для цього формату є шаблон розмітки' : undefined}>
                {templates[key] && <Copy size={10} />}
                {v.label} · {v.n}
              </button>
            ))}
            {scanning && <Loader2 size={11} className="animate-spin text-gray-400" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1">
        {visible.map(f => {
          const active = file?.id === f.id;
          const fmt = formats[f.id];
          return (
            <button key={f.id} onClick={() => openFile(f)} title={f.name}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-2xl ring-1 text-left press"
              style={active
                ? { background: 'var(--accent-soft)', borderColor: 'transparent', boxShadow: 'inset 0 0 0 1px var(--accent)' }
                : { background: '#fff', boxShadow: 'inset 0 0 0 1px rgb(229 231 235 / 0.7)' }}>
              <span className="text-[13px] flex-shrink-0">{f.ext === 'pdf' ? '📄' : '🖼️'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-semibold truncate">{f.name}</span>
                <span className="block text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>
                  {fmt ? fmt.label : '…'}{f.row ? ' · у таблиці' : ''} · {(f.size / 1024).toFixed(0)} КБ
                </span>
              </span>
              {f.processed
                ? <span className="text-[10px] flex-shrink-0">✅</span>
                : <span className="text-[10px] flex-shrink-0">⏳</span>}
            </button>
          );
        })}
        {!visible.length && (
          <p className="text-center text-[12.5px] py-10" style={{ color: 'var(--ink-3)' }}>
            {fFmt ? 'Немає файлів цього формату' : filter === 'todo' && stats.done > 0 ? 'Все оброблено 🎉' : 'Файлів не знайдено'}
          </p>
        )}
      </div>

      {tplFormats > 0 && (
        <div className="flex-shrink-0 mx-3 mb-3 px-2.5 py-2 rounded-xl bg-pink-50 text-pink-700 text-[11px] flex items-start gap-1.5">
          <Copy size={12} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            Шаблон розмітки для {tplFormats === 1 ? 'формату' : 'форматів'}:{' '}
            <b>{Object.keys(templates).map(fmtLabel).join(', ')}</b>
          </span>
          <button onClick={() => { setTemplates({}); onToast('Усі шаблони скинуто'); }} className="press font-bold flex-shrink-0">
            скинути
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={phase === 'save' ? undefined : onClose} />
      <div className="relative w-full lg:w-[min(1680px,96vw)] max-h-[94dvh] lg:h-[93vh] lg:max-h-[93vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

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
                : `${detail.header.orderNum || detail.header.projectId} · ${files.length} файлів у папці замовлення`}
            </p>
          </div>
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          {phase !== 'save' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-pink-600" /></div>
        )}

        {phase === 'save' && (
          <div className="flex-1 p-10 flex flex-col items-center justify-center gap-3">
            <Loader2 size={26} className="animate-spin text-pink-600" />
            {batch ? (
              <>
                <p className="text-[13px] font-bold">Обробляю {batch.done + 1} з {batch.total}</p>
                <p className="text-[11.5px] text-center max-w-[320px] truncate" style={{ color: 'var(--ink-2)' }}>{batch.name}</p>
                <div className="w-[260px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round(100 * batch.done / batch.total)}%`, background: '#DB2777' }} />
                </div>
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Вікно можна згорнути — робота триває</p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold">Збираю PDF і зберігаю на Диск…</p>
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Старий файл піде в кошик, посилання в картці оновиться</p>
              </>
            )}
          </div>
        )}

        {/* Дві панелі: перелік + креслення */}
        {(phase === 'files' || phase === 'render' || phase === 'edit' || phase === 'done') && (
          <div className="flex-1 min-h-0 flex">
            <aside className={`${file ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[320px] xl:w-[380px] flex-shrink-0 lg:border-r hairline min-h-0 bg-[#FCFCFD]`}>
              {fileList}
            </aside>

            <section className={`${file ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col min-h-0`}>
              {phase === 'files' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
                  <FileText size={30} className="text-gray-300" />
                  <p className="text-[13px] font-bold">Виберіть креслення зліва</p>
                  <p className="text-[11.5px] max-w-[380px]" style={{ color: 'var(--ink-3)' }}>
                    Виділіть прямокутником те, що треба закрити. «Повторити на всі» запам'ятає розмітку
                    для цього формату аркуша і накладе її на решту креслень такого ж формату.
                  </p>
                </div>
              )}

              {phase === 'render' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={26} className="animate-spin text-pink-600" />
                  <p className="text-[13px] font-bold">Відкриваю креслення…</p>
                </div>
              )}

              {phase === 'edit' && (
                <>
                  <div className="flex-shrink-0 px-3 py-2 flex items-center gap-1.5 border-b hairline flex-wrap">
                    <button onClick={backToFiles}
                      className="lg:hidden px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                      style={{ background: '#F3F4F6', color: 'var(--ink-2)' }}>
                      ← Файли
                    </button>
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

                    {curFmt && (
                      <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700" title="Формат аркуша цієї сторінки">
                        {curFmt.label}
                      </span>
                    )}

                    <span className="w-px h-5 bg-gray-200 mx-0.5" />

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

                    <span className="w-px h-5 bg-gray-200 mx-0.5" />

                    <button onClick={repeatOnAll} disabled={!(rects[pageIdx] || []).length}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-40"
                      style={curTpl
                        ? { background: '#FCE7F3', color: '#BE185D' }
                        : { background: '#F3F4F6', color: 'var(--ink-2)' }}
                      title={`Запам'ятати розмітку для формату ${curFmt?.label || ''} і накладати на всі креслення цього формату`}>
                      <Copy size={12} />
                      {curTpl ? `Шаблон ${curFmt?.label} · ${curTpl.length}` : 'Повторити на всі'}
                    </button>
                    {curTpl && (
                      <button onClick={dropTemplate}
                        className="p-1.5 rounded-lg press" style={{ color: 'var(--ink-3)' }} aria-label="Скинути шаблон формату">
                        <X size={13} />
                      </button>
                    )}

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

                  {/* На телефоні креслення на всю ширину і прокрутка вниз,
                      на десктопі — вписується у вільне місце цілком */}
                  <div className="flex-1 min-h-0 overflow-auto bg-gray-100 p-2 lg:p-4 flex items-start lg:items-center justify-center">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={onDown}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      className="max-w-full h-auto lg:max-h-full lg:w-auto shadow-lg rounded-sm touch-none cursor-crosshair bg-white"
                    />
                  </div>

                  <div className="flex-shrink-0 p-3 border-t hairline flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <p className="hidden xl:block text-[10.5px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                      ← → — інший файл
                    </p>
                    <button onClick={save} disabled={!totalRects}
                      className="flex-1 py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                      style={{ background: '#DB2777' }}>
                      <Save size={15} /> Зберегти ({totalRects} прямок.)
                    </button>
                    <button onClick={saveAll} disabled={!totalRects && !tplFormats}
                      className="px-3.5 py-2.5 rounded-2xl font-bold text-[12.5px] press disabled:opacity-40 inline-flex items-center gap-1.5"
                      style={{ background: '#FCE7F3', color: '#BE185D' }}
                      title="Накласти шаблон кожного формату на всі показані креслення і зберегти їх">
                      <Layers size={14} /> Зберегти всі{saveAllTargets ? ` · ${saveAllTargets}` : ''}
                    </button>
                    <button onClick={() => step(1)} disabled={fileIdx >= visible.length - 1}
                      className="px-3.5 py-2.5 rounded-2xl font-bold text-[12.5px] press border disabled:opacity-40"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                      Далі →
                    </button>
                  </div>
                </>
              )}

              {phase === 'done' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center text-[22px]">✅</div>
                  <p className="font-bold text-[15px]">Збережено</p>
                  <p className="text-[11.5px] text-center" style={{ color: 'var(--ink-3)' }}>
                    Файл позначено обробленим, посилання в картці оновлено
                  </p>
                  <div className="flex gap-2 w-full max-w-[420px] mt-1">
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
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
