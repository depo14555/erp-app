// ================================================================
//  src/pages/DashboardPage.tsx
//  Огляд: лічильники, розподіл за статусами, завантаження
//  виконавців, найближчі терміни.
// ================================================================

import { Package, CheckCircle2, Clock, Users, TrendingUp } from 'lucide-react';
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
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-gray-900/5 p-3.5">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-bold text-gray-500 leading-tight pr-2">{label}</span>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}14`, color }}>
          <Icon size={16} />
        </span>
      </div>
      <p className="text-[26px] font-bold text-gray-900 tabular-nums leading-none tracking-tight">{value}</p>
      {sub && <p className="text-[10.5px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  );
}

/** Кільце прогресу — головний показник готовності. */
function ProgressRing({ pct, done, total }: { pct: number; done: number; total: number }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-gray-900/5 p-4 flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" stroke="#EEF2F6" strokeWidth="9" />
          <circle cx="42" cy="42" r={R} fill="none" stroke="#4F46E5" strokeWidth="9"
            strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C - (C * pct) / 100} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-bold text-gray-900 tabular-nums leading-none">{pct}%</span>
          <span className="text-[9px] text-gray-400 font-semibold mt-0.5">готово</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-gray-500">Позиції у виробництві</p>
        <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight mt-0.5">
          {done.toLocaleString('uk-UA')}
          <span className="text-[14px] text-gray-400 font-semibold"> / {total.toLocaleString('uk-UA')}</span>
        </p>
        <p className="text-[10.5px] text-gray-400 mt-1">по всіх замовленнях</p>
      </div>
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
    <div className="h-full overflow-y-auto px-3 lg:px-5 pb-5 pt-3">
      <div className="max-w-[1240px] mx-auto w-full space-y-3">
      <p className="text-[11px] text-gray-400 px-0.5">
        Оновлено {data.updatedAt}{loading ? ' · завантаження…' : ''}
      </p>

      {/* Верхній ряд: головний показник + лічильники (на десктопі в один ряд) */}
      <div className="grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr] gap-2.5">
        <div className="col-span-2 md:col-span-1">
          <ProgressRing pct={pct} done={counts.positionsDone} total={counts.positions} />
        </div>
        <Tile label="Замовлень в роботі" value={counts.activeOrders} sub={`з ${counts.orders} усього`}
          Icon={TrendingUp} color="#EF6C00" />
        <Tile label="Завершено" value={counts.doneOrders} sub="готові, здані, відвантажені"
          Icon={CheckCircle2} color="#2E7D32" />
      </div>

      {/* Дві колонки на широких екранах */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
      {/* Розподіл за статусами */}
      {byStatus.length > 0 && (
        <section className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-gray-900/5 p-3.5">
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
        <section className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-gray-900/5 p-3.5">
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
      </div>

      {/* Найближчі терміни */}
      {deadlines.length > 0 && (
        <section className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-gray-900/5 p-3.5">
          <h2 className="text-[12px] font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Clock size={13} /> Терміни
          </h2>
          <div className="grid lg:grid-cols-2 gap-x-4 gap-y-1.5">
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
    </div>
  );
}
