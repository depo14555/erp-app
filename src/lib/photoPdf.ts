// ================================================================
//  src/lib/photoPdf.ts — «Фотошоп» для креслень: рендер PDF у
//  канвас (pdfjs), накладання прямокутників (закрити конфіденційну
//  інформацію) і збірка НОВОГО PDF з растрових сторінок (pdf-lib).
//  Растеризація — як у таблиці: під прямокутником не лишається
//  тексту, який можна виділити чи скопіювати.
// ================================================================

import { PDFDocument } from 'pdf-lib';

export interface Rect { x: number; y: number; w: number; h: number; color: 'black' | 'white' }

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Реальний розмір сторінки PDF у пунктах (для картинок — немає). */
  ptWidth?: number;
  ptHeight?: number;
}

export const RENDER_SCALE = 2; // якість растру (~144 dpi для A4)

// ---------------------------------------------------------------
//  Формат аркуша: A4/A3/A2… — за ним групуються шаблони розмітки
// ---------------------------------------------------------------

export interface SheetFormat {
  /** Ключ для групування шаблонів (формат + орієнтація). */
  key: string;
  /** Підпис для людини: «A3 альбом». */
  label: string;
}

/** Стандартні аркуші, мм (коротка × довга сторона). */
const SHEETS: Array<[string, number, number]> = [
  ['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594],
  ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210],
];

const IMAGE_FORMAT: SheetFormat = { key: 'img', label: 'зображення' };

/** Пункти → міліметри. */
const mm = (pt: number) => Math.round(pt / 72 * 25.4);

/** Розмір сторінки в пунктах → формат аркуша. */
export function formatOfPoints(ptW: number, ptH: number): SheetFormat {
  const w = mm(ptW), h = mm(ptH);
  const short = Math.min(w, h), long = Math.max(w, h);
  const land = w > h;
  for (const [name, s, l] of SHEETS) {
    // допуск 3% або 6 мм — рамки креслень часто трохи «гуляють»
    if (Math.abs(short - s) <= Math.max(6, s * 0.03) && Math.abs(long - l) <= Math.max(6, l * 0.03)) {
      return { key: name + (land ? '-L' : '-P'), label: name + (land ? ' альбом' : ' книга') };
    }
  }
  // Нестандартний (подовжений) аркуш — групуємо з кроком 10 мм
  const k = (n: number) => Math.round(n / 10) * 10;
  return { key: `${k(short)}x${k(long)}${land ? '-L' : '-P'}`, label: `${w}×${h} мм` };
}

/** Формат уже відрендереної сторінки. */
export function sheetFormat(page: RenderedPage): SheetFormat {
  if (!page.ptWidth || !page.ptHeight) return IMAGE_FORMAT;
  return formatOfPoints(page.ptWidth, page.ptHeight);
}

/** Формат першої сторінки БЕЗ растеризації — швидко, лише для фільтра. */
export async function probeFormat(base64: string, mime: string): Promise<SheetFormat> {
  if (mime.includes('image')) return IMAGE_FORMAT;
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: b64ToBytes(base64) }).promise;
  try {
    const page = await doc.getPage(1);
    const v = page.getViewport({ scale: 1 });
    return formatOfPoints(v.width, v.height);
  } finally {
    try { doc.destroy(); } catch { /* не критично */ }
  }
}

let pdfjsPromise: Promise<any> | null = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      // Vite-спосіб: ?worker створює модульний воркер правильно і в dev, і в збірці
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default;
      lib.GlobalWorkerOptions.workerPort = new WorkerCtor();
      return lib;
    })();
  }
  return pdfjsPromise;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PDF (base64) → канваси сторінок. Зображення (jpg/png) → один канвас. */
export async function renderDocument(base64: string, mime: string): Promise<RenderedPage[]> {
  if (mime.includes('image')) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:${mime};base64,${base64}`; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return [{ canvas, width: img.width, height: img.height }];
  }

  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: b64ToBytes(base64) }).promise;
  // pdf.js планує малювання через requestAnimationFrame — у прихованій
  // вкладці він заморожений і рендер висне. Підміняємо на setTimeout.
  const origRaf = window.requestAnimationFrame;
  (window as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16);
  try {
    const pages: RenderedPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const base = page.getViewport({ scale: 1 });
      pages.push({
        canvas, width: canvas.width, height: canvas.height,
        ptWidth: base.width, ptHeight: base.height,
      });
    }
    return pages;
  } finally {
    window.requestAnimationFrame = origRaf;
  }
}

/** Канваси сторінок + прямокутники → новий PDF (base64, без префікса). */
export async function assemblePdf(pages: RenderedPage[], rects: Rect[][]): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const src = pages[i];
    // Копія канваса + прямокутники поверх
    const canvas = document.createElement('canvas');
    canvas.width = src.width; canvas.height = src.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(src.canvas, 0, 0);
    for (const r of rects[i] || []) {
      ctx.fillStyle = r.color === 'white' ? '#ffffff' : '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    const jpg = canvas.toDataURL('image/jpeg', 0.88);
    const img = await doc.embedJpg(jpg);
    // Розмір сторінки в пунктах — з оригіналу, інакше ділимо на масштаб рендера
    const page = doc.addPage([
      src.ptWidth || src.width / RENDER_SCALE,
      src.ptHeight || src.height / RENDER_SCALE,
    ]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  const bytes = await doc.save();
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}
