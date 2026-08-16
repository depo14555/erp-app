// ================================================================
//  src/pages/BillingOverviewPage.tsx — 💰 панель бухгалтерії:
//  загальна картина по всіх замовленнях — які рахунки виставлені
//  (оплачені/ні), на що ще треба виставити, підсумки; швидкий
//  доступ до документів і до шаблонів рахунку/видаткової/акта.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, ExternalLink, FileText, Banknote, CheckCircle2, Receipt, FileCog,
} from 'lucide-react';
import { api } from '../api';
import StampStrip from '../components/StampStrip';
import { BillingOverview } from '../types';

interface Props {
  onOpenOrder: (headerRow: number) => void;
  onToast: (msg: string, err?: boolean) => void;
  refreshSignal?: number;
}

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillingOverviewPage({ onOpenOrder, onToast, refreshSignal }: Props) {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPaid, setShowPaid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.billingOverview());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зібрати зведення', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  const unpaid = data?.invoices.filter(i => !i.paid) ?? [];
  const paid = data?.invoices.filter(i => i.paid) ?? [];

  return (
    <div className="flex flex-col h-full">
      {!data && (
        <div className="py-14 flex justify-center"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto px-3 lg:px-5 py-3">
          <div className="max-w-[1100px] mx-auto w-full space-y-4">

            {/* Підсумки — штамп на всю ширину */}
            <StampStrip cells={[
              { k: 'Очікує оплати', v: `${money(data.totals.unpaidSum)} грн`,
                sub: `${unpaid.length} рахунків`, hot: data.totals.unpaidSum > 0 },
              { k: 'Треба виставити', v: `${data.totals.toInvoiceCount} поз.`,
                sub: `у ${data.toInvoice.length} замовленнях`, hot: data.totals.toInvoiceCount > 0 },
              { k: 'Оплачено', v: `${money(data.totals.paidSum)} грн`, sub: `${paid.length} рахунків` },
            ]} />

            {/* Треба виставити */}
            {data.toInvoice.length > 0 && (
              <section>
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Banknote size={14} /></span>
                  <h2 className="text-[13px] font-bold">Треба виставити рахунок</h2>
                </div>
                <div className="space-y-1.5">
                  {data.toInvoice.map(t => (
                    <button key={t.headerRow} onClick={() => onOpenOrder(t.headerRow)}
                      className="w-full bg-white rounded-2xl ring-1 ring-amber-200/70 p-3 text-left press flex items-center gap-2.5">
                      <Receipt size={16} className="text-amber-600 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-[13.5px] truncate">{t.orderNum || '—'}{t.client ? ` · ${t.client}` : ''}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>
                          {t.count} поз. з ціною без рахунку{t.sum ? ` · ~${money(t.sum)} грн` : ''}
                        </span>
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl text-white flex-shrink-0" style={{ background: 'var(--accent)' }}>
                        🧾 відкрити
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Неоплачені рахунки */}
            <section>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><FileText size={14} /></span>
                <h2 className="text-[13px] font-bold flex-1">Очікують оплати</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 tabular-nums">{unpaid.length}</span>
              </div>
              {unpaid.length === 0 && (
                <p className="text-[12.5px] px-2 py-4 text-center rounded-2xl bg-white ring-1 ring-gray-200/60" style={{ color: 'var(--ink-3)' }}>
                  Всі виставлені рахунки оплачені 🎉
                </p>
              )}
              <div className="space-y-1.5">
                {unpaid.map(inv => (
                  <div key={inv.num + inv.headerRow} className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 flex items-center gap-2.5">
                    <FileText size={16} className="text-gray-500 flex-shrink-0" />
                    <button onClick={() => onOpenOrder(inv.headerRow)} className="min-w-0 flex-1 text-left press">
                      <span className="block font-bold text-[13.5px] truncate">
                        Рахунок {inv.num} · {inv.orderNum || '—'}{inv.client ? ` · ${inv.client}` : ''}
                      </span>
                      <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {inv.items} поз.{inv.paidItems ? ` · оплачено ${inv.paidItems}/${inv.items}` : ''}
                      </span>
                    </button>
                    <span className="text-[13px] font-bold tabular-nums flex-shrink-0">{money(inv.sum)} грн</span>
                    {inv.url && (
                      <a href={inv.url} target="_blank" rel="noreferrer"
                        className="p-2 rounded-xl press flex-shrink-0" style={{ color: 'var(--accent)' }} aria-label="Відкрити документ">
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Оплачені (згорнуто) */}
            <section>
              <button onClick={() => setShowPaid(v => !v)} className="flex items-center gap-2 px-1 mb-2 press rounded-xl w-full text-left">
                <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 size={14} /></span>
                <h2 className="text-[13px] font-bold flex-1">Оплачені</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 tabular-nums">{paid.length}</span>
                <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{showPaid ? 'згорнути ▴' : 'показати ▾'}</span>
              </button>
              {showPaid && (
                <div className="space-y-1.5">
                  {paid.map(inv => (
                    <div key={inv.num + inv.headerRow} className="bg-emerald-50/50 rounded-2xl ring-1 ring-emerald-100 p-2.5 flex items-center gap-2.5">
                      <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                      <button onClick={() => onOpenOrder(inv.headerRow)} className="min-w-0 flex-1 text-left press">
                        <span className="block text-[12.5px] font-semibold truncate">
                          {inv.num} · {inv.orderNum}{inv.client ? ` · ${inv.client}` : ''}
                        </span>
                      </button>
                      <span className="text-[12px] font-bold tabular-nums flex-shrink-0 text-emerald-700">{money(inv.sum)} грн</span>
                      {inv.url && (
                        <a href={inv.url} target="_blank" rel="noreferrer" className="p-1.5 press flex-shrink-0 text-emerald-700" aria-label="Відкрити документ">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Шаблони документів */}
            <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <FileCog size={15} style={{ color: 'var(--ink-2)' }} />
                <h2 className="text-[13px] font-bold">Шаблони документів</h2>
                <span className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>— відкрити й підправити Google Doc</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['invoice', '🧾 Рахунок'], ['salesInvoice', '📋 Видаткова'], ['act', '📄 Акт']] as const).map(([k, label]) => (
                  data.templates[k]
                    ? <a key={k} href={data.templates[k]} target="_blank" rel="noreferrer"
                        className="py-2.5 rounded-xl text-[12px] font-bold press text-center border inline-flex items-center justify-center gap-1.5"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                        {label} <ExternalLink size={12} />
                      </a>
                    : null
                ))}
              </div>
            </section>

            {loading && <p className="text-center text-[11px]" style={{ color: 'var(--ink-3)' }}>оновлюю…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
