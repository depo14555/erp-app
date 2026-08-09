// ================================================================
//  src/pages/PriorityPage.tsx — 🔥 Пріоритет: спільна черга замовлень.
//  Порядок бачать усі (зберігається в таблиці-хабі): що робимо першим,
//  що другим. Перетягуванням на десктопі або стрілками на телефоні.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, ChevronUp, ChevronDown, X, Plus, Flame, GripVertical, Clock, Package,
} from 'lucide-react';
import { api } from '../api';
import { Order, statusStyle, isClosed } from '../types';

interface Props {
  orders: Order[];
  onOpen: (o: Order) => void;
  onToast: (msg: string, err?: boolean) => void;
  refreshSignal?: number;
}

export default function PriorityPage({ orders, onOpen, onToast, refreshSignal }: Props) {
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    api.priority()
      .then(r => setOrder(r.order || []))
      .catch(e => onToast(e?.message || 'Не вдалося прочитати пріоритет', true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const byId = useMemo(() => new Map(orders.map(o => [o.projectId, o])), [orders]);
  /** У черзі — лише ті, що ще існують у списку замовлень. */
  const queue = useMemo(() => order.filter(id => byId.has(id)), [order, byId]);
  const rest = useMemo(() => {
    const inQueue = new Set(queue);
    const query = q.trim().toLowerCase();
    return orders
      .filter(o => !inQueue.has(o.projectId) && !isClosed(o.status))
      .filter(o => !query || [o.orderNum, o.client, o.projectId].join(' ').toLowerCase().includes(query));
  }, [orders, queue, q]);

  async function persist(next: string[]) {
    setOrder(next);
    setSaving(true);
    try {
      await api.priority(next);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти порядок', true);
    } finally {
      setSaving(false);
    }
  }

  function move(id: string, delta: number) {
    const idx = queue.indexOf(id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= queue.length) return;
    const next = [...queue];
    next.splice(to, 0, next.splice(idx, 1)[0]);
    persist(next);
  }
  function dropOn(targetId: string) {
    if (!drag || drag === targetId) { setDrag(''); return; }
    const next = queue.filter(x => x !== drag);
    const at = next.indexOf(targetId);
    next.splice(at < 0 ? next.length : at, 0, drag);
    setDrag('');
    persist(next);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
          <Flame size={15} className="text-orange-500" /> Черга робіт
        </span>
        <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          порядок спільний для всіх · {queue.length} у черзі
        </span>
        {saving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 pb-5">
        <div className="max-w-[900px] mx-auto space-y-4">
          {loading && <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-[var(--accent)]" /></div>}

          {/* Черга */}
          <div className="space-y-1.5">
            {queue.map((id, i) => {
              const o = byId.get(id)!;
              const st = statusStyle(o.status);
              const pct = o.total > 0 ? Math.round((100 * o.done) / o.total) : 0;
              return (
                <div key={id}
                  draggable
                  onDragStart={() => setDrag(id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => dropOn(id)}
                  onDragEnd={() => setDrag('')}
                  className={`bg-white rounded-2xl ring-1 ring-gray-200/70 p-2.5 flex items-center gap-2.5 ${drag === id ? 'opacity-40' : ''}`}
                  style={{ borderLeft: `4px solid ${st.solid}` }}>
                  <GripVertical size={14} className="hidden lg:block text-gray-300 flex-shrink-0 cursor-grab" />
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                    style={{ background: i === 0 ? '#FEF3C7' : 'var(--accent-soft)', color: i === 0 ? '#B45309' : 'var(--accent)' }}>
                    {i + 1}
                  </span>
                  <button onClick={() => onOpen(o)} className="flex-1 min-w-0 text-left press">
                    <p className="font-bold text-[13.5px] truncate">{o.orderNum || o.projectId}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {o.client || '—'} · <span style={{ color: st.fg }}>{o.status || 'без статусу'}</span>
                    </p>
                  </button>
                  <span className="hidden sm:flex items-center gap-2 text-[11px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                    <span className="flex items-center gap-1"><Package size={10} /> {o.done}/{o.total}</span>
                    <span className="w-[52px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: st.solid }} />
                    </span>
                    {o.deadline && <span className="flex items-center gap-1"><Clock size={10} /> {o.deadline}</span>}
                  </span>
                  <div className="flex items-center flex-shrink-0">
                    <button onClick={() => move(id, -1)} disabled={i === 0}
                      className="p-1.5 rounded-lg press disabled:opacity-25" style={{ color: 'var(--ink-2)' }} aria-label="Вище">
                      <ChevronUp size={15} />
                    </button>
                    <button onClick={() => move(id, 1)} disabled={i === queue.length - 1}
                      className="p-1.5 rounded-lg press disabled:opacity-25" style={{ color: 'var(--ink-2)' }} aria-label="Нижче">
                      <ChevronDown size={15} />
                    </button>
                    <button onClick={() => persist(queue.filter(x => x !== id))}
                      className="p-1.5 rounded-lg press text-red-500" aria-label="Прибрати з черги">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && !queue.length && (
              <p className="text-center text-[12.5px] py-8 rounded-2xl bg-white ring-1 ring-gray-200/60" style={{ color: 'var(--ink-3)' }}>
                Черга порожня — додайте замовлення зі списку нижче
              </p>
            )}
          </div>

          {/* Додати в чергу */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <p className="text-[12px] font-bold">Додати в чергу</p>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук замовлення…"
                className="flex-1 min-w-[160px] max-w-[280px] px-3 py-1.5 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12px]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
              {rest.slice(0, 60).map(o => {
                const st = statusStyle(o.status);
                return (
                  <button key={o.headerRow} onClick={() => persist([...queue, o.projectId])}
                    className="flex items-center gap-2 p-2.5 rounded-2xl bg-white ring-1 ring-gray-200/70 text-left press hover:ring-gray-300">
                    <Plus size={14} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold truncate">{o.orderNum || o.projectId}</span>
                      <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>{o.client || '—'}</span>
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: st.bg, color: st.fg }}>{o.status || '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
