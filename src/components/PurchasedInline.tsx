// ================================================================
//  src/components/PurchasedInline.tsx — покупні всередині збірки.
//
//  Кріплення не мають власного рядка в картці, тому показуємо їх
//  у групі тієї збірки, куди вони входять. Раніше це був набір
//  плиток у три колонки — очі бігали, і незрозуміло, що вже куплено.
//  Тепер це проста табличка в мову ШТАМП: позиція, номенклатура,
//  кількість і галочка «куплено», яка пише відмітку в аркуш.
// ================================================================

import { useState } from 'react';
import { ShoppingCart, Check, Loader2 } from 'lucide-react';
import { api } from '../api';

export interface PurchLine {
  pos: string;
  name: string;
  total: string;
  /** Рядок аркуша «Покупні» — щоб було куди писати відмітку. */
  row?: number;
  status?: string;
}

/** Порядок як у специфікації — по номеру позиції. */
export function sortLines(lines: PurchLine[]): PurchLine[] {
  return [...lines].sort((a, b) => (parseInt(a.pos, 10) || 0) - (parseInt(b.pos, 10) || 0));
}

export default function PurchasedInline({ lines, onToast }: {
  lines: PurchLine[];
  onToast?: (msg: string, err?: boolean) => void;
}) {
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  if (!lines.length) return null;
  const sorted = sortLines(lines);
  const qty = sorted.reduce((s, l) => s + (parseFloat(String(l.total).replace(',', '.')) || 0), 0);
  const statusOf = (l: PurchLine) => (l.row && marks[l.row] !== undefined ? marks[l.row] : (l.status || ''));
  const doneCount = sorted.filter(l => statusOf(l) === 'Куплено').length;

  async function toggle(l: PurchLine) {
    if (!l.row) return;
    const next = statusOf(l) === 'Куплено' ? '' : 'Куплено';
    setBusy(l.row);
    try {
      await api.purchasedStatus([l.row], next);
      setMarks(m => ({ ...m, [l.row!]: next }));
    } catch (e: any) {
      onToast?.(e?.message || 'Не вдалося відмітити', true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[10px] overflow-hidden"
      style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--amber-line)' }}>
      <div className="flex items-center gap-1.5 px-2.5 py-[5px]" style={{ background: 'var(--amber-bg)' }}>
        <ShoppingCart size={12} className="flex-shrink-0" style={{ color: 'var(--amber)' }} />
        <span className="k-head" style={{ color: 'var(--amber)' }}>Покупні до збірки</span>
        <span className="k-label ml-auto">
          {doneCount ? `куплено ${doneCount} з ${sorted.length}` : `${sorted.length} найм.`} · {qty} шт
        </span>
      </div>

      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {sorted.map((l, i) => {
            const st = statusOf(l);
            const done = st === 'Куплено';
            return (
              <tr key={`${l.pos}:${l.name}:${i}`} className="border-t" style={{ borderColor: 'var(--paper-line)' }}>
                <td className="px-2 py-[4px] w-[34px] text-right font-mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                  {l.pos || '—'}
                </td>
                <td className="px-1 py-[4px] truncate max-w-0" title={l.name}
                  style={done ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : undefined}>
                  {l.name}
                </td>
                <td className="px-2 py-[4px] w-[70px] text-right font-mono font-bold whitespace-nowrap">
                  {l.total} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>шт</span>
                </td>
                <td className="px-1.5 py-[4px] w-[92px]">
                  {l.row ? (
                    <button onClick={() => toggle(l)} disabled={busy === l.row}
                      className="k-chip press flex items-center gap-1 w-full justify-center"
                      style={done
                        ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-line)' }
                        : st === 'Замовлено'
                          ? { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }
                          : undefined}
                      title={done ? 'Зняти відмітку' : 'Відмітити купленим'}>
                      {busy === l.row
                        ? <Loader2 size={10} className="animate-spin" />
                        : done ? <Check size={10} /> : <span className="inline-block w-[9px] h-[9px] rounded-[2px]"
                            style={{ boxShadow: 'inset 0 0 0 1px var(--line-2)' }} />}
                      {done ? 'куплено' : st || 'готово?'}
                    </button>
                  ) : (
                    <span className="k-empty text-[10.5px]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
