// ================================================================
//  src/lib/requestPdf.ts — маленька накладна-заявка на закупівлю.
//
//  Те, що менеджер має отримати в месенджері одним файлом: назва
//  списку, дата, перелік «номенклатура — кількість — під які
//  замовлення» і рядок для підпису. Формується на клієнті, тому
//  працює й без інтернету до хаба.
//
//  Шрифт — DejaVu Sans (той самий, що й у друку креслень): у ньому
//  є кирилиця, латиниця й цифри, інакше в PDF летять квадратики.
// ================================================================

import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontRegularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import fontBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';

export interface RequestLine {
  name: string;
  code: string;
  qty: number;
  unit?: string;
  orders: string[];
  note?: string;
}

export interface RequestDoc {
  /** Назва списку — вона ж заголовок документа. */
  title: string;
  date: string;
  lines: RequestLine[];
  /** Хто просить (необовʼязково). */
  from?: string;
}

async function loadFont(doc: PDFDocument, url: string): Promise<PDFFont | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await doc.embedFont(await res.arrayBuffer(), { subset: true });
  } catch {
    return null;
  }
}

/** Обрізає рядок під ширину колонки — інакше текст лізе на сусідню. */
function fit(text: string, font: PDFFont, size: number, max: number): string {
  let s = String(text || '');
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > max) s = s.slice(0, -1);
  return s + '…';
}

export async function buildRequestPdf(d: RequestDoc): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = (await loadFont(doc, fontRegularUrl)) || (await doc.embedFont(StandardFonts.Helvetica));
  const bold = (await loadFont(doc, fontBoldUrl)) || font;

  const W = 595.28, H = 841.89;            // A4
  const M = 42;                            // поля
  const ink = rgb(0.106, 0.122, 0.141);    // --ink
  const soft = rgb(0.42, 0.4, 0.35);       // --ink-2
  const line = rgb(0.72, 0.68, 0.6);       // --line-2

  let page = doc.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, yy: number, size: number, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  // ── Шапка
  text('ЗАЯВКА НА ЗАКУПІВЛЮ', M, y - 4, 15, bold);
  text(d.date, W - M - font.widthOfTextAtSize(d.date, 10), y - 2, 10, font, soft);
  y -= 22;
  text(fit(d.title, bold, 12, W - M * 2), M, y, 12, bold);
  y -= 16;
  if (d.from) { text(fit(`Від: ${d.from}`, font, 9.5, W - M * 2), M, y, 9.5, font, soft); y -= 14; }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ink });
  y -= 16;

  // ── Колонки
  const cNum = M, cName = M + 24, cQty = W - M - 132, cOrders = W - M - 96;
  const nameW = cQty - cName - 10;
  const head = () => {
    text('№', cNum, y, 8, bold, soft);
    text('НОМЕНКЛАТУРА', cName, y, 8, bold, soft);
    text('К-СТЬ', cQty, y, 8, bold, soft);
    text('ЗАМОВЛЕННЯ', cOrders, y, 8, bold, soft);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: line });
    y -= 13;
  };
  head();

  d.lines.forEach((l, i) => {
    if (y < M + 70) {                       // нова сторінка
      page = doc.addPage([W, H]);
      y = H - M;
      head();
    }
    text(String(i + 1), cNum, y, 9, font, soft);
    text(fit(l.name, font, 9.5, nameW), cName, y, 9.5);
    const qty = `${l.qty} ${l.unit || 'шт'}`;
    text(qty, cQty, y, 9.5, bold);
    text(fit(l.orders.join(', '), font, 8, W - M - cOrders), cOrders, y, 8, font, soft);
    if (l.code && l.code !== l.name) {
      y -= 10;
      text(fit(l.code, font, 8, nameW), cName, y, 8, font, soft);
    }
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: line });
    y -= 12;
  });

  // ── Підсумок і підпис
  y -= 4;
  const total = d.lines.reduce((s, l) => s + l.qty, 0);
  text(`Разом: ${d.lines.length} найменувань · ${total} шт`, M, y, 10, bold);
  y -= 34;
  text('Замовив: ______________________', M, y, 9.5, font, soft);
  text('Купив: ______________________', W - M - 190, y, 9.5, font, soft);

  const bytes = await doc.save();
  // копія в «свій» ArrayBuffer — інакше TS не пускає Uint8Array у Blob
  return new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
}
