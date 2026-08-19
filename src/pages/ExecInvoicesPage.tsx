// ================================================================
//  src/pages/ExecInvoicesPage.tsx — рахунки, які виставили нам виконавці.
//
//  Виконавець кинув рахунок у месенджер → «Поділитися» → ERP, або
//  кнопкою «Додати рахунок». Файл лягає на Диск, рахунок з'являється
//  тут зі станом «вільний».
//
//  Далі його прив'язують до позицій: вибираєш замовлення, відмічаєш
//  за що саме прийшов рахунок — і номер посиланням лягає в колонку
//  «Номер рахунка виконавця» цих позицій. Тому завжди видно, які
//  рахунки ще нікуди не віднесені й за що вже заплачено.
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Receipt, Plus, Loader2, X, Link2, Unlink, ExternalLink, Search,
  FileText, Check, Share2, Trash2,
} from 'lucide-react';
import { api } from '../api';
import StampStrip from '../components/StampStrip';
import { ExecInvoice, Order, OrderItem } from '../types';
import { takeSharedFiles, sharedCount, clearShareParam, fileToShared, SharedFile } from '../lib/shared';

interface Props {
  onToast: (msg: string, err?: boolean) => void;
  onOpenOrder: (headerRow: number, row?: number) => void;
}

const FREE = 'вільний';

