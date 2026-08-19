// ================================================================
//  src/pages/PurchasedPage.tsx — 🛒 Покупні по всіх замовленнях.
//
//  Кріплення й покупні вузли ШІ дістає зі специфікацій кожного
//  замовлення окремо. Але купують їх НЕ по одному замовленню:
//  та сама гайка потрібна в трьох картках, і замовляти її треба
//  один раз — на всю потребу.
//
//  Тому рядки зведені по номенклатурі: одна позиція = одна назва,
//  всередині видно, кому скільки. Далі — робота списками: галочками
//  вибрав, об'єднав у названий список (заявку), сформував маленьку
//  накладну й відправив менеджеру. Статус іде шляхом
//  опрацювання → замовлено → доставлено.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, RefreshCw, Search, Check, ChevronRight, ChevronDown,
  Loader2, Copy, FileDown, Layers, PackageCheck, Truck, CircleDashed, X,
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

type Filter = 'need' | 'work' | 'ordered' | 'done' | 'all';

/** Шлях позиції: порожньо → опрацювання → замовлено → доставлено. */
const STATUS_META: Record<string, { label: string; fg: string; bg: string; line: string }> = {
  'Опрацювання': { label: 'опрацювання', fg: 'var(--blue)', bg: 'var(--blue-bg)', line: 'var(--blue-line)' },
  'Замовлено': { label: 'замовлено', fg: 'var(--amber)', bg: 'var(--amber-bg)', line: 'var(--amber-line)' },
  'Доставлено': { label: 'доставлено', fg: 'var(--green)', bg: 'var(--green-bg)', line: 'var(--green-line)' },
  // з першої версії розділу — читаємо, але більше не ставимо
  'Куплено': { label: 'куплено', fg: 'var(--green)', bg: 'var(--green-bg)', line: 'var(--green-line)' },
};
const DONE = new Set(['Доставлено', 'Куплено']);

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'need', label: 'Треба купити' },
  { key: 'work', label: 'Опрацювання' },
  { key: 'ordered', label: 'Замовлено' },
  { key: 'done', label: 'Доставлено' },
  { key: 'all', label: 'Всі' },
];

const num = (v: string) => parseFloat(String(v ?? '').replace(',', '.')) || 0;

/** Квадратик вибору — свій, бо системний чекбокс не вміє наш колір і розмір. */
function Box({ on, half }: { on: boolean; half?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-[3px] flex-shrink-0"
      style={on
        ? { background: 'var(--accent)', color: '#fff' }
        : { boxShadow: `inset 0 0 0 1.5px ${half ? 'var(--accent)' : 'var(--line-2)'}`, background: 'var(--surface)' }}>
      {on
        ? <Check size={11} strokeWidth={3} />
        : half ? <span className="w-[7px] h-[2px] rounded-sm" style={{ background: 'var(--accent)' }} /> : null}
    </span>
  );
}

/** Одна номенклатура: скільки всього треба і з яких замовлень. */
interface Group {
  key: string;
  code: string;
  name: string;
  total: number;
  lines: PurchaseLine[];
  orders: string[];
  batches: string[];
  status: 'need' | 'part' | 'done';
}

