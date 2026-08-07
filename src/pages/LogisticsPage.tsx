// ================================================================
//  src/pages/LogisticsPage.tsx — зона логістики.
//  Дві секції: «Забрати від виконавців» (готові позиції у
//  контрагентів — порізка в іншому районі тощо) і «Готове до
//  відвантаження» (замовлення, де все виконано — везти клієнту).
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Truck, PackageCheck, ChevronDown, ChevronRight, MapPin, Loader2 } from 'lucide-react';
import { api } from '../api';
import { LogisticsData, statusStyle } from '../types';

interface Props {
  onOpenOrder: (headerRow: number) => void;
  onToast: (msg: string, err?: boolean) => void;
}

export default function LogisticsPage({ onOpenOrder, onToast }: Props) {
  const [data, setData] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setData(await api.getLogistics(force));
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося завантажити логістику', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const pickupTotal = data?.pickup.reduce((s, g) => s + g.count, 0) ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5 flex items-center gap-2">
        <p className="text-[11.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>
          {data ? `Оновлено ${data.updatedAt}` : 'Завантаження…'}
        </p>
        <button onClick={() => load(true)} className="ml-auto p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {!data && loading && (
          <div className="py-10 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}

        {data && (
          <>
            {/* Забрати від виконавців */}
            <section>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="w-7 h-7 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <MapPin size={14} />
                </span>
                <h2 className="text-[13px] font-bold flex-1">Забрати від виконавців</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 tabular-nums">
                  {pickupTotal} поз.
                </span>
              </div>

              {data.pickup.length === 0 && (
                <p className="text-[12.5px] px-2 py-4 text-center rounded-2xl bg-white ring-1 ring-gray-200/60"
                  style={{ color: 'var(--ink-3)' }}>
                  Немає готових позицій у виконавців 👌
                </p>
              )}

              <div className="space-y-2">
                {data.pickup.map(g => {
                  const isOpen = !!open[g.executor];
                  return (
                    <div key={g.executor} className="bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
                      <button onClick={() => setOpen(p => ({ ...p, [g.executor]: !isOpen }))}
                        className="w-full flex items-center gap-2.5 p-3 press text-left">
                        <span className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                          {g.executor.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold text-[13.5px] truncate">{g.executor}</span>
                          <span className="block text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                            {g.orders.map(o => `${o.orderNum} (${o.count})`).join(' · ')}
                          </span>
                        </span>
                        <span className="text-[12px] font-bold text-orange-600 tabular-nums flex-shrink-0">{g.count} гот.</span>
                        {isOpen ? <ChevronDown size={15} className="text-gray-300" /> : <ChevronRight size={15} className="text-gray-300" />}
                      </button>
                      {isOpen && (
                        <div className="border-t hairline divide-y divide-gray-50">
                          {g.items.map(it => (
                            <button key={it.row} onClick={() => onOpenOrder(it.headerRow)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left press hover:bg-gray-50">
                              <span className="flex-1 text-[12px] truncate">{it.name}</span>
                              {it.qty && <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{it.qty} шт</span>}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100" style={{ color: 'var(--ink-2)' }}>
                                {it.orderNum || '—'}
                              </span>
                            </button>
                          ))}
                          {g.count > g.items.length && (
                            <p className="px-3 py-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                              … і ще {g.count - g.items.length}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Готове до відвантаження */}
            <section>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="w-7 h-7 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                  <PackageCheck size={14} />
                </span>
                <h2 className="text-[13px] font-bold flex-1">Готове до відвантаження</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 tabular-nums">
                  {data.shipping.length}
                </span>
              </div>

              {data.shipping.length === 0 && (
                <p className="text-[12.5px] px-2 py-4 text-center rounded-2xl bg-white ring-1 ring-gray-200/60"
                  style={{ color: 'var(--ink-3)' }}>
                  Поки що нічого не готове повністю
                </p>
              )}

              <div className="space-y-2">
                {data.shipping.map(o => {
                  const st = statusStyle(o.status);
                  return (
                    <button key={o.headerRow} onClick={() => onOpenOrder(o.headerRow)}
                      className="w-full bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 text-left press">
                      <div className="flex items-center gap-2">
                        <Truck size={16} className="text-green-600 flex-shrink-0" />
                        <span className="font-bold text-[14px] flex-1 truncate">{o.orderNum || '—'}</span>
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.fg }}>
                          {o.status || 'без статусу'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--ink-2)' }}>
                          {o.client ? `→ ${o.client}` : 'клієнт не вказаний'}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          {o.done}/{o.total} поз.
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
