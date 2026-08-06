// ================================================================
//  src/pages/OrdersPage.tsx
//  Список замовлень: пошук, фільтр за статусом, картки.
// ================================================================

import { useMemo, useState } from 'react';
import { Search, RefreshCw, SlidersHorizontal } from 'lucide-react';
import OrderCard from '../components/OrderCard';
import { Order, statusStyle, isClosed } from '../types';

interface Props {
  orders: Order[];
  updatedAt: string;
  loading: boolean;
  onRefresh: () => void;
  onOpen: (o: Order) => void;
  activeRow?: number;
}

export default function OrdersPage({ orders, updatedAt, loading, onRefresh, onOpen, activeRow }: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const statuses = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => { if (o.status) set.add(o.status); });
    return Array.from(set);
  }, [orders]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter(o => {
      if (status && o.status !== status) return false;
      if (!query) return true;
      return [o.orderNum, o.client, o.projectId, o.status]
        .join(' ').toLowerCase().includes(query);
    });
  }, [orders, q, status]);

  const active = orders.filter(o => !isClosed(o.status)).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 space-y-2 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Пошук за номером, клієнтом, шифром…"
              className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]"
            />
          </div>
          <button
            onClick={onRefresh}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white ring-1 ring-gray-200 rounded-2xl text-blue-600 active:scale-95 transition-transform"
            aria-label="Оновити"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {statuses.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto thin-scrollbar pb-1">
            <button
              onClick={() => setStatus('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                !status ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
              }`}
            >
              <SlidersHorizontal size={11} className="inline mr-1 -mt-0.5" />
              Всі · {orders.length}
            </button>
            {statuses.map(s => {
              const st = statusStyle(s);
              const on = status === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(on ? '' : s)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ring-1"
                  style={on
                    ? { background: st.solid, color: '#fff', borderColor: st.solid, boxShadow: 'none' }
                    : { background: st.bg, color: st.fg, borderColor: 'transparent' }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-gray-400 px-0.5">
          Активних: {active} з {orders.length}
          {updatedAt && ` · оновлено ${updatedAt}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2.5">
        {filtered.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400 text-[13px]">
            {orders.length === 0 ? 'Замовлень поки немає' : 'Нічого не знайдено'}
          </div>
        )}
        {filtered.map((o, i) => (
          <div key={o.headerRow} className={i < 5 ? `rise rise-${i + 1}` : undefined}>
            <OrderCard order={o} onOpen={() => onOpen(o)} active={o.headerRow === activeRow} />
          </div>
        ))}
      </div>
    </div>
  );
}
