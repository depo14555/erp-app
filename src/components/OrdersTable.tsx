// ================================================================
//  src/components/OrdersTable.tsx — список замовлень таблицею.
//
//  Головний екран читають поглядом згори вниз, тому це таблиця,
//  а не сітка карток: номер моно, під ним клієнт і примітка,
//  готовність смужкою з цифрами поруч, прострочений термін —
//  помаранчевим. Закріплені підняті вгору й підсвічені.
// ================================================================

import { Paperclip } from 'lucide-react';
import { Order } from '../types';
import { statusStyle } from '../types';

interface Props {
  orders: Order[];
  pinned: Set<string>;
  activeRow?: number | null;
  onOpen: (o: Order) => void;
  onTogglePin: (projectId: string, on: boolean) => void;
}

/** «31.07.2026» → Date, щоб зрозуміти, чи термін уже минув. */
function parseDate(s: string): number {
  const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
}

export default function OrdersTable({ orders, pinned, activeRow, onOpen, onTogglePin }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalKg = orders.reduce((s, o) => s + (o.massKg || 0), 0);

  return (
    <div className="overflow-x-auto paper rounded-[11px] border" style={{ borderColor: 'var(--paper-line)' }}>
      <table className="w-full border-collapse text-[12.5px] paper-table">
        <thead>
          <tr className="paper">
            {['', '№ / клієнт', 'Статус', 'Готовність', 'Позицій', 'Маса', 'Запуск', 'Термін', 'ID'].map((h, i) => (
              <th key={i}
                className={`k-label px-2.5 py-[7px] whitespace-nowrap ${i === 4 || i === 5 ? 'text-right' : 'text-left'}`}
                style={{ borderBottom: '1.5px solid var(--ink)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const st = statusStyle(o.status);
            const pin = pinned.has(o.projectId);
            const pct = o.total ? Math.round((100 * o.done) / o.total) : 0;
            const dl = parseDate(o.deadline);
            const late = dl > 0 && dl < today.getTime() && o.done < o.total;
            return (
              <tr key={o.headerRow}
                onClick={() => onOpen(o)}
                className="border-b cursor-pointer"
                style={{
                  borderColor: 'var(--paper-line)',
                  borderStyle: 'dashed',
                  ...(o.headerRow === activeRow
                    ? { background: 'var(--accent-soft)' }
                    : pin ? { background: '#FBF1E6' } : {}),
                }}>

                <td className="px-1.5 py-[6px]">
                  {/* Скріпка — видно з першого погляду, що замовлення закріплене */}
                  <button
                    onClick={e => { e.stopPropagation(); onTogglePin(o.projectId, !pin); }}
                    className="p-1 rounded press block"
                    style={{ color: pin ? 'var(--accent)' : 'var(--line-2)' }}
                    aria-label={pin ? 'Відкріпити' : 'Закріпити'}
                    title={pin ? 'Відкріпити' : 'Закріпити вгорі списку'}>
                    <Paperclip size={14} strokeWidth={pin ? 2.6 : 2}
                      style={{ transform: pin ? 'rotate(-20deg)' : 'none' }} />
                  </button>
                </td>

                <td className="px-2.5 py-[6px] min-w-[220px]">
                  <span className="font-mono text-[13.5px] font-semibold block leading-tight">
                    {o.orderNum || o.projectId}
                  </span>
                  <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-2)' }}>
                    {o.client || 'клієнт не вказаний'}{o.note ? ` · ${o.note}` : ''}
                  </span>
                </td>

                <td className="px-2.5 py-[6px]">
                  <span className="k-chip" style={{ background: st.bg, color: st.fg, borderColor: st.fg + '44' }}>
                    {o.status || 'без статусу'}
                  </span>
                </td>

                <td className="px-2.5 py-[6px]">
                  <span className="flex items-center gap-2">
                    <span className="w-[88px] h-[3px] flex-shrink-0" style={{ background: 'var(--line)' }}>
                      <span className="block h-full grow-x"
                        style={{ width: `${Math.max(pct, o.done ? 2 : 2)}%`, background: o.done ? 'var(--green)' : 'var(--line-2)' }} />
                    </span>
                    <span className="font-mono text-[10.5px]" style={{ color: 'var(--ink-2)' }}>
                      {o.done} / {o.total}
                    </span>
                  </span>
                </td>

                <td className="px-2.5 py-[6px] text-right font-mono text-[12px]">{o.total}</td>

                {/* Маса металу зі штампів; «—» = штампи цієї картки ще не читали */}
                <td className="px-2.5 py-[6px] text-right font-mono text-[11.5px] whitespace-nowrap"
                  title={o.massKg ? `За штампами ${o.massFiles} креслень` : 'Штампи ще не читали — «ТМЦ і вага» в замовленні'}>
                  {o.massKg
                    ? <>{o.massKg.toFixed(1)} <span style={{ color: 'var(--ink-3)' }}>кг</span></>
                    : <span className="k-empty">—</span>}
                </td>

                <td className="px-2.5 py-[6px] font-mono text-[11.5px]">{o.date || <span className="k-empty">—</span>}</td>
                <td className="px-2.5 py-[6px] font-mono text-[11.5px]"
                  style={late ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>
                  {o.deadline || <span className="k-empty">—</span>}
                </td>
                <td className="px-2.5 py-[6px] font-mono text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                  {o.projectId}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={9} className="k-label px-3 py-[7px] normal-case tracking-normal"
              style={{ borderTop: '1.5px solid var(--ink)', fontSize: '10.5px' }}>
              Показано {orders.length} замовлень · закріплених {orders.filter(o => pinned.has(o.projectId)).length}
              {totalKg > 0 && ` · маса за штампами ${totalKg.toFixed(1)} кг`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
