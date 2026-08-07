// ================================================================
//  src/lib/printPdf.ts — збірка PDF для друку на клієнті.
//  Та сама логіка, що «Друк креслень» у таблиці (титульна сторінка
//  + злиття PDF через pdf-lib), плюс QR-код зверху кожного
//  креслення: скан у цеху відкриває деталь у додатку (#p=<ID>).
// ================================================================

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { api } from '../api';
// DejaVu Sans — ПОВНИЙ шрифт (кирилиця + латиниця + цифри). Підмножина
// noto-sans-cyrillic не мала цифр і латиниці — у переліку були квадратики.
import fontRegularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import fontBoldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';

export interface PrintItem {
  fileId: string;
  fileName: string;
  id: string;       // ID рядка (A21009-a5) — вміст QR
  qty: string;
  operation: string;
  executor: string;
}

export interface PrintOptions {
  orderNum: string;
  projectId: string;
  filterLabel: string;
  items: PrintItem[];
  withQr: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface PrintResult {
  bytes: Uint8Array;
  pages: number;
  failed: string[];
}

/** Посилання на файл Google Drive → fileId. */
export function driveFileId(url: string): string | null {
  const m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadFont(doc: PDFDocument, url: string): Promise<PDFFont | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    // subset: у PDF потрапляють лише використані гліфи, а не весь шрифт (~750KB)
    return await doc.embedFont(await res.arrayBuffer(), { subset: true });
  } catch {
    return null;
  }
}

/** QR-код у кут кожної сторінки креслення: білий підклад + код + ID. */
async function stampQr(doc: PDFDocument, pages: PDFPage[], id: string, font: PDFFont | null) {
  const link = `${location.origin}/#p=${encodeURIComponent(id)}`;
  const dataUrl = await QRCode.toDataURL(link, { margin: 0, width: 256, errorCorrectionLevel: 'M' });
  const png = await doc.embedPng(dataUrl);
  const QR = 57;        // ~20 мм — щоб упевнено читався сканером телефона
  const PAD = 5;
  for (const page of pages) {
    const { width, height } = page.getSize();
    const x = width - QR - 26;
    const y = height - QR - 10;
    page.drawRectangle({
      x: x - PAD, y: y - (font ? 13 : PAD),
      width: QR + PAD * 2, height: QR + PAD * 2 + (font ? 10 : 0),
      color: rgb(1, 1, 1),
      borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.6,
    });
    page.drawImage(png, { x, y, width: QR, height: QR });
    if (font) {
      page.drawText(id, { x: x - PAD + 2, y: y - 9, size: 6.5, font, color: rgb(0.35, 0.35, 0.35) });
    }
  }
}

async function addTitlePage(
  doc: PDFDocument, font: PDFFont, fontBold: PDFFont,
  opts: PrintOptions,
) {
  let page = doc.addPage([595, 842]); // A4
  const w = 595, h = 842, margin = 30;
  let y = h - 40;

  page.drawText('ПЕРЕЛІК КРЕСЛЕНЬ ДЛЯ ДРУКУ', { x: margin, y, size: 14, font: fontBold });
  y -= 22;
  page.drawText(`Замовлення: ${opts.orderNum}  |  Проєкт: ${opts.projectId}`, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 16;
  if (opts.filterLabel) {
    page.drawText(`Фільтр: ${opts.filterLabel}`, { x: margin, y, size: 9, font, color: rgb(0.2, 0.4, 0.8) });
    y -= 16;
  }
  const now = new Date();
  const dd = (n: number) => String(n).padStart(2, '0');
  page.drawText(`Дата: ${dd(now.getDate())}.${dd(now.getMonth() + 1)}.${now.getFullYear()} ${dd(now.getHours())}:${dd(now.getMinutes())}` +
    (opts.withQr ? '  ·  QR-коди: скан відкриває деталь у додатку' : ''),
    { x: margin, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 20;

  page.drawLine({ start: { x: margin, y }, end: { x: w - margin, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  y -= 16;

  const cols = [margin, margin + 30, margin + 280, margin + 320, margin + 380, margin + 480];
  const header = () => {
    page.drawText('№', { x: cols[0], y, size: 8, font: fontBold });
    page.drawText('Назва файлу', { x: cols[1], y, size: 8, font: fontBold });
    page.drawText('К-ть', { x: cols[2], y, size: 8, font: fontBold });
    page.drawText('Операція', { x: cols[3], y, size: 8, font: fontBold });
    page.drawText('Виконавець', { x: cols[4], y, size: 8, font: fontBold });
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: w - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 12;
  };
  header();

  opts.items.forEach((it, i) => {
    if (y < 50) { page = doc.addPage([595, 842]); y = h - 40; header(); }
    let nm = it.fileName.replace(/\.pdf$/i, '');
    if (nm.length > 38) nm = nm.substring(0, 36) + '..';
    page.drawText(String(i + 1), { x: cols[0], y, size: 7, font });
    page.drawText(nm, { x: cols[1], y, size: 7, font });
    page.drawText(String(it.qty || ''), { x: cols[2], y, size: 7, font });
    page.drawText(String(it.operation || '').substring(0, 14), { x: cols[3], y, size: 7, font });
    page.drawText(String(it.executor || '').substring(0, 14), { x: cols[4], y, size: 7, font });
    y -= 11;
  });

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: w - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;
  page.drawText(`Всього: ${opts.items.length} креслень`, { x: margin, y, size: 9, font: fontBold });
}

export async function buildPrintPdf(opts: PrintOptions): Promise<PrintResult> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let font = await loadFont(doc, fontRegularUrl);
  let fontBold = await loadFont(doc, fontBoldUrl);
  if (!font) font = await doc.embedFont(StandardFonts.Helvetica);
  if (!fontBold) fontBold = font;
  const cyrOk = !!font && font.getCharacterSet?.().includes('Я'.codePointAt(0)!);

  if (cyrOk) {
    await addTitlePage(doc, font!, fontBold!, opts);
  }

  const failed: string[] = [];
  let loaded = 0;
  for (let i = 0; i < opts.items.length; i++) {
    const it = opts.items[i];
    opts.onProgress?.(i, opts.items.length, it.fileName);
    try {
      const fd = await api.fileData(it.fileId);
      const src = await PDFDocument.load(b64ToBytes(fd.base64), { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach(p => doc.addPage(p));
      if (opts.withQr && it.id) {
        try { await stampQr(doc, pages, it.id, cyrOk ? font : null); } catch { /* QR не критичний */ }
      }
      loaded++;
    } catch (e: any) {
      failed.push(`${it.fileName} (${e?.message || 'помилка'})`);
    }
  }
  opts.onProgress?.(opts.items.length, opts.items.length, 'Зберігаю…');

  if (!loaded) throw new Error('Жодне креслення не вдалося завантажити');
  const bytes = await doc.save();
  return { bytes, pages: loaded, failed };
}
