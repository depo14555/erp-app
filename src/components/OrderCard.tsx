// ================================================================
//  src/components/OrderCard.tsx
//  Картка замовлення у списку — як на аркуші «Головна» в таблиці:
//  кольорова смуга статусу, клієнт, прогрес позицій, дати.
// ================================================================

import { ChevronRight, User, Package, Rocket, Clock } from 'lucide-react';
import { Order, statusStyle } from '../types';

interface Props {
  order: Order;
  onOpen: () => void;
}

export default function OrderCard({ order, onOpen }: Props) {
  const st = statusStyle(order.status);
  const pct = order.total > 0 ? Math.round((100 * order.done) / order.total) : 0;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/70 overflow-hidden active:scale-[0.99] transition-transform cv-auto"
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: st.solid }}>
        <span className="text-white font-bold text-[13px] truncate flex-1">
          🧾 {order.orderNum || '—'}
          {order.projectId && <span className="opacity-80 font-medium"> · {order.projectId}</span>}
        </span>
        <ChevronRight size={18} className="text-white/90 flex-shrink-0" />
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-gray-900">
          <User size={14} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{order.client || '—'}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
            style={{ background: st.bg, color: st.fg }}
          >
            {order.status || 'без статусу'}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
            <Package size={12} /> {order.total} поз.
          </span>
        </div>

        {order.total > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mb-1">
              <span>Готово {order.done} з {order.total}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: st.solid }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {order.date && (
            <span className="flex items-center gap-1"><Rocket size={12} /> {order.date}</span>
          )}
          {order.deadline && (
            <span className="flex items-center gap-1"><Clock size={12} /> {order.deadline}</span>
          )}
        </div>
      </div>
    </button>
  );
}
