// ================================================================
//  src/pages/PurchasedPage.tsx — 🛒 Покупні по всіх замовленнях.
//
//  Кріплення й покупні вузли ШІ дістає зі специфікацій кожного
//  замовлення окремо. Але купують їх НЕ по одному замовленню:
//  та сама гайка потрібна в трьох картках, і замовляти її треба
//  один раз — на всю потребу.
//
//  Тому тут рядки зведені по номенклатурі: одна позиція = одна
//  назва, всередині видно, кому скільки. Галочка позначає, що
//  позиція вже куплена; вибрані позиції збираються в заявку —
//  список, який можна скопіювати постачальнику одним рухом.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, RefreshCw, Search, Check, ChevronRight, ChevronDown,
  Loader2, Copy, PackageCheck, CircleDashed,
} from 'lucide-react';
import { api } from '../api';
import { Order, PurchaseLine } from '../types';

interface Props {
  orders: Order[];
  onToast: (msg: string, err?: boolean) => void;
  onOpenOrder: (headerRow: number) => void;
  /** Змінюється, коли натиснули «оновити» в шапці. */
  refreshKey?: number;
}

type Filter = 'need' | 'ordered' | 'done' | 'all';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'need', label: 'Треба купити' },
  { key: 'ordered', label: 'Замовлено' },
  { key: 'done', label: 'Куплено' },
  { key: 'all', label: 'Всі' },
];

const num = (v: string) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

/** Одна номенклатура: скільки всього треба і з яких замовлень. */
interface Group {
  key: string;
  code: string;
  name: string;
  total: number;
  lines: PurchaseLine[];
  orders: string[];
  status: 'need' | 'part' | 'done';
}

