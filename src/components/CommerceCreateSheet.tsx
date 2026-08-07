// ================================================================
//  src/components/CommerceCreateSheet.tsx — створення рахунку /
//  видаткової / акта, як у таблиці, але з ЖИВИМ ПРЕВ'Ю: праворуч
//  видно документ таким, яким він буде, і все коригується перед
//  збереженням (клієнт, позиції, кількості, ціни).
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ExternalLink, CheckSquare, Square } from 'lucide-react';
import { api } from '../api';
import { OrderDetail, CommerceContext, CommerceResult, DocType } from '../types';

interface Props {
  detail: OrderDetail;
  docType: DocType;
  preselectRows?: number[];
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onCreated: () => void;
}

const TITLES: Record<DocType, string> = {
  invoice: '🧾 Рахунок клієнту',
  salesInvoice: '📋 Видаткова накладна',
  act: '📄 Акт наданих послуг',
};
const DOC_HEAD: Record<DocType, string> = {
  invoice: 'РАХУНОК-ФАКТУРА',
  salesInvoice: 'ВИДАТКОВА НАКЛАДНА',
  act: 'АКТ наданих послуг',
};

interface Line {
  row: number;
  name: string;
  qty: string;
  price: string;
  on: boolean;
}

type Phase = 'load' | 'edit' | 'work' | 'done';

