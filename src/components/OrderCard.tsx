// ================================================================
//  src/components/OrderCard.tsx
//  Картка замовлення у стилі сучасної CRM: кольорова смуга статусу
//  ліворуч, чиста типографіка, прогрес-бар, метадані рядком.
// ================================================================

import { ChevronRight, Package, Rocket, Clock } from 'lucide-react';
import { Order, statusStyle } from '../types';

interface Props {
  order: Order;
  onOpen: () => void;
  active?: boolean;
}

export default function OrderCard({ order, onOpen, active }: Props) {
  const st = statusStyle(order.status);
  const pct = order.total > 0 ? Math.round((100 * order.done) / order.total) : 0;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left card overflow-hidden flex press cv-auto"
      style={active ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
    >
      {/* Смуга статусу */}
      <span className="w-1 flex-shrink-0" style={{ background: st.solid }} />

      <div className="flex-1 min-w-0 p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-gray-900 truncate leading-tight">
              {order.orderNum || order.projectId || '—'}
            </p>
            <p className="text-[12px] text-gray-500 truncate mt-0.5">{order.client || '—'}</p>
          </div>
          <span
            className="text-[10.5px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: st.bg, color: st.fg }}
          >
            {order.status || 'без статусу'}
          </span>
          <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1 -mr-1" />
        </div>

        {order.total > 0 && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-gray-500 flex items-center gap-1">
                <Package size={11} /> {order.done} з {order.total} готово
              </span>
              <span className="font-bold tabular-nums" style={{ color: st.fg }}>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: st.solid }} />
            </div>
          </div>
        )}

        {(order.date || order.deadline || order.projectId) && (
          <div className="flex items-center gap-3 mt-2 text-[10.5px] text-gray-400">
            {order.projectId && <span className="font-mono">{order.projectId}</span>}
            {order.date && <span className="flex items-center gap-1"><Rocket size={10} /> {order.date}</span>}
            {order.deadline && (
              <span className="flex items-center gap-1 ml-auto font-semibold text-gray-500">
                <Clock size={10} /> {order.deadline}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