/** Гроші однаково: «1 234,50». */
function money(v: unknown): string {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) && n ? n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export default function ExecInvoicesPage({ onToast, onOpenOrder }: Props) {
  const [rows, setRows] = useState<ExecInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'free' | 'linked'>('free');
  const [adding, setAdding] = useState<SharedFile | null>(null);
  const [linking, setLinking] = useState<ExecInvoice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.invoicesGet();
      setRows(d.rows);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося завантажити рахунки', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  // Прийшли з «Поділитися» — одразу відкриваємо форму з тим файлом
  useEffect(() => {
    if (!sharedCount()) return;
    clearShareParam();
    takeSharedFiles().then(files => {
      if (files.length) setAdding(files[0]);
      if (files.length > 1) onToast(`Взято перший із ${files.length} файлів`);
    });
  }, [onToast]);

  const free = useMemo(() => rows.filter(r => String(r['8'] || '').trim() === FREE), [rows]);
  const linked = useMemo(() => rows.filter(r => String(r['8'] || '').trim() !== FREE), [rows]);
  const shown = tab === 'free' ? free : linked;
  const freeSum = free.reduce((s, r) => s + (parseFloat(String(r['4'] || '0').replace(',', '.')) || 0), 0);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { onToast('Файл більший за 20 МБ', true); return; }
    setAdding(await fileToShared(f));
  }

  /** Видаляємо у два кліки — щоб випадковий дотик не прибрав рахунок. */
  const [confirmRow, setConfirmRow] = useState(0);
  async function remove(inv: ExecInvoice) {
    if (confirmRow !== inv.row) {
      setConfirmRow(inv.row);
      onToast('Натисніть ще раз, щоб прибрати рахунок');
      setTimeout(() => setConfirmRow(0), 4000);
      return;
    }
    setConfirmRow(0);
    try {
      await api.invoiceDelete(inv.row);
      onToast('Рахунок прибрано, файл у кошику Диска');
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прибрати', true);
    }
  }

  async function unlink(inv: ExecInvoice) {
    try {
      const res = await api.invoiceUnlink(inv.row);
      onToast(`Відв'язано, знято з ${res.cleared} позицій`);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відв\'язати', true);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 lg:px-5 py-3 max-w-[1180px] mx-auto">

        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
            <Receipt size={16} />
          </span>
          <p className="font-extrabold text-[14px] flex-1">Рахунки виконавців</p>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={pickFile} />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-white press"
            style={{ background: 'var(--accent)' }}>
            <Plus size={14} /> Додати рахунок
          </button>
        </div>

        <StampStrip className="mb-3" cells={[
          { k: 'Вільних', v: String(free.length), hot: free.length > 0 },
          { k: 'На суму', v: freeSum ? `${money(freeSum)} грн` : '—' },
          { k: 'Прив’язаних', v: String(linked.length) },
        ]} />

        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-blue-50/60">
          <Share2 size={14} className="flex-shrink-0 text-blue-600" />
          <p className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
            Рахунок можна не зберігати вручну: у месенджері натисніть «Поділитися» і виберіть ERP —
            файл прилетить сюди сам. Працює для встановленого додатка.
          </p>
        </div>

        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[#F1F2F4] w-fit mb-3">
          {([['free', `Вільні · ${free.length}`], ['linked', `Прив'язані · ${linked.length}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
              style={tab === k
                ? { background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(16,24,40,.08)' }
                : { color: 'var(--ink-3)' }}>
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--ink-3)' }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {!loading && !shown.length && (
          <div className="text-center py-16">
            <FileText size={30} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[13px] font-bold">
              {tab === 'free' ? 'Вільних рахунків немає' : 'Прив\'язаних рахунків немає'}
            </p>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
              {tab === 'free'
                ? 'Поділіться рахунком із месенджера або додайте файл кнопкою вгорі'
                : 'Прив\'яжіть вільний рахунок до позицій — і він з\'явиться тут'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {shown.map(inv => {
            const isFree = String(inv['8'] || '').trim() === FREE;
            return (
              <div key={inv.row} className="rounded-2xl ring-1 ring-gray-200/70 bg-white p-3">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: isFree ? '#FEF3C7' : '#ECFDF5', color: isFree ? '#92400E' : '#047857' }}>
                    <Receipt size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-bold">
                        {String(inv['1'] || '').trim() || 'без номера'}
                      </span>
                      {!!String(inv['3'] || '').trim() && (
                        <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>{inv['3']}</span>
                      )}
                      {!!money(inv['4']) && (
                        <span className="text-[12.5px] font-bold tabular-nums" style={{ color: '#047857' }}>
                          {money(inv['4'])} грн
                        </span>
                      )}
                      {!isFree && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                          {inv['7'] || 'прив\'язаний'} · {inv['10']} поз.
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>
                      {String(inv['2'] || '') && `${inv['2']} · `}
                      {inv['5']}
                      {String(inv['11'] || '') && ` · додано ${inv['11']}`}
                    </p>
                    {!isFree && !!String(inv['9'] || '').trim() && (
                      <p className="text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}
                        title={String(inv['9'])}>
                        позиції: {inv['9']}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!!inv.url && (
                      <a href={String(inv.url)} target="_blank" rel="noreferrer"
                        className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} title="Відкрити файл">
                        <ExternalLink size={15} />
                      </a>
                    )}
                    {isFree ? (
                      <>
                        <button onClick={() => remove(inv)}
                          className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }}
                          title="Прибрати рахунок (файл — у кошик Диска)">
                          <Trash2 size={14} />
                        </button>
                        <button onClick={() => setLinking(inv)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          <Link2 size={13} /> Прив'язати
                        </button>
                      </>
                    ) : (
                      <button onClick={() => unlink(inv)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                        style={{ color: 'var(--ink-3)' }} title="Зняти прив'язку з позицій">
                        <Unlink size={13} /> Відв'язати
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adding && (
        <AddInvoiceSheet file={adding} onToast={onToast}
          onClose={() => setAdding(null)}
          onSaved={() => { setAdding(null); load(); }} />
      )}

      {linking && (
        <LinkInvoiceSheet invoice={linking} onToast={onToast}
          onOpenOrder={onOpenOrder}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); load(); }} />
      )}
    </div>
  );
}

/** Форма нового рахунка: файл уже є, лишається підписати його. */
function AddInvoiceSheet({ file, onToast, onClose, onSaved }: {
  file: SharedFile;
  onToast: (m: string, e?: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('uk-UA'));
  const [contractor, setContractor] = useState('');
  const [sum, setSum] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    api.contractors().then(d => setNames(d.rows.map(r => r.name).filter(Boolean)))
      .catch(() => { /* список необов'язковий */ });
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api.invoiceAdd({
        base64: file.base64, mime: file.mime, fileName: file.name,
        number, date, contractor, sum, note,
      });
      onToast('💾 Рахунок додано — він у вільних');
      onSaved();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[520px] max-h-[94dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Receipt size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Новий рахунок</p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {file.name} · {Math.round(file.size / 1024)} КБ
            </p>
          </div>
          {!busy && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <Field label="Номер рахунка" value={number} onChange={setNumber} placeholder="СФ-1024" />
          <Field label="Дата" value={date} onChange={setDate} placeholder="14.08.2026" />
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>Контрагент</p>
            <input value={contractor} onChange={e => setContractor(e.target.value)} list="erp-contractors"
              placeholder="хто виставив"
              className="k-input w-full px-3 py-2 rounded-xl outline-none text-[13px]" />
            <datalist id="erp-contractors">
              {names.map((n, i) => <option key={`${n}:${i}`} value={n} />)}
            </datalist>
          </div>
          <Field label="Сума, грн" value={sum} onChange={setSum} placeholder="12500" />
          <Field label="Примітка" value={note} onChange={setNote} placeholder="за що" />
        </div>

        <div className="flex-shrink-0 p-3 border-t hairline">
          <button onClick={save} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-[13px] text-white press disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {busy ? 'Зберігаю…' : 'Зберегти рахунок'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="k-input w-full px-3 py-2 rounded-xl outline-none text-[13px]" />
    </div>
  );
}

/** Прив'язка: замовлення → позиції, за які прийшов цей рахунок. */
function LinkInvoiceSheet({ invoice, onToast, onClose, onLinked }: {
  invoice: ExecInvoice;
  onToast: (m: string, e?: boolean) => void;
  onOpenOrder: (headerRow: number, row?: number) => void;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const contractor = String(invoice['3'] || '').trim();

  useEffect(() => {
    api.getOrders().then(d => setOrders(d.orders)).catch(() => { /* список не критичний */ });
  }, []);

  async function openOrder(o: Order) {
    setOrder(o);
    setSel(new Set());
    setLoading(true);
    try {
      const d = await api.getOrder(o.headerRow);
      setItems(d.items.filter(i => !i.group));
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відкрити замовлення', true);
    } finally {
      setLoading(false);
    }
  }

  /** Спершу позиції цього виконавця — рахунок майже завжди від нього. */
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = items.filter(i =>
      !query || [i.name, i.id, i.op, i.executor].join(' ').toLowerCase().includes(query));
    if (!contractor) return list;
    const mine = (i: OrderItem) => String(i.executor || '').toLowerCase().includes(contractor.toLowerCase());
    return [...list.filter(mine), ...list.filter(i => !mine(i))];
  }, [items, q, contractor]);

  const sum = useMemo(() => items
    .filter(i => sel.has(i.row))
    .reduce((s, i) => s + (parseFloat(String(i.execSum || '').replace(/\s/g, '').replace(',', '.')) || 0), 0), [items, sel]);

  async function link() {
    if (!sel.size) { onToast('Виберіть позиції', true); return; }
    setBusy(true);
    try {
      const res = await api.invoiceLink(invoice.row, [...sel]);
      onToast(`🔗 Рахунок прив'язано до ${res.linked} позицій`);
      onLinked();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося прив\'язати', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[900px] max-h-[94dvh] lg:h-[88vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Link2 size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">
              Прив'язати рахунок {String(invoice['1'] || '')}
            </p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {contractor || 'контрагент не вказаний'}
              {money(invoice['4']) && ` · ${money(invoice['4'])} грн`}
            </p>
          </div>
          {!busy && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="lg:w-[280px] flex-shrink-0 lg:border-r hairline flex flex-col min-h-0">
            <p className="flex-shrink-0 px-3 py-2 text-[12px] font-bold border-b hairline">Замовлення</p>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {orders.map(o => (
                <button key={o.headerRow} onClick={() => openOrder(o)}
                  className="w-full px-2.5 py-2 rounded-xl text-left press"
                  style={order?.headerRow === o.headerRow
                    ? { background: 'var(--accent-soft)' } : { background: '#FAFBFC' }}>
                  <span className="block text-[12px] font-semibold truncate">{o.orderNum || o.projectId}</span>
                  <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                    {o.client || 'клієнт не вказаний'} · {o.total} поз.
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!order && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <FileText size={28} className="text-gray-300" />
                <p className="text-[13px] font-bold">Виберіть замовлення</p>
                <p className="text-[11.5px] max-w-[380px]" style={{ color: 'var(--ink-3)' }}>
                  Далі відмітьте позиції, за які прийшов цей рахунок. Номер посиланням
                  ляже в їхню колонку «Номер рахунка виконавця».
                </p>
              </div>
            )}

            {order && (
              <>
                <div className="flex-shrink-0 px-3 py-2 border-b hairline flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук позиції…"
                      className="k-input w-full pl-7 pr-2 py-1.5 rounded-xl outline-none text-[12px]" />
                  </div>
                  <button onClick={() => setSel(sel.size === shown.length ? new Set() : new Set(shown.map(i => i.row)))}
                    className="text-[11.5px] font-bold px-2 py-1.5 rounded-xl press" style={{ color: 'var(--accent)' }}>
                    {sel.size === shown.length && shown.length ? 'Зняти' : 'Вибрати все'}
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {loading && (
                    <div className="flex items-center justify-center py-10" style={{ color: 'var(--ink-3)' }}>
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  )}
                  {!loading && shown.map(i => {
                    const on = sel.has(i.row);
                    const had = String(i.execInvoice || '').trim();
                    return (
                      <button key={i.row}
                        onClick={() => setSel(p => { const n = new Set(p); n.has(i.row) ? n.delete(i.row) : n.add(i.row); return n; })}
                        className="w-full flex items-center gap-2 px-3 py-1.5 border-b hairline text-left press"
                        style={on ? { background: 'var(--accent-soft)' } : undefined}>
                        <span className="w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center ring-1"
                          style={on
                            ? { background: 'var(--accent)', color: '#fff', boxShadow: 'none' }
                            : { borderColor: '#e5e7eb' }}>
                          {on && <Check size={11} />}
                        </span>
                        <span className="text-[10.5px] font-mono w-[92px] flex-shrink-0 truncate" style={{ color: 'var(--ink-3)' }}>
                          {i.id}
                        </span>
                        <span className="text-[12px] truncate flex-1 min-w-0">{i.name}</span>
                        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{i.op}</span>
                        <span className="text-[11px] w-[110px] flex-shrink-0 truncate text-right" style={{ color: 'var(--ink-2)' }}>
                          {i.executor}
                        </span>
                        {had && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 flex-shrink-0"
                            title="Уже має рахунок — прив'язка перезапише">
                            {had}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex-shrink-0 p-2.5 border-t hairline flex items-center gap-2">
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    вибрано {sel.size}
                    {sum ? ` · на ${money(sum)} грн за таблицею` : ''}
                  </span>
                  <button onClick={link} disabled={busy || !sel.size}
                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-white press disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Прив'язати
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
