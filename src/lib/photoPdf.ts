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
}

const RENDER_SCALE = 2; // якість растру (~144 dpi для A4)

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
      pages.push({ canvas, width: canvas.width, height: canvas.height });
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
    // Розмір сторінки в пунктах — ділимо на масштаб рендера
    const page = doc.addPage([src.width / RENDER_SCALE, src.height / RENDER_SCALE]);
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
