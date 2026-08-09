// ================================================================
//  src/pages/CalcOverviewPage.tsx — 🧮 Прорахунок по всіх замовленнях.
//  Тут видно всі збережені групи («Порізка металу», «Токарні роботи»…),
//  їх суми і час, підсумки за видами робіт — і звідси можна відкрити
//  замовлення, щоб доправити конкретну групу.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Calculator, ChevronDown, ChevronRight, Clock, Wallet, ArrowRight, Search,
} from 'lucide-react';
import { api } from '../api';
import { CalcOverview, Order } from '../types';

interface Props {
  /** Список замовлень — звідси беремо номер і клієнта за шифром. */
  orders: Order[];
  onOpenOrder: (headerRow: number) => void;
  onToast: (msg: string, err?: boolean) => void;
  refreshSignal?: number;
}

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CalcOverviewPage({ orders: allOrders, onOpenOrder, onToast, refreshSignal }: Props) {
  const [data, setData] = useState<CalcOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.calcOverview();
      setData(d);
      if (d.orders.length && open.size === 0) setOpen(new Set([d.orders[0].projectId]));
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зібрати прорахунки', true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  // Хаб віддає лише шифр — назву й клієнта підставляємо зі списку замовлень
  const byId = useMemo(() => new Map(allOrders.map(o => [o.projectId, o])), [allOrders]);
  const orders = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.orders || []).map(o => {
      const known = byId.get(o.projectId);
      return known
        ? { ...o, orderNum: o.orderNum || known.orderNum, client: o.client || known.client,
            headerRow: o.headerRow || known.headerRow }
        : o;
    }).filter(o => {
      if (kind && !o.bundles.some(b => b.kind === kind)) return false;
      if (!query) return true;
      return [o.orderNum, o.client, o.projectId, ...o.bundles.map(b => b.invoiceName + ' ' + b.kind)]
        .join(' ').toLowerCase().includes(query);
    });
  }, [data, q, kind, byId]);

  const totalTime = useMemo(() => (data?.orders || []).reduce((s, o) => s + o.time, 0), [data]);

  return (
    <div className="flex flex-col h-full">
      {data && (
        <div className="flex-1 overflow-y-auto px-3 lg:px-5 py-3">
          <div className="max-w-[1100px] mx-auto w-full space-y-4">

            {/* Підсумки */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Прораховано всього</p>
                <p className="text-[22px] font-bold tabular-nums mt-1 text-teal-600">{money(data.totals.sum)} <span className="text-[12px]">грн</span></p>
                <p className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>{data.orders.length} замовлень</p>
              </div>
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Час у роботі</p>
                <p className="text-[22px] font-bold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>
                  {totalTime.toFixed(1)} <span className="text-[12px]">год</span>
                </p>
                <p className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>за призначеними кількостями</p>
              </div>
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3.5 col-span-2 lg:col-span-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-3)' }}>За видами робіт</p>
                <div className="space-y-1">
                  {data.totals.byKind.slice(0, 4).map(k => (
                    <button key={k.kind} onClick={() => setKind(kind === k.kind ? '' : k.kind)}
                      className="w-full flex items-center gap-2 text-[11.5px] press rounded-lg">
                      <span className="flex-1 truncate text-left"
                        style={{ color: kind === k.kind ? 'var(--accent)' : 'var(--ink-2)', fontWeight: kind === k.kind ? 700 : 400 }}>
                        {k.kind || 'Без виду'}
                      </span>
                      <span className="tabular-nums font-semibold">{money(k.sum)}</span>
                    </button>
                  ))}
                  {!data.totals.byKind.length && (
                    <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>ще нічого не прораховано</p>
                  )}
                </div>
              </div>
            </div>

            {/* Пошук */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[420px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Пошук за замовленням, клієнтом, назвою групи…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]" />
              </div>
              {kind && (
                <button onClick={() => setKind('')}
                  className="px-3 py-2 rounded-xl text-[12px] font-bold press"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {kind} ✕
                </button>
              )}
              {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />}
            </div>

            {/* Замовлення з групами */}
            <div className="space-y-1.5">
              {orders.map(o => {
                const isOpen = open.has(o.projectId);
                return (
                  <div key={o.projectId} className="bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
                    <button
                      onClick={() => setOpen(prev => {
                        const n = new Set(prev);
                        n.has(o.projectId) ? n.delete(o.projectId) : n.add(o.projectId);
                        return n;
                      })}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left press">
                      {isOpen ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />
                              : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-[13.5px] truncate">
                          {o.orderNum || o.projectId}{o.client ? ` · ${o.client}` : ''}
                        </span>
                        <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>
                          {o.bundles.length} груп{o.time ? ` · ${o.time.toFixed(1)} год` : ''}
                          {o.updatedAt ? ` · оновлено ${o.updatedAt}` : ''}
                        </span>
                      </span>
                      <span className="text-[14px] font-bold tabular-nums flex-shrink-0">{money(o.sum)} грн</span>
                      {o.headerRow > 0 && (
                        <span
                          role="button" tabIndex={0}
                          onClick={e => { e.stopPropagation(); onOpenOrder(o.headerRow); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onOpenOrder(o.headerRow); } }}
                          className="p-2 rounded-xl press flex-shrink-0" style={{ color: 'var(--accent)' }}
                          title="Відкрити замовлення">
                          <ArrowRight size={15} />
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {o.bundles.map(b => (
                          <div key={b.id} className="rounded-xl bg-[#FAFBFC] ring-1 ring-gray-200/60 p-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-700">
                                {b.kind || 'Без виду'}
                              </span>
                              <span className="text-[12.5px] font-semibold flex-1 min-w-[120px] truncate">
                                {b.invoiceName || <i style={{ color: 'var(--ink-3)' }}>без назви для рахунку</i>}
                              </span>
                              <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                                style={b.payTo === 'client'
                                  ? { background: '#ECFDF5', color: '#059669' }
                                  : { background: '#FFF7ED', color: '#C2410C' }}>
                                <Wallet size={9} className="inline -mt-0.5" /> {b.payTo === 'client' ? 'клієнт нам' : 'ми виконавцю'}
                              </span>
                              <span className="text-[13px] font-bold tabular-nums flex-shrink-0">{money(b.sum)} грн</span>
                            </div>

                            <div className="flex items-center gap-3 mt-1 text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                              <span>{b.rowsCount} поз.</span>
                              {b.time > 0 && <span className="flex items-center gap-1"><Clock size={9} /> {b.time.toFixed(1)} год</span>}
                              {b.extras.length > 0 && (
                                <span className="truncate">
                                  + {b.extras.map(e => `${e.label || 'витрата'}: ${money(e.sum)}`).join(' · ')}
                                </span>
                              )}
                            </div>

                            {b.note && (
                              <p className="text-[10.5px] mt-1" style={{ color: 'var(--ink-3)' }}>{b.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {!orders.length && !loading && (
                <p className="text-center text-[12.5px] py-10 rounded-2xl bg-white ring-1 ring-gray-200/60" style={{ color: 'var(--ink-3)' }}>
                  Прорахунків ще немає. Відкрийте замовлення → 🧮 Прорахунок → об'єднайте позиції у групу.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!data && (
        <div className="py-14 flex flex-col items-center gap-2">
          <Loader2 size={24} className="animate-spin text-teal-600" />
          <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
            <Calculator size={12} className="inline -mt-0.5" /> Збираю прорахунки…
          </p>
        </div>
      )}
    </div>
  );
}