export default function PurchasedPage({ orders, onToast, onOpenOrder, refreshKey }: Props) {
  const [rows, setRows] = useState<PurchaseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('need');
  const [order, setOrder] = useState('');       // фільтр по замовленню
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<number>>(new Set());   // рядки аркуша

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.purchasedAll();
      setRows(d.rows || []);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прочитати покупні', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load, refreshKey]);

  /** projectId → як замовлення називається людською мовою. */
  const orderLabel = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach(o => m.set(o.projectId, o.orderNum || o.projectId));
    return m;
  }, [orders]);
  const orderRow = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach(o => m.set(o.projectId, o.headerRow));
    return m;
  }, [orders]);

  /** Зведення по номенклатурі: ключ — назва + код, як у розборі. */
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    rows.forEach(r => {
      if (order && r.order !== order) return;
      const key = `${r.name.toLowerCase()}|${r.code.toLowerCase()}`;
      const g = m.get(key) || {
        key, code: r.code, name: r.name, total: 0, lines: [], orders: [], status: 'need' as const,
      };
      g.total += num(r.total);
      g.lines.push(r);
      if (!g.orders.includes(r.order)) g.orders.push(r.order);
      m.set(key, g);
    });
    const list = [...m.values()];
    list.forEach(g => {
      const done = g.lines.filter(l => l.status === 'Куплено').length;
      const marked = g.lines.filter(l => l.status).length;
      g.status = done === g.lines.length ? 'done' : marked ? 'part' : 'need';
      g.lines.sort((a, b) => a.order.localeCompare(b.order) || a.assembly.localeCompare(b.assembly));
    });
    const query = q.trim().toLowerCase();
    return list
      .filter(g => {
        if (filter === 'need') return g.lines.some(l => !l.status);
        if (filter === 'ordered') return g.lines.some(l => l.status === 'Замовлено');
        if (filter === 'done') return g.status === 'done';
        return true;
      })
      .filter(g => !query || g.name.toLowerCase().includes(query) || g.code.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [rows, q, filter, order]);

  const orderList = useMemo(() => {
    const s = new Set(rows.map(r => r.order).filter(Boolean));
    return [...s].sort((a, b) => (orderLabel.get(b) || b).localeCompare(orderLabel.get(a) || a, 'uk', { numeric: true }));
  }, [rows, orderLabel]);

  const stats = useMemo(() => {
    const need = rows.filter(r => !r.status).length;
    const ordered = rows.filter(r => r.status === 'Замовлено').length;
    const done = rows.filter(r => r.status === 'Куплено').length;
    return { need, ordered, done, all: rows.length };
  }, [rows]);

  const flip = (k: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  function pickGroup(g: Group, on: boolean) {
    setSel(prev => {
      const n = new Set(prev);
      g.lines.forEach(l => (on ? n.add(l.row) : n.delete(l.row)));
      return n;
    });
  }

  /** Відмітка статусу для вибраних рядків аркуша. */
  async function mark(status: string, rowsToMark?: number[]) {
    const list = rowsToMark || [...sel];
    if (!list.length) return;
    setBusy(true);
    try {
      const batch = status === 'Замовлено' ? `Заявка ${new Date().toLocaleDateString('uk')}` : '';
      await api.purchasedStatus(list, status, batch);
      setRows(prev => prev.map(r => (list.includes(r.row) ? { ...r, status, batch } : r)));
      if (!rowsToMark) setSel(new Set());
      onToast(status ? `${list.length} поз. — ${status.toLowerCase()}` : `Знято відмітку з ${list.length} поз.`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відмітити', true);
    } finally {
      setBusy(false);
    }
  }

  /** Заявка постачальнику: назва, кількість, під які замовлення. */
  function copyRequest() {
    const picked = groups.filter(g => g.lines.some(l => sel.has(l.row)));
    if (!picked.length) { onToast('Нічого не вибрано', true); return; }
    const text = picked.map(g => {
      const qty = g.lines.filter(l => sel.has(l.row)).reduce((s, l) => s + num(l.total), 0);
      const where = g.orders.map(o => orderLabel.get(o) || o).join(', ');
      return `${g.name}${g.code && g.code !== g.name ? ` (${g.code})` : ''} — ${qty} шт   [${where}]`;
    }).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => onToast(`Заявку на ${picked.length} найм. скопійовано`))
      .catch(() => onToast('Не вдалося скопіювати', true));
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Шапка розділу */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b hairline" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <ShoppingCart size={15} />
          </span>
          <p className="font-extrabold text-[14px]">Покупні</p>
          <span className="k-label">
            {stats.all} рядків · {groups.length} найменувань
          </span>

          <div className="relative flex-1 min-w-[150px] max-w-[320px] ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Назва або ГОСТ…"
              className="w-full pl-7 pr-2 py-[6px] rounded-lg outline-none text-[12.5px]"
              style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }} />
          </div>
          <button onClick={load} className="p-1.5 press" aria-label="Оновити" style={{ color: 'var(--ink-2)' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {FILTERS.map(f => {
            const on = filter === f.key;
            const n = f.key === 'all' ? stats.all : stats[f.key === 'need' ? 'need' : f.key === 'ordered' ? 'ordered' : 'done'];
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-2.5 py-1 rounded-[8px] text-[11.5px] font-bold transition-colors"
                style={on
                  ? { background: 'var(--ink)', color: 'var(--surface)' }
                  : { background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                {f.label} <span className="font-mono">{n}</span>
              </button>
            );
          })}

          {orderList.length > 1 && (
            <select value={order} onChange={e => setOrder(e.target.value)}
              className="px-2 py-1 rounded-[8px] text-[11.5px] font-bold outline-none"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              <option value="">Усі замовлення</option>
              {orderList.map(o => <option key={o} value={o}>{orderLabel.get(o) || o}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Перелік */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5" style={{ background: 'var(--bg)' }}>
        {loading && !rows.length && (
          <p className="k-label text-center py-10">Читаю аркуш «Покупні»…</p>
        )}
        {!loading && !groups.length && (
          <div className="text-center py-14">
            <ShoppingCart size={30} className="mx-auto mb-2" style={{ color: 'var(--line-2)' }} />
            <p className="text-[13px] font-bold">
              {rows.length ? 'За цим фільтром нічого немає' : 'Покупних ще не читали'}
            </p>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
              Відкрийте замовлення → «Покупні» — ШІ дістане кріплення зі специфікацій збірок
            </p>
          </div>
        )}

        {!!groups.length && (
          <div className="paper rounded-[11px] border overflow-hidden" style={{ borderColor: 'var(--paper-line)' }}>
            <table className="w-full border-collapse text-[12.5px] paper-table">
              <thead>
                <tr>
                  {['', 'Номенклатура', 'Всього', 'Замовлення', 'Стан'].map((h, i) => (
                    <th key={i} className={`k-label px-2.5 py-[7px] whitespace-nowrap ${i === 2 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1.5px solid var(--ink)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const isOpen = open.has(g.key);
                  const picked = g.lines.every(l => sel.has(l.row));
                  const some = !picked && g.lines.some(l => sel.has(l.row));
                  return [
                    <tr key={g.key} className="border-b" style={{ borderColor: 'var(--paper-line)', borderStyle: 'dashed' }}>
                      <td className="px-1.5 py-[6px] w-[54px]">
                        <span className="flex items-center gap-0.5">
                          <button onClick={() => pickGroup(g, !picked)} className="p-1 press" aria-label="Вибрати">
                            {picked
                              ? <Check size={14} style={{ color: 'var(--accent)' }} />
                              : <span className="inline-block w-[14px] h-[14px] rounded-[3px]"
                                  style={{ boxShadow: `inset 0 0 0 1px ${some ? 'var(--accent)' : 'var(--line-2)'}` }} />}
                          </button>
                          <button onClick={() => flip(g.key)} className="p-0.5 press" aria-label="Розгорнути"
                            style={{ color: 'var(--ink-3)' }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        </span>
                      </td>
                      <td className="px-2.5 py-[6px]">
                        <button onClick={() => flip(g.key)} className="text-left press block max-w-full">
                          <span className="block font-semibold truncate">{g.name}</span>
                          {g.code && g.code !== g.name && (
                            <span className="block k-label truncate">{g.code}</span>
                          )}
                        </button>
                      </td>
                      <td className="px-2.5 py-[6px] text-right font-mono font-bold whitespace-nowrap">
                        {g.total} <span style={{ color: 'var(--ink-3)' }}>шт</span>
                      </td>
                      <td className="px-2.5 py-[6px]">
                        <span className="flex flex-wrap gap-1">
                          {g.orders.map(o => (
                            <button key={o} onClick={() => { const r = orderRow.get(o); if (r) onOpenOrder(r); }}
                              className="k-chip press" title="Відкрити замовлення">
                              {orderLabel.get(o) || o}
                            </button>
                          ))}
                        </span>
                      </td>
                      <td className="px-2.5 py-[6px] whitespace-nowrap">
                        {g.status === 'done' ? (
                          <span className="k-chip" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-line)' }}>
                            <PackageCheck size={11} className="inline -mt-0.5" /> куплено
                          </span>
                        ) : g.status === 'part' ? (
                          <span className="k-chip" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                            частково
                          </span>
                        ) : (
                          <span className="k-chip"><CircleDashed size={11} className="inline -mt-0.5" /> треба</span>
                        )}
                      </td>
                    </tr>,

                    ...(isOpen ? g.lines.map(l => (
                      <tr key={`${g.key}:${l.row}`} className="border-b" style={{ borderColor: 'var(--paper-line)', borderStyle: 'dashed', background: 'var(--bg)' }}>
                        <td className="px-1.5 py-[5px]">
                          <button onClick={() => setSel(prev => {
                            const n = new Set(prev);
                            n.has(l.row) ? n.delete(l.row) : n.add(l.row);
                            return n;
                          })} className="p-1 press ml-4" aria-label="Вибрати рядок">
                            {sel.has(l.row)
                              ? <Check size={13} style={{ color: 'var(--accent)' }} />
                              : <span className="inline-block w-[13px] h-[13px] rounded-[3px]"
                                  style={{ boxShadow: 'inset 0 0 0 1px var(--line-2)' }} />}
                          </button>
                        </td>
                        <td className="px-2.5 py-[5px]">
                          <span className="k-label block">{orderLabel.get(l.order) || l.order} · {l.assembly || 'без збірки'}</span>
                          <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                            поз. {l.pos || '—'} · {l.perOne || '?'} × {l.sets || '?'} компл.
                          </span>
                        </td>
                        <td className="px-2.5 py-[5px] text-right font-mono">{l.total}</td>
                        <td className="px-2.5 py-[5px] k-label truncate max-w-[260px]" title={l.sourceText}>
                          {l.sourceText || '—'}
                        </td>
                        <td className="px-2.5 py-[5px] whitespace-nowrap">
                          <button onClick={() => mark(l.status === 'Куплено' ? '' : 'Куплено', [l.row])}
                            className="k-chip press"
                            style={l.status === 'Куплено'
                              ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-line)' }
                              : l.status === 'Замовлено'
                                ? { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }
                                : undefined}
                            title={l.by || 'Відмітити купленим'}>
                            {l.status || 'треба'}
                          </button>
                        </td>
                      </tr>
                    )) : []),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="k-label px-3 py-[7px] normal-case tracking-normal"
                    style={{ borderTop: '1.5px solid var(--ink)', fontSize: '10.5px' }}>
                    Показано {groups.length} найменувань · вибрано рядків {sel.size}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Панель дій — з'являється, коли щось вибрано */}
      {sel.size > 0 && (
        <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-1.5 flex-wrap"
          style={{ background: 'var(--surface)' }}>
          <span className="text-[12.5px] font-bold">
            Вибрано {sel.size} <span className="k-label">рядків</span>
          </span>
          <button onClick={copyRequest} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press ml-auto"
            style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
            <Copy size={13} /> Заявка в буфер
          </button>
          <button onClick={() => mark('Замовлено')} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--amber-bg)', color: 'var(--amber)', boxShadow: 'inset 0 0 0 1px var(--amber-line)' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />} Замовлено
          </button>
          <button onClick={() => mark('Куплено')} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--green)', color: '#fff' }}>
            <PackageCheck size={13} /> Куплено
          </button>
          <button onClick={() => mark('')} disabled={busy}
            className="px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ color: 'var(--ink-3)' }}>
            Зняти
          </button>
        </div>
      )}
    </div>
  );
}