export default function PurchasedPage({ orders, onToast, onOpenOrder, refreshKey }: Props) {
  const [rows, setRows] = useState<PurchaseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('need');
  const [order, setOrder] = useState('');       // фільтр по замовленню
  const [batch, setBatch] = useState('');       // фільтр по списку (заявці)
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<number>>(new Set());   // рядки аркуша
  const [naming, setNaming] = useState(false);  // діалог «назвати список»
  const [listName, setListName] = useState('');

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

  /**
   * Зведення по номенклатурі: ключ — назва + код, як у розборі.
   * Дублі (те саме креслення прийшло кількома рядками маршруту)
   * рахуємо один раз — інакше 8 гайок перетворюються на 32.
   */
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    const seen = new Set<string>();
    rows.forEach(r => {
      if (order && r.order !== order) return;
      if (batch && r.batch !== batch) return;
      const dup = `${r.order}|${r.assembly}|${r.pos}|${r.code}|${r.name}`.toLowerCase();
      if (seen.has(dup)) return;
      seen.add(dup);
      const key = `${r.name.toLowerCase()}|${r.code.toLowerCase()}`;
      const g = m.get(key) || {
        key, code: r.code, name: r.name, total: 0, lines: [], orders: [], batches: [], status: 'need' as const,
      };
      g.total += num(r.total);
      g.lines.push(r);
      if (!g.orders.includes(r.order)) g.orders.push(r.order);
      if (r.batch && !g.batches.includes(r.batch)) g.batches.push(r.batch);
      m.set(key, g);
    });
    const list = [...m.values()];
    list.forEach(g => {
      const done = g.lines.filter(l => DONE.has(l.status)).length;
      const marked = g.lines.filter(l => l.status).length;
      g.status = done === g.lines.length ? 'done' : marked ? 'part' : 'need';
      g.lines.sort((a, b) => a.order.localeCompare(b.order) || a.assembly.localeCompare(b.assembly));
    });
    const query = q.trim().toLowerCase();
    return list
      .filter(g => {
        if (filter === 'need') return g.lines.some(l => !l.status);
        if (filter === 'work') return g.lines.some(l => l.status === 'Опрацювання');
        if (filter === 'ordered') return g.lines.some(l => l.status === 'Замовлено');
        if (filter === 'done') return g.status === 'done';
        return true;
      })
      .filter(g => !query || g.name.toLowerCase().includes(query) || g.code.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [rows, q, filter, order, batch]);

  const orderList = useMemo(() => {
    const s = new Set(rows.map(r => r.order).filter(Boolean));
    return [...s].sort((a, b) => (orderLabel.get(b) || b).localeCompare(orderLabel.get(a) || a, 'uk', { numeric: true }));
  }, [rows, orderLabel]);

  /** Списки (заявки), у які вже зібрані позиції. */
  const batchList = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => { if (r.batch) m.set(r.batch, (m.get(r.batch) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0], 'uk', { numeric: true }));
  }, [rows]);

  const stats = useMemo(() => ({
    need: rows.filter(r => !r.status).length,
    work: rows.filter(r => r.status === 'Опрацювання').length,
    ordered: rows.filter(r => r.status === 'Замовлено').length,
    done: rows.filter(r => DONE.has(r.status)).length,
    all: rows.length,
  }), [rows]);

  const flip = (k: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  function pickGroup(g: Group, on: boolean) {
    setSel(prev => {
      const n = new Set(prev);
      g.lines.forEach(l => (on ? n.add(l.row) : n.delete(l.row)));
      return n;
    });
  }
  const pickAll = (on: boolean) =>
    setSel(on ? new Set(groups.flatMap(g => g.lines.map(l => l.row))) : new Set());

  /** Відмітка статусу для вибраних рядків (назву списку не чіпаємо). */
  async function mark(status: string, rowsToMark?: number[]) {
    const list = rowsToMark || [...sel];
    if (!list.length) return;
    setBusy(true);
    try {
      await api.purchasedStatus(list, status, '', true);
      setRows(prev => prev.map(r => (list.includes(r.row) ? { ...r, status } : r)));
      if (!rowsToMark) setSel(new Set());
      onToast(status ? `${list.length} поз. — ${status.toLowerCase()}` : `Знято відмітку з ${list.length} поз.`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відмітити', true);
    } finally {
      setBusy(false);
    }
  }

  /** Об'єднати вибране в названий список (заявку). */
  async function makeList() {
    const name = listName.trim();
    if (!name) { onToast('Дайте списку назву', true); return; }
    const list = [...sel];
    setBusy(true);
    try {
      await api.purchasedStatus(list, 'Опрацювання', name);
      setRows(prev => prev.map(r => (list.includes(r.row) ? { ...r, status: 'Опрацювання', batch: name } : r)));
      setNaming(false);
      setListName('');
      // Позиції пішли в «Опрацювання» — показуємо саме їх, інакше вони
      // зникають із фільтра «Треба купити» і здається, що нічого не сталось
      setFilter('work');
      setBatch(name);
      onToast(`📋 Список «${name}» — ${list.length} поз.`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося створити список', true);
    } finally {
      setBusy(false);
    }
  }

  /** Рядки документа з того, що зараз вибрано (або з відкритого списку). */
  function docLines() {
    const picked = groups
      .map(g => {
        const lines = g.lines.filter(l => sel.has(l.row));
        if (!lines.length) return null;
        return {
          name: g.name,
          code: g.code,
          qty: lines.reduce((s, l) => s + num(l.total), 0),
          orders: [...new Set(lines.map(l => orderLabel.get(l.order) || l.order))],
        };
      })
      .filter(Boolean) as Array<{ name: string; code: string; qty: number; orders: string[] }>;
    return picked;
  }

  /** Заявка текстом — щоб кинути в месенджер без файлу. */
  function copyRequest() {
    const picked = docLines();
    if (!picked.length) { onToast('Нічого не вибрано', true); return; }
    const text = picked.map(l =>
      `${l.name}${l.code && l.code !== l.name ? ` (${l.code})` : ''} — ${l.qty} шт   [${l.orders.join(', ')}]`
    ).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => onToast(`Заявку на ${picked.length} найм. скопійовано`))
      .catch(() => onToast('Не вдалося скопіювати', true));
  }

  /** Маленька накладна PDF — те, що відправляють менеджеру. */
  async function makeDoc() {
    const picked = docLines();
    if (!picked.length) { onToast('Нічого не вибрано', true); return; }
    setBusy(true);
    try {
      const { buildRequestPdf } = await import('../lib/requestPdf');
      const title = batch || listName.trim() || `Заявка ${new Date().toLocaleDateString('uk')}`;
      const blob = await buildRequestPdf({
        title,
        date: new Date().toLocaleDateString('uk'),
        lines: picked.map(l => ({ name: l.name, code: l.code, qty: l.qty, orders: l.orders })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      onToast(`📄 Накладна на ${picked.length} найм. — у завантаженнях`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зібрати документ', true);
    } finally {
      setBusy(false);
    }
  }

  const allPicked = groups.length > 0 && groups.every(g => g.lines.every(l => sel.has(l.row)));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Шапка розділу */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b hairline" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <ShoppingCart size={15} />
          </span>
          <p className="font-extrabold text-[14px]">Закупівлі</p>
          <span className="k-label">{stats.all} рядків · {groups.length} найменувань</span>

          <div className="relative flex-1 min-w-[150px] max-w-[320px] ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Назва або ГОСТ…"
              className="k-input w-full pl-7 pr-2 py-[6px] rounded-lg outline-none text-[12.5px]"
              />
          </div>
          <button onClick={load} className="p-1.5 press" aria-label="Оновити" style={{ color: 'var(--ink-2)' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {FILTERS.map(f => {
            const on = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-2.5 py-1 rounded-[8px] text-[11.5px] font-bold transition-colors"
                style={on
                  ? { background: 'var(--ink)', color: 'var(--surface)' }
                  : { background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                {f.label} <span className="font-mono">{stats[f.key]}</span>
              </button>
            );
          })}

          {orderList.length > 1 && (
            <select value={order} onChange={e => setOrder(e.target.value)}
              className="k-input px-2 py-1 rounded-[8px] text-[11.5px] font-bold outline-none"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              <option value="">Усі замовлення</option>
              {orderList.map(o => <option key={o} value={o}>{orderLabel.get(o) || o}</option>)}
            </select>
          )}
        </div>

        {/* Списки (заявки) — клік показує лише свої позиції */}
        {batchList.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="k-label">Списки:</span>
            {batchList.map(([b, n]) => (
              <button key={b} onClick={() => setBatch(batch === b ? '' : b)}
                className="k-chip press flex items-center gap-1"
                style={batch === b
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : undefined}>
                <Layers size={10} /> {b} <span className="font-mono">{n}</span>
              </button>
            ))}
            {batch && (
              <button onClick={() => setBatch('')} className="k-label press flex items-center gap-1">
                <X size={10} /> показати всі
              </button>
            )}
          </div>
        )}
      </div>

      {/* Перелік */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5" style={{ background: 'var(--bg)' }}>
        {loading && !rows.length && <p className="k-label text-center py-10">Читаю аркуш «Покупні»…</p>}

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
                  <th className="px-2 py-[7px] w-[62px]" style={{ borderBottom: '1.5px solid var(--ink)' }}>
                    <button onClick={() => pickAll(!allPicked)} className="p-0.5 press flex" aria-label="Вибрати все">
                      <Box on={allPicked} half={!allPicked && sel.size > 0} />
                    </button>
                  </th>
                  {['Номенклатура', 'Всього', 'Замовлення', 'Стан'].map((h, i) => (
                    <th key={h} className={`k-label px-2.5 py-[7px] whitespace-nowrap ${i === 1 ? 'text-right' : 'text-left'}`}
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
                      <td className="px-2 py-[6px]">
                        <span className="flex items-center gap-1">
                          <button onClick={() => pickGroup(g, !picked)} className="p-0.5 press flex" aria-label="Вибрати">
                            <Box on={picked} half={some} />
                          </button>
                          <button onClick={() => flip(g.key)} className="p-0.5 press" aria-label="Розгорнути"
                            style={{ color: 'var(--ink-3)' }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        </span>
                      </td>
                      <td className="px-2.5 py-[6px]" style={{ maxWidth: 0, width: '100%' }}>
                        <button onClick={() => flip(g.key)} className="text-left press block w-full">
                          <span className="block font-semibold truncate">{g.name}</span>
                          {g.code && g.code !== g.name && <span className="block k-label truncate">{g.code}</span>}
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
                            <PackageCheck size={11} className="inline -mt-0.5" /> доставлено
                          </span>
                        ) : g.status === 'part' ? (
                          <span className="k-chip" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                            в роботі
                          </span>
                        ) : (
                          <span className="k-chip"><CircleDashed size={11} className="inline -mt-0.5" /> треба</span>
                        )}
                        {g.batches.map(b => (
                          <span key={b} className="k-chip ml-1" title="Список, у якому ця позиція">
                            <Layers size={9} className="inline -mt-0.5" /> {b}
                          </span>
                        ))}
                      </td>
                    </tr>,

                    ...(isOpen ? g.lines.map(l => (
                      <tr key={`${g.key}:${l.row}`} className="border-b"
                        style={{ borderColor: 'var(--paper-line)', borderStyle: 'dashed', background: 'var(--bg)' }}>
                        <td className="px-2 py-[5px]">
                          <button onClick={() => setSel(prev => {
                            const n = new Set(prev);
                            n.has(l.row) ? n.delete(l.row) : n.add(l.row);
                            return n;
                          })} className="p-0.5 press flex ml-4" aria-label="Вибрати рядок">
                            <Box on={sel.has(l.row)} />
                          </button>
                        </td>
                        <td className="px-2.5 py-[5px]" style={{ maxWidth: 0, width: '100%' }}>
                          <span className="k-label block truncate">
                            {orderLabel.get(l.order) || l.order} · {l.assembly || 'без збірки'}
                          </span>
                          <span className="text-[11.5px] block truncate" style={{ color: 'var(--ink-2)' }}>
                            поз. {l.pos || '—'} · {l.perOne || '?'} × {l.sets || '?'} компл.
                            {l.by && ` · ${l.by}`}
                          </span>
                        </td>
                        <td className="px-2.5 py-[5px] text-right font-mono">{l.total}</td>
                        <td className="px-2.5 py-[5px] k-label truncate max-w-[240px]" title={l.sourceText}>
                          {l.sourceText || '—'}
                        </td>
                        <td className="px-2.5 py-[5px] whitespace-nowrap">
                          <select value={l.status} disabled={busy}
                            onChange={e => mark(e.target.value, [l.row])}
                            className="k-input px-1.5 py-[3px] rounded-[6px] text-[11px] font-bold outline-none"
                            style={l.status
                              ? { background: STATUS_META[l.status]?.bg, color: STATUS_META[l.status]?.fg, boxShadow: `inset 0 0 0 1px ${STATUS_META[l.status]?.line}` }
                              : { background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                            <option value="">треба купити</option>
                            <option value="Опрацювання">опрацювання</option>
                            <option value="Замовлено">замовлено</option>
                            <option value="Доставлено">доставлено</option>
                          </select>
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

      {/* Назвати список */}
      {naming && (
        <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setNaming(false)} />
          <div className="relative w-full lg:w-[420px] bg-white rounded-t-3xl lg:rounded-3xl p-4 shadow-2xl animate-sheet-up">
            <p className="font-extrabold text-[14px]">Новий список закупівлі</p>
            <p className="k-label mt-0.5">{sel.size} позицій · назва потрапить у накладну</p>
            <input autoFocus value={listName} onChange={e => setListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') makeList(); }}
              placeholder="Напр. «Кріплення 18.08» або «Метизи до 27/07»"
              className="k-input w-full mt-3 px-3 py-2 rounded-[8px] outline-none text-[13px]"
              />
            <div className="flex items-center gap-1.5 mt-3">
              <button onClick={() => setNaming(false)} className="px-3 py-2 rounded-[8px] text-[12.5px] font-bold press"
                style={{ color: 'var(--ink-3)' }}>Скасувати</button>
              <button onClick={makeList} disabled={busy}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[12.5px] font-bold press"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Створити список
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Панель дій — з'являється, коли щось вибрано */}
      {sel.size > 0 && (
        <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-1.5 flex-wrap"
          style={{ background: 'var(--surface)' }}>
          <span className="text-[12.5px] font-bold">
            Вибрано {sel.size} <span className="k-label">рядків</span>
          </span>

          <button onClick={() => setNaming(true)} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press ml-auto"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
            <Layers size={13} /> Об'єднати в список
          </button>
          <button onClick={makeDoc} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Накладна PDF
          </button>
          <button onClick={copyRequest} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            <Copy size={13} /> Текстом
          </button>

          <span className="w-px h-5 mx-0.5" style={{ background: 'var(--line)' }} />

          <button onClick={() => mark('Замовлено')} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--amber-bg)', color: 'var(--amber)', boxShadow: 'inset 0 0 0 1px var(--amber-line)' }}>
            <ShoppingCart size={13} /> Замовлено
          </button>
          <button onClick={() => mark('Доставлено')} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-bold press"
            style={{ background: 'var(--green)', color: '#fff' }}>
            <Truck size={13} /> Доставлено
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