export default function CommerceCreateSheet({ detail, docType, preselectRows, onClose, onToast, onCreated }: Props) {
  const [phase, setPhase] = useState<Phase>('load');
  const [ctx, setCtx] = useState<CommerceContext | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [clientName, setClientName] = useState('');
  const [clientEdrpou, setClientEdrpou] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [result, setResult] = useState<CommerceResult | null>(null);

  useEffect(() => {
    api.commerceContext(detail.header.headerRow, docType)
      .then(c => {
        setCtx(c);
        setClientName(c.client.name || detail.header.client || '');
        setClientEdrpou(c.client.edrpou || '');
        setClientAddress(c.client.address || '');
        const pre = new Set(preselectRows || []);
        setLines(c.items.map(it => ({
          row: it.row,
          name: it.name,
          qty: String(it.qty || ''),
          price: it.clientPrice ? String(it.clientPrice) : '',
          on: pre.size ? pre.has(it.row) : it.preselected,
        })));
        setPhase('edit');
      })
      .catch(e => { onToast(e?.message || 'Не вдалося зібрати дані', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = lines.filter(l => l.on);
  const total = useMemo(() => chosen.reduce((s, l) =>
    s + (parseFloat(l.price.replace(',', '.')) || 0) * (parseFloat(l.qty.replace(',', '.')) || 0), 0), [chosen]);

  function patch(row: number, p: Partial<Line>) {
    setLines(prev => prev.map(l => (l.row === row ? { ...l, ...p } : l)));
  }
  function money(n: number): string {
    return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function createDoc() {
    if (!chosen.length) { onToast('Виберіть позиції', true); return; }
    if (chosen.some(l => !(parseFloat(l.price.replace(',', '.')) > 0))) {
      onToast('У всіх вибраних позицій має бути ціна', true);
      return;
    }
    setPhase('work');
    try {
      const res = await api.commerceCreate({
        docType,
        projectId: ctx?.projectId || detail.header.projectId,
        clientName, clientEdrpou, clientAddress,
        items: chosen.map(l => ({
          row: l.row, name: l.name, unit: 'шт',
          qty: parseFloat(l.qty.replace(',', '.')) || 0,
          price: parseFloat(l.price.replace(',', '.')) || 0,
        })),
      });
      setResult(res);
      setPhase('done');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося створити документ', true);
      setPhase('edit');
    }
  }

  const today = new Date().toLocaleDateString('uk-UA');

  return (
    <div className="fixed inset-0 z-[85] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className={`relative w-full ${phase === 'edit' ? 'lg:w-[1100px]' : 'lg:w-[520px]'} max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden`}>

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">{TITLES[docType]}</p>
            <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId} · попередній вигляд праворуч, усе можна коригувати
            </p>
          </div>
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}

        {phase === 'edit' && ctx && (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(380px,460px)_1fr]">
            {/* ЛІВА: форма */}
            <div className="flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
                {/* Клієнт */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>Клієнт</p>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Назва клієнта"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12.5px] font-semibold" />
                  <div className="flex gap-1.5">
                    <input value={clientEdrpou} onChange={e => setClientEdrpou(e.target.value)} placeholder="ЄДРПОУ"
                      className="w-[130px] px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]" />
                    <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Адреса"
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]" />
                  </div>
                </div>

                {/* Позиції */}
                <div>
                  <div className="flex items-center pb-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
                      Позиції · вибрано {chosen.length} з {lines.length}
                    </p>
                    <button
                      onClick={() => setLines(prev => (prev.some(l => !l.on)
                        ? prev.map(l => ({ ...l, on: true }))
                        : prev.map(l => ({ ...l, on: false }))))}
                      className="ml-auto text-[11px] font-bold press rounded-lg px-1" style={{ color: 'var(--accent)' }}>
                      {lines.some(l => !l.on) ? 'Вибрати всі' : 'Зняти всі'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {lines.map(l => (
                      <div key={l.row} className={`rounded-xl ring-1 px-2 py-1.5 ${l.on ? 'ring-blue-200 bg-blue-50/40' : 'ring-gray-200/60'}`}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => patch(l.row, { on: !l.on })} className="press flex-shrink-0">
                            {l.on ? <CheckSquare size={15} className="text-[var(--accent)]" /> : <Square size={15} className="text-gray-300" />}
                          </button>
                          <span className={`flex-1 text-[12px] truncate ${l.on ? 'font-semibold' : 'text-gray-400'}`}>{l.name}</span>
                          <input value={l.qty} onChange={e => patch(l.row, { qty: e.target.value.replace(/[^\d.,]/g, '') })}
                            className="w-[54px] px-1.5 py-1 rounded-lg bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[11.5px] text-right tabular-nums" />
                          <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>×</span>
                          <input value={l.price} onChange={e => patch(l.row, { price: e.target.value.replace(/[^\d.,]/g, '') })}
                            placeholder="ціна"
                            className="w-[72px] px-1.5 py-1 rounded-lg bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[11.5px] text-right tabular-nums" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button onClick={createDoc} disabled={!chosen.length}
                  className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}>
                  Створити документ · {money(total)} грн
                </button>
                <p className="text-[10.5px] text-center mt-1.5" style={{ color: 'var(--ink-3)' }}>
                  Google Doc у папці клієнта · № і посилання запишуться в картку
                </p>
              </div>
            </div>

            {/* ПРАВА: живе прев'ю документа */}
            <div className="hidden lg:block min-h-0 overflow-y-auto border-l hairline bg-gray-100 p-4">
              <div className="bg-white shadow-md rounded-sm mx-auto max-w-[640px] p-8 text-[12px] leading-relaxed" style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a' }}>
                <p className="text-center font-bold text-[15px] tracking-wide">{DOC_HEAD[docType]}</p>
                <p className="text-center text-[11px] mt-0.5">№ ___/{new Date().getFullYear()} від {today}</p>
                <div className="mt-5 space-y-1">
                  <p><span className="font-bold">Постачальник:</span> (з шаблону документа)</p>
                  <p><span className="font-bold">Покупець:</span> {clientName || '—'}
                    {clientEdrpou ? `, ЄДРПОУ ${clientEdrpou}` : ''}
                    {clientAddress ? `, ${clientAddress}` : ''}</p>
                  <p><span className="font-bold">Підстава:</span> замовлення {ctx.projectId}</p>
                </div>
                <table className="w-full mt-4 border-collapse text-[11px]">
                  <thead>
                    <tr>
                      {['№', 'Найменування', 'К-сть', 'Од.', 'Ціна', 'Сума'].map(h => (
                        <th key={h} className="border border-gray-400 px-1.5 py-1 text-left font-bold bg-gray-50">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chosen.map((l, i) => {
                      const p = parseFloat(l.price.replace(',', '.')) || 0;
                      const qn = parseFloat(l.qty.replace(',', '.')) || 0;
                      return (
                        <tr key={l.row}>
                          <td className="border border-gray-400 px-1.5 py-1 tabular-nums">{i + 1}</td>
                          <td className="border border-gray-400 px-1.5 py-1">{l.name}</td>
                          <td className="border border-gray-400 px-1.5 py-1 text-right tabular-nums">{qn || '—'}</td>
                          <td className="border border-gray-400 px-1.5 py-1">шт</td>
                          <td className="border border-gray-400 px-1.5 py-1 text-right tabular-nums">{p ? money(p) : '—'}</td>
                          <td className="border border-gray-400 px-1.5 py-1 text-right tabular-nums font-semibold">{money(p * qn)}</td>
                        </tr>
                      );
                    })}
                    {!chosen.length && (
                      <tr><td colSpan={6} className="border border-gray-400 px-2 py-4 text-center text-gray-400">
                        Виберіть позиції ліворуч
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <p className="text-right font-bold mt-3 text-[13px]">Разом: {money(total)} грн</p>
                <p className="text-right text-[10.5px] text-gray-500">сума прописом підставиться в документ автоматично</p>
                <div className="flex justify-between mt-8 text-[11px]">
                  <span>Відвантажив: ________________</span>
                  <span>Отримав: ________________</span>
                </div>
              </div>
              <p className="text-center text-[10.5px] mt-2" style={{ color: 'var(--ink-3)' }}>
                Приблизний вигляд — фінальний документ формується з вашого шаблону Google Doc
              </p>
            </div>
          </div>
        )}

        {phase === 'work' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={26} className="animate-spin text-[var(--accent)]" />
            <p className="text-[13px] font-bold">Формую документ…</p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Копія шаблону → заповнення → папка клієнта → запис у картку</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Документ №{result.docNumber} створено</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                № і посилання записані в позиції картки
              </p>
            </div>
            <div className="flex gap-2">
              <a href={result.docUrl} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press text-center inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <ExternalLink size={15} /> Відкрити документ
              </a>
              <button onClick={onCreated}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] press border"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                Готово
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
