// ================================================================
//  src/lib/calcKeys.ts — прорахунок зберігається за ID позицій.
//
//  Раніше meta, групи рахунку й розкладки тримали ФІЗИЧНІ номери
//  рядків таблиці. Хтось вставив або видалив рядок у Sheets — і ціни,
//  гіби та час порізки тихо чіплялися до чужих деталей. ID позиції
//  (A21010-a8) переживає будь-які зсуви, тому в сховищі тепер він,
//  а номери рядків живуть лише в пам'яті відкритого вікна.
//
//  Формат v2: meta з ключами-ID, у груп і розкладок — поле ids.
//  Старі збереження (ключі-номери) читаються як є і стають v2 при
//  наступному «Зберегти».
// ================================================================

import { CalcBundle, CalcData, CalcNest, CalcRowMeta, OrderItem } from '../types';

export function idMaps(items: OrderItem[]) {
  const idByRow = new Map<number, string>();
  const rowById = new Map<string, number>();
  items.forEach(i => {
    const id = String(i.id || '').trim();
    if (!id) return;
    if (!idByRow.has(i.row)) idByRow.set(i.row, id);
    if (!rowById.has(id)) rowById.set(id, i.row);
  });
  return { idByRow, rowById };
}

/** Збережене → робоче: усі ключі стають ПОТОЧНИМИ номерами рядків. */
export function calcFromStored(data: CalcData | null | undefined, items: OrderItem[]): CalcData {
  const d: CalcData = data || { bundles: [] };
  const { rowById } = idMaps(items);
  const v2 = d.v === 2;

  const meta: Record<string, CalcRowMeta> = {};
  Object.entries(d.meta || {}).forEach(([k, m]) => {
    if (v2) {
      const row = rowById.get(k);
      // Позиції з таким ID більше немає — її гроші не чіпляємо ні до кого
      if (row) meta[String(row)] = m;
    } else {
      meta[k] = m;
    }
  });

  const rowsOf = (ids: string[] | undefined, rows: number[] | undefined): number[] =>
    ids && ids.length
      ? ids.map(id => rowById.get(id) || 0).filter(r => r > 0)
      : (rows || []);

  return {
    ...d,
    meta,
    bundles: (d.bundles || []).map(b => ({ ...b, rows: rowsOf(b.ids, b.rows) })),
    nests: (d.nests || []).map(n => ({ ...n, rows: rowsOf(n.ids, n.rows) })),
  };
}

/** Робоче → збережене: номери рядків стають ID, v:2. */
export function calcToStored(data: CalcData, items: OrderItem[]): CalcData {
  const { idByRow } = idMaps(items);

  const meta: Record<string, CalcRowMeta> = {};
  Object.entries(data.meta || {}).forEach(([k, m]) => {
    // Рядок без ID — рідкість (свіжий рядок до нумерації); лишаємо як є
    meta[idByRow.get(Number(k)) || k] = m;
  });

  const idsOf = (rows: number[]): string[] =>
    rows.map(r => idByRow.get(r) || '').filter(Boolean);

  const bundles: CalcBundle[] = (data.bundles || []).map(b => ({
    ...b, ids: idsOf(b.rows), rows: [],
  }));
  const nests: CalcNest[] = (data.nests || []).map(n => ({
    ...n, ids: idsOf(n.rows), rows: [],
  }));

  return { ...data, v: 2, meta, bundles, nests };
}
