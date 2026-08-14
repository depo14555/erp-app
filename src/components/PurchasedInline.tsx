// ================================================================
//  src/components/PurchasedInline.tsx — покупні всередині збірки.
//
//  Кріплення не мають власного рядка в картці замовлення, тому
//  показуємо їх у групі тієї збірки, куди вони входять. Одним
//  рядком через крапку список на 13 позицій не читався — тут це
//  маленька таблиця в кілька колонок: позиція, номенклатура,
//  кількість. Вона однаково стоїть і в таблиці, і в картках.
// ================================================================

import { ShoppingCart } from 'lucide-react';

export interface PurchLine { pos: string; name: string; total: string }

/** Порядок як у специфікації — по номеру позиції. */
export function sortLines(lines: PurchLine[]): PurchLine[] {
  return [...lines].sort((a, b) => (parseInt(a.pos, 10) || 0) - (parseInt(b.pos, 10) || 0));
}

export default function PurchasedInline({ lines }: { lines: PurchLine[] }) {
  if (!lines.length) return null;
  const sorted = sortLines(lines);
  const qty = sorted.reduce((s, l) => s + (parseFloat(String(l.total).replace(',', '.')) || 0), 0);

  return (
    <div className="rounded-xl bg-[#FFFAF5] ring-1 ring-orange-200/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50/70">
        <ShoppingCart size={12} className="flex-shrink-0" style={{ color: '#EA580C' }} />
        <span className="text-[11px] font-bold" style={{ color: '#C2410C' }}>Покупні до збірки</span>
        <span className="text-[10.5px] tabular-nums ml-auto" style={{ color: 'var(--ink-3)' }}>
          {sorted.length} найм. · {qty} шт
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((l, i) => (
          <div key={`${l.pos}:${l.name}:${i}`}
            className="flex items-baseline gap-1.5 px-2.5 py-[3px] border-t border-orange-100/70">
            <span className="text-[10px] tabular-nums w-4 flex-shrink-0 text-right"
              style={{ color: 'var(--ink-3)' }}>{l.pos}</span>
            <span className="text-[11.5px] truncate flex-1 min-w-0" title={l.name}>{l.name}</span>
            <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0">{l.total}</span>
            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>шт</span>
          </div>
        ))}
      </div>
    </div>
  );
}
