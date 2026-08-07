// ================================================================
//  src/components/BillingSheet.tsx — 🧾 Рахунки і оплати замовлення:
//  видно, які позиції в якому рахунку, що оплачено, а на що ще не
//  виставлено. Звідси ж створюються рахунок / видаткова / акт
//  (з попереднім переглядом) і змінюється статус оплати рахунку.
// ================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Receipt, Loader2, ExternalLink, FileText, CheckCircle2, Banknote,
} from 'lucide-react';
import { api } from '../api';
import { OrderDetail, BillingData, BillingItem, DocType } from '../types';
import CommerceCreateSheet from './CommerceCreateSheet';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onChanged: () => void; // оновити замовлення після створення документа
  createSignal?: number; // сайдбар «Рахунок клієнту» → одразу відкрити створення
}

const PAY_DONE = 'Оплачено';

export default function BillingSheet({ detail, onClose, onToast, onChanged, createSignal }: Props) {
  const [data, setData] = useState<BillingData | null>(null);
  const [busy, setBusy] = useState('');
  const [create, setCreate] = useState<{ docType: DocType; rows?: number[] } | null>(null);

  const load = useCallback(() => {
    api.billing(detail.header.headerRow)
      .then(setData)
      .catch(e => { onToast(e?.message || 'Не вдалося прочитати оплати', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.header.headerRow]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (createSignal) setCreate({ docType: 'invoice' }); }, [createSignal]);

  // Групи: по номеру рахунку + "без рахунку"
  const groups = useMemo(() => {
    const byInv = new Map<string, BillingItem[]>();
    const noInv: BillingItem[] = [];
    for (const it of data?.items || []) {
      if (it.invoiceNum) {
        const arr = byInv.get(it.invoiceNum) || [];
        arr.push(it);
        byInv.set(it.invoiceNum, arr);
      } else {
        noInv.push(it);
      }
    }
    return { byInv: [...byInv.entries()], noInv };
  }, [data]);

  function money(v: string | number): string {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
    return n ? n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }
  function groupSum(items: BillingItem[]): number {
    return items.reduce((s, it) => s + (parseFloat(String(it.sum).replace(/\s/g, '').replace(',', '.')) || 0), 0);
  }

  /** Позначити всі позиції рахунку оплаченими / зняти оплату. */
  async function togglePaid(invNum: string, items: BillingItem[]) {
    const allPaid = items.every(i => i.payStatus.includes(PAY_DONE));
    const next = allPaid ? 'Рахунок виставлено' : PAY_DONE;
    setBusy(invNum);
    try {
      await api.bulkUpdate(items.map(i => i.row), { payStatus: next });
      onToast(allPaid ? `Оплату знято з №${invNum}` : `Рахунок №${invNum} оплачено ✅`);
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося оновити', true);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative w-full lg:w-[680px] max-h-[94dvh] lg:max-h-[88vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Receipt size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Рахунки і оплати</p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {data?.client ? ` · ${data.client}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        {!data && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
        )}

        {data && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {/* Рахунки */}
            {groups.byInv.map(([num, items]) => {
              const paid = items.every(i => i.payStatus.includes(PAY_DONE));
              const partly = !paid && items.some(i => i.payStatus.includes(PAY_DONE));
              const url = items.find(i => i.invoiceUrl)?.invoiceUrl;
              const waybill = items.find(i => i.waybillNum);
              return (
                <div key={num} className="rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap"
                    style={{ background: paid ? '#ECFDF5' : partly ? '#FFFBEB' : '#F8FAFC' }}>
                    <FileText size={15} className={paid ? 'text-emerald-600' : 'text-gray-500'} />
                    <span className="font-bold text-[13.5px]">Рахунок {num}</span>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="p-1 rounded-lg press" style={{ color: 'var(--accent)' }} aria-label="Відкрити документ">
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <span className="text-[12px] font-bold tabular-nums ml-auto">{money(groupSum(items))} грн</span>
                    <button onClick={() => togglePaid(num, items)} disabled={busy === num}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold press disabled:opacity-50"
                      style={paid
                        ? { background: '#059669', color: '#fff' }
                        : { background: '#fff', color: '#059669', boxShadow: 'inset 0 0 0 1px #A7F3D0' }}>
                      {busy === num ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      {paid ? 'Оплачено' : 'Позначити оплаченим'}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(it => (
                      <div key={it.row} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                        <span className="flex-1 truncate">{it.name}</span>
                        <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                          {it.assignedQty || it.qty} шт × {money(it.price)}
                        </span>
                        <span className="font-semibold tabular-nums w-[84px] text-right flex-shrink-0">{money(it.sum)}</span>
                      </div>
                    ))}
                  </div>
                  {waybill && (
                    <div className="px-3 py-1.5 border-t hairline text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                      📋 Видаткова {waybill.waybillNum}
                      {waybill.waybillUrl && (
                        <a href={waybill.waybillUrl} target="_blank" rel="noreferrer" className="press" style={{ color: 'var(--accent)' }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Без рахунку */}
            {groups.noInv.length > 0 && (
              <div className="rounded-2xl ring-1 ring-amber-200/80 overflow-hidden">
                <div className="px-3 py-2.5 bg-amber-50 flex items-center gap-2">
                  <Banknote size={15} className="text-amber-600" />
                  <span className="font-bold text-[13.5px] text-amber-900">Без рахунку · {groups.noInv.length} поз.</span>
                  <button onClick={() => setCreate({ docType: 'invoice', rows: groups.noInv.map(i => i.row) })}
                    className="ml-auto px-3 py-1.5 rounded-xl text-[11.5px] font-bold text-white press"
                    style={{ background: 'var(--accent)' }}>
                    🧾 Виставити рахунок
                  </button>
                </div>
                <div className="divide-y divide-gray-50 max-h-[240px] overflow-y-auto">
                  {groups.noInv.map(it => (
                    <div key={it.row} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                      <span className="flex-1 truncate">{it.name}</span>
                      {it.payStatus && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
                          {it.payStatus}
                        </span>
                      )}
                      <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                        {it.assignedQty || it.qty} шт{parseFloat(it.price) ? ` × ${money(it.price)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!data.items.length && (
              <p className="text-center text-[12.5px] py-10" style={{ color: 'var(--ink-3)' }}>
                У картці немає позицій
              </p>
            )}
          </div>
        )}

        {/* Кнопки створення документів */}
        {data && (
          <div className="flex-shrink-0 p-3 border-t hairline grid grid-cols-3 gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={() => setCreate({ docType: 'invoice' })}
              className="py-2.5 rounded-2xl font-bold text-[12px] text-white press" style={{ background: 'var(--accent)' }}>
              🧾 Рахунок
            </button>
            <button onClick={() => setCreate({ docType: 'salesInvoice' })}
              className="py-2.5 rounded-2xl font-bold text-[12px] press border" style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
              📋 Видаткова
            </button>
            <button onClick={() => setCreate({ docType: 'act' })}
              className="py-2.5 rounded-2xl font-bold text-[12px] press border" style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
              📄 Акт
            </button>
          </div>
        )}
      </div>

      {create && (
        <CommerceCreateSheet
          detail={detail}
          docType={create.docType}
          preselectRows={create.rows}
          onClose={() => setCreate(null)}
          onToast={onToast}
          onCreated={() => { setCreate(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}
