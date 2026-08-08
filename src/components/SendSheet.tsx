// ================================================================
//  src/components/SendSheet.tsx — «Відправити виконавцю», як у
//  таблиці: рядки з призначеним виконавцем летять у ЙОГО таблицю
//  за збереженою прив'язкою колонок; наші рядки → «Відправив 🟡».
//  Прив'язка налаштовується разово в таблиці — тут лише відправка.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X, Send, Loader2, CheckSquare, Square, ExternalLink,
  AlertTriangle, ArrowDownToLine, ArrowUpToLine,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import { api } from '../api';
import { OrderDetail, ExecRowsData, ExecSendResult } from '../types';

interface Props {
  detail: OrderDetail;
  preselect?: number[];   // рядки, вибрані в таблиці позицій
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onSent: () => void;     // оновити замовлення після відправки
}

type Phase = 'load' | 'pick' | 'work' | 'done';

export default function SendSheet({ detail, preselect, onClose, onMinimize, onToast, onSent }: Props) {
  const [data, setData] = useState<ExecRowsData | null>(null);
  const [phase, setPhase] = useState<Phase>('load');
  const [exec, setExec] = useState('');
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ExecSendResult | null>(null);

  useEffect(() => {
    api.execRows(detail.header.headerRow)
      .then(d => {
        setData(d);
        // Стартовий виконавець: із передвибраних рядків або перший із прив'язкою
        const pre = new Set(preselect || []);
        const preExec = pre.size ? d.rows.find(r => pre.has(r.row))?.executor : '';
        const first = preExec || d.executors.find(e => e.hasMapping)?.name || d.executors[0]?.name || '';
        setExec(first);
        const info = d.executors.find(e => e.name === first);
        if (info) setPosition(info.position);
        // Якщо є передвибір — відправляємо лише його (решту знімаємо)
        if (pre.size) {
          setExcluded(new Set(d.rows.filter(r => r.executor === first && !pre.has(r.row)).map(r => r.row)));
        }
        setPhase('pick');
      })
      .catch(e => { onToast(e?.message || 'Не вдалося прочитати рядки', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const info = data?.executors.find(e => e.name === exec);
  const execRows = useMemo(() => (data?.rows || []).filter(r => r.executor === exec), [data, exec]);
  const selected = execRows.filter(r => !excluded.has(r.row));
  const alreadySent = selected.filter(r => r.status.includes('Відправив')).length;

  function pickExec(name: string) {
    setExec(name);
    setExcluded(new Set());
    const i = data?.executors.find(e => e.name === name);
    if (i) setPosition(i.position);
  }

  function toggle(row: number) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });
  }
  function toggleAll() {
    setExcluded(prev => (execRows.some(r => !prev.has(r.row))
      ? new Set(execRows.map(r => r.row))
      : new Set()));
  }

  async function send() {
    if (!selected.length || !info) return;
    setPhase('work');
    try {
      const res = await api.execSend(exec, selected, position);
      setResult(res);
      setPhase('done');
      onSent();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося відправити', true);
      setPhase('pick');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className="relative w-full lg:w-[560px] max-h-[92dvh] lg:max-h-[85vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Send size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Відправити виконавцю</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId} · рядки летять у таблицю виконавця
            </p>
          </div>
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}

        {phase === 'pick' && data && (
          <>
            {data.executors.length === 0 && (
              <p className="p-6 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
                У картці немає рядків із призначеним виконавцем
              </p>
            )}

            {/* Виконавці */}
            <div className="flex-shrink-0 px-4 pt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
              {data.executors.map(e => {
                const on = e.name === exec;
                return (
                  <button key={e.name} onClick={() => pickExec(e.name)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-colors"
                    style={on ? { background: 'var(--ink)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                    {e.name} · {e.count}
                    {!e.hasMapping && <AlertTriangle size={11} className={on ? 'text-amber-300' : 'text-amber-500'} />}
                  </button>
                );
              })}
            </div>

            {/* Прив'язки немає */}
            {info && !info.hasMapping && (
              <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-amber-50 text-amber-800 text-[12px] leading-relaxed flex gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>
                  Для «{exec}» ще немає прив'язки колонок. Разово налаштуйте її в таблиці:
                  <b> Пульт → 📤 Відправити виконавцю → Підключитися</b> — далі відправка працюватиме і звідси.
                </span>
              </div>
            )}
            {info && info.hasMapping && !info.hasTable && (
              <div className="mx-4 mt-2.5 p-3 rounded-2xl bg-red-50 text-red-700 text-[12px] flex gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>Не знайдено посилання на таблицю «{exec}» (Контрагенти, колонка L).</span>
              </div>
            )}

            {/* Позиція вставки */}
            {info?.hasMapping && (
              <div className="flex-shrink-0 mx-4 mt-2.5 flex bg-gray-100 rounded-2xl p-1">
                {([['bottom', 'У кінець таблиці', ArrowDownToLine], ['top', 'Одразу після шапки', ArrowUpToLine]] as const).map(([v, label, Icon]) => (
                  <button key={v} onClick={() => setPosition(v)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11.5px] font-bold transition-all"
                    style={position === v
                      ? { background: '#fff', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                      : { color: 'var(--ink-3)' }}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            )}

            {/* Рядки */}
            <div className="flex-shrink-0 px-4 pt-2.5 pb-1 flex items-center">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-[11.5px] font-bold press rounded-lg px-1 py-0.5"
                style={{ color: 'var(--accent)' }}>
                {execRows.some(r => !excluded.has(r.row)) ? <CheckSquare size={14} /> : <Square size={14} />}
                Вибрано {selected.length} з {execRows.length}
              </button>
              {alreadySent > 0 && (
                <span className="ml-auto text-[10.5px] font-semibold text-amber-600">
                  {alreadySent} вже мали «Відправив» — дублі відсіються по ID
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-0.5">
              {execRows.map(r => {
                const on = !excluded.has(r.row);
                return (
                  <button key={r.row} onClick={() => toggle(r.row)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left hover:bg-gray-50 press">
                    {on ? <CheckSquare size={15} className="flex-shrink-0 text-[var(--accent)]" />
                        : <Square size={15} className="flex-shrink-0 text-gray-300" />}
                    <span className={`flex-1 text-[12px] truncate ${on ? '' : 'text-gray-400'}`}>{r.name}</span>
                    {r.totalQty && <span className="text-[10.5px] font-semibold text-gray-400 tabular-nums flex-shrink-0">{r.totalQty} шт</span>}
                    {r.status.includes('Відправив') && <span className="text-[12px] flex-shrink-0">🟡</span>}
                  </button>
                );
              })}
            </div>

            {/* Кнопка */}
            <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={send} disabled={!selected.length || !info?.hasMapping || !info?.hasTable}
                className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                📤 Відправити «{exec}» · {selected.length} поз.
              </button>
              <p className="text-[10.5px] text-center mt-1.5" style={{ color: 'var(--ink-3)' }}>
                Після відправки нашим рядкам стане «Відправив 🟡»
              </p>
            </div>
          </>
        )}

        {phase === 'work' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            <p className="text-[13px] font-bold">Відправляю у таблицю «{exec}»…</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Відправлено {result.sent} поз. → «{exec}»</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                Статуси наших рядків оновлено на «Відправив 🟡»
              </p>
            </div>
            {result.skipped.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] leading-relaxed">
                Пропущено як дублі ({result.skipped.length}): {result.skipped.slice(0, 6).join(', ')}{result.skipped.length > 6 ? '…' : ''}
              </div>
            )}
            <div className="flex gap-2">
              <a href={result.sheetUrl} target="_blank" rel="noreferrer"
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press text-center inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <ExternalLink size={15} /> Таблиця виконавця
              </a>
              <button onClick={onClose}
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
