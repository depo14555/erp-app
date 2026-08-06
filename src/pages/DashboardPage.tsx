// ================================================================
//  src/pages/DashboardPage.tsx
//  Огляд: лічильники, розподіл за статусами, завантаження
//  виконавців, найближчі терміни.
// ================================================================

import { RefreshCw, Package, CheckCircle2, Clock, Users, TrendingUp } from 'lucide-react';
import { DashboardData, Order, statusStyle } from '../types';

interface Props {
  data: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenOrder: (o: Order) => void;
}

function Tile({ label, value, sub, Icon, color }: {
  label: string; value: string | number; sub?: string;
  Icon: typeof Package; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, color }}>
          <Icon size={15} />
        </span>
        <span className="text-[11px] font-bold text-gray-500 leading-tight">{label}</span>
      </div>
      <p className="text-[24px] font-bold text-gray-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage({ data, loading, onRefresh, onOpenOrder }: Props) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-[13px]">
        {loading ? 'Завантаження…' : 'Немає даних'}
      </div>
    );
  }

  const { counts, byStatus, executors, deadlines } = data;
  const pct = counts.positions > 0 ? Math.round((100 * counts.positionsDone) / counts.positions) : 0;
  const maxOpen = Math.max(1, ...executors.map(e => e.open));

  return (
    <div className="h-full overflow-y-auto px-3 pb-4 pt-3 space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] text-gray-400">Оновлено {data.updatedAt}</p>
        <button onClick={onRefresh} className="p-1.5 text-blue-600" aria-label="Оновити">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Лічильники */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="В роботі" value={counts.activeOrders} sub={`всього ${counts.orders} замовлень`}
          Icon={TrendingUp} color="#EF6C00" />
        <Tile label="Завершено" value={counts.doneOrders} sub="готові та відвантажені"
          Icon={CheckCircle2} color="#2E7D32" />
        <Tile label="Позицій" value={counts.positions} sub="у всіх замовленнях"
          Icon={Package} color="#1565C0" />
        <Tile label="Готово позицій" value={`${pct}%`} sub={`${counts.positionsDone} з ${counts.positions}`}
          Icon={CheckCircle2} color="#00695C" />
      </div>

      {/* Розподіл за статусами */}
      {byStatus.length > 0 && (
        <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
          <h2 className="text-[12px] font-bold text-gray-500 mb-2.5">Замовлення за статусами</h2>
          <div className="space-y-2">
            {byStatus.map(s => {
              const st = statusStyle(s.status);
              const w = counts.orders > 0 ? Math.round((100 * s.count) / counts.orders) : 0;
              return (
                <div key={s.status} className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold w-28 flex-shrink-0 truncate"
                    style={{ color: st.fg }}>{s.status}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: st.solid }} />
                  </div>
                  <span className="text-[11.5px] font-bold text-gray-700 tabular-nums w-6 text-right">
                    {s.count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Завантаження виконавців */}
      {executors.length > 0 && (
        <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
          <h2 className="text-[12px] font-bold text-gray-500 mb-2.5 flex items-center gap-1.5">
            <Users size={13} /> Завантаження виконавців
          </h2>
          <div className="space-y-2">
            {executors.map(e => (
              <div key={e.name} className="flex items-center gap-2">
                <span className="text-[11.5px] font-semibold text-gray-700 w-28 flex-shrink-0 truncate">
                  {e.name}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500"
                    style={{ width: `${Math.round((100 * e.open) / maxOpen)}%` }} />
                </div>
                <span className="text-[11px] tabular-nums w-14 text-right">
                  <b className="text-orange-600">{e.open}</b>
                  <span className="text-gray-400"> / {e.done}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">в роботі / виконано</p>
        </section>
      )}

      {/* Найближчі терміни */}
      {deadlines.length > 0 && (
        <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
          <h2 className="text-[12px] font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Clock size={13} /> Терміни
          </h2>
          <div className="space-y-1.5">
            {deadlines.map(o => {
              const st = statusStyle(o.status);
              return (
                <button key={o.headerRow} onClick={() => onOpenOrder(o)}
                  className="w-full flex items-center gap-2 py-1.5 text-left active:bg-gray-50 rounded-xl px-1">
                  <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: st.solid }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-gray-900 truncate">{o.orderNum || o.projectId}</p>
                    <p className="text-[11px] text-gray-500 truncate">{o.client}</p>
                  </div>
                  <span className="text-[11px] font-bold text-gray-600 flex-shrink-0">{o.deadline}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
