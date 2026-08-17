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

/** Позиція вже в цеху: обидва слова означають «більше не купувати». */
const DONE = new Set(['Доставлено', 'Куплено']);

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
  const doneCount = sorted.filter(l => DONE.has(statusOf(l))).length;

  async function toggle(l: PurchLine) {
    if (!l.row) return;
    const next = DONE.has(statusOf(l)) ? '' : 'Доставлено';
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
    // Вузький блок: кріплень мало, а на всю ширину картки око бігає
    // від назви до кількості через півекрана.
    <div className="rounded-[10px] overflow-hidden max-w-[560px]"
      style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--amber-line)' }}>
      <div className="flex items-center gap-1.5 px-2.5 py-[5px]" style={{ background: 'var(--amber-bg)' }}>
        <ShoppingCart size={12} className="flex-shrink-0" style={{ color: 'var(--amber)' }} />
        <span className="k-head" style={{ color: 'var(--amber)' }}>Покупні до збірки</span>
        <span className="k-label ml-auto">
          {doneCount ? `${doneCount}/${sorted.length} доставлено` : `${sorted.length} найм.`} · {qty} шт
        </span>
      </div>

      <table className="w-full border-collapse text-[12px]" style={{ tableLayout: 'auto' }}>
        <tbody>
          {sorted.map((l, i) => {
            const st = statusOf(l);
            const done = st === 'Куплено';
            return (
              <tr key={`${l.pos}:${l.name}:${i}`} className="border-t" style={{ borderColor: 'var(--paper-line)' }}>
                <td className="px-2 py-[4px] w-[30px] text-right font-mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                  {l.pos || '—'}
                </td>
                {/* max-width:0 + width:100% — назва займає все вільне й обрізається,
                    інакше довгий рядок виштовхує кількість і галочку за край */}
                <td className="px-1 py-[4px] truncate" style={{
                  maxWidth: 0, width: '100%',
                  ...(done ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : {}),
                }} title={l.name}>
                  {l.name}
                </td>
                <td className="px-1.5 py-[4px] w-[58px] text-right font-mono font-bold whitespace-nowrap">
                  {l.total} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>шт</span>
                </td>
                <td className="px-1.5 py-[4px] w-[30px]">
                  {l.row ? (
                    <button onClick={() => toggle(l)} disabled={busy === l.row}
                      className="p-0.5 press flex"
                      title={done ? `${st} — зняти відмітку` : st ? `${st} — відмітити доставленим` : 'Відмітити доставленим'}>
                      {busy === l.row ? (
                        <Loader2 size={13} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
                      ) : (
                        <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-[3px]"
                          style={done
                            ? { background: 'var(--green)', color: '#fff' }
                            : { boxShadow: `inset 0 0 0 1.5px ${st ? 'var(--amber)' : 'var(--line-2)'}`, background: 'var(--surface)' }}>
                          {done ? <Check size={11} strokeWidth={3} />
                            : st ? <span className="w-[7px] h-[2px] rounded-sm" style={{ background: 'var(--amber)' }} /> : null}
                        </span>
                      )}
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
