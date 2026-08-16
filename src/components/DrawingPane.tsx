// ================================================================
//  src/components/DrawingPane.tsx — креслення просто в замовленні.
//
//  Раніше кожен файл відкривався на Диску в новій вкладці: щоб
//  звірити три позиції, треба було тричі піти й повернутись. Тепер
//  креслення показується збоку від таблиці — рядок лишається перед
//  очима, а ←/→ гортають позиції, не закриваючи панель.
//
//  Растр робить той самий renderDocument, що й Фотошоп креслень;
//  розібрані сторінки лежать у module-level кеші, тому повторне
//  відкриття того самого файла миттєве й не качає його вдруге.
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, ExternalLink, Loader2, FileText,
  Maximize2, Minimize2, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import { OrderItem, fileKind } from '../types';

/** Розібрані сторінки живуть між відкриттями панелі. */
const pageCache = new Map<string, string[]>();

export function driveIdOf(url: string): string {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

/** Чи вміємо показати цей файл усередині: PDF і зображення. */
export function canPreview(i: OrderItem): boolean {
  if (!i.url || !driveIdOf(i.url)) return false;
  return /\.(pdf|jpe?g|png|webp)$/i.test(String(i.name || ''));
}

interface Props {
  item: OrderItem;
  /** Сусіди для гортання ←/→ — ті самі позиції, що видно в таблиці. */
  items: OrderItem[];
  onPick: (i: OrderItem) => void;
  onClose: () => void;
}

export default function DrawingPane({ item, items, onPick, onClose }: Props) {
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [full, setFull] = useState(false);   // вписати / реальний масштаб
  const box = useRef<HTMLDivElement>(null);

  /** Лише ті сусіди, які взагалі можна показати. */
  const shown = useMemo(() => items.filter(canPreview), [items]);
  const at = shown.findIndex(i => i.row === item.row);

  const go = useCallback((delta: number) => {
    if (at < 0 || !shown.length) return;
    const next = shown[(at + delta + shown.length) % shown.length];
    if (next) onPick(next);
  }, [at, shown, onPick]);

  useEffect(() => {
    const id = driveIdOf(item.url);
    if (!id) return;
    setPage(0);
    setErr('');
    const hit = pageCache.get(id);
    if (hit) { setPages(hit); return; }

    let alive = true;
    setBusy(true);
    setPages([]);
    (async () => {
      try {
        const fd = await api.fileData(id);
        const { renderDocument } = await import('../lib/photoPdf');
        const rendered = await renderDocument(fd.base64, fd.mime);
        const urls = rendered.map(p => p.canvas.toDataURL('image/jpeg', 0.85));
        pageCache.set(id, urls);
        if (alive) setPages(urls);
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Не вдалося відкрити файл');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [item.row, item.url]);

  // Клавіші: ←/→ між позиціями, Esc закриває
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Нова сторінка або файл — прокрутка на початок
  useEffect(() => { box.current?.scrollTo({ top: 0, left: 0 }); }, [page, item.row]);

  const kind = fileKind(item.name);
  const supported = canPreview(item);

  return (
    <aside className="flex flex-col h-full min-h-0 bg-white border-l" style={{ borderColor: 'var(--line-2)' }}>

      {/* Шапка панелі */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-[7px] border-b"
        style={{ borderColor: 'var(--line)' }}>
        <span className="min-w-0 flex-1">
          <span className="k-label block">Креслення · {item.id}</span>
          <span className="block text-[12.5px] font-semibold truncate" title={item.name}>{item.name}</span>
        </span>

        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer"
            className="p-1.5 rounded press" style={{ color: 'var(--ink-2)' }}
            title="Відкрити на Диску">
            <ExternalLink size={15} />
          </a>
        )}
        <button onClick={() => setFull(v => !v)} className="p-1.5 rounded press"
          style={{ color: 'var(--ink-2)' }} title={full ? 'Вписати в панель' : 'Реальний масштаб'}>
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button onClick={onClose} className="p-1.5 rounded press" style={{ color: 'var(--ink-2)' }}
          aria-label="Закрити креслення" title="Закрити (Esc)">
          <X size={16} />
        </button>
      </div>

      {/* Саме креслення */}
      <div ref={box} className={`flex-1 min-h-0 ${full ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center'} p-2`}
        style={{ background: 'var(--bg)' }}>
        {busy && (
          <span className="flex items-center gap-2 k-label"><Loader2 size={14} className="animate-spin" /> читаю файл…</span>
        )}
        {!busy && err && (
          <span className="text-[12px] px-4 text-center" style={{ color: 'var(--accent)' }}>{err}</span>
        )}
        {!busy && !err && !supported && (
          <span className="flex flex-col items-center gap-2 px-6 text-center">
            <FileText size={26} style={{ color: 'var(--ink-3)' }} />
            <span className="text-[12.5px] font-semibold">
              {kind === 'dxf' ? 'DXF показує «Розкрій DXF»' : kind === '3d' ? '3D-модель тут не показати' : 'Цей файл не показати всередині'}
            </span>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer"
                className="text-[12px] font-bold" style={{ color: 'var(--blue)' }}>
                Відкрити на Диску →
              </a>
            )}
          </span>
        )}
        {!busy && !err && !!pages.length && (
          <img src={pages[Math.min(page, pages.length - 1)]} alt={item.name}
            className={full ? 'max-w-none' : 'max-w-full max-h-full object-contain'}
            style={{ boxShadow: '0 1px 2px rgba(16,24,40,.10)' }} />
        )}
      </div>

      {/* Низ: сторінки й перехід між позиціями */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-[6px] border-t"
        style={{ borderColor: 'var(--line)' }}>
        {pages.length > 1 && (
          <>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1 rounded press disabled:opacity-30" style={{ color: 'var(--ink-2)' }}
              aria-label="Попередня сторінка">
              <ChevronLeft size={15} />
            </button>
            <span className="k-value text-[11px]">{page + 1} / {pages.length}</span>
            <button onClick={() => setPage(p => Math.min(pages.length - 1, p + 1))} disabled={page >= pages.length - 1}
              className="p-1 rounded press disabled:opacity-30" style={{ color: 'var(--ink-2)' }}
              aria-label="Наступна сторінка">
              <ChevronRight size={15} />
            </button>
          </>
        )}

        <span className="flex-1" />

        {shown.length > 1 && (
          <>
            <span className="k-label">{at >= 0 ? at + 1 : '—'} з {shown.length}</span>
            <button onClick={() => go(-1)} className="p-1 rounded press" style={{ color: 'var(--ink-2)' }}
              title="Попередня позиція (←)" aria-label="Попередня позиція">
              <ArrowLeft size={15} />
            </button>
            <button onClick={() => go(1)} className="p-1 rounded press" style={{ color: 'var(--ink-2)' }}
              title="Наступна позиція (→)" aria-label="Наступна позиція">
              <ArrowRight size={15} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
