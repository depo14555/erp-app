// ================================================================
//  src/pages/SearchPage.tsx
//  Глобальний пошук деталі по всіх замовленнях — за назвою,
//  децимальником (префікси не заважають), операцією, виконавцем.
// ================================================================

import { useState } from 'react';
import { Search, Loader2, ChevronRight, User } from 'lucide-react';
import { api } from '../api';
import { SearchRow, statusStyle } from '../types';

interface Props {
  onOpenOrder: (headerRow: number, row?: number) => void;
  onToast: (msg: string, isError?: boolean) => void;
}

export default function SearchPage({ onOpenOrder, onToast }: Props) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) {
      onToast('Введіть щонайменше 2 символи', true);
      return;
    }
    setBusy(true);
    try {
      setRows(await api.search(query));
    } catch (err: any) {
      onToast(err?.message || 'Пошук не вдався', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={run} className="px-3 pt-3 pb-2 bg-gray-50 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Децимальник, назва, виконавець…"
            className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-4 rounded-2xl bg-blue-600 disabled:bg-gray-300 text-white font-bold text-[13px] active:scale-95 transition-transform flex items-center"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : 'Знайти'}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {rows === null && (
          <div className="text-center py-16 text-gray-400">
            <Search size={30} className="mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">Шукайте деталь по всіх замовленнях</p>
            <p className="text-[11px] mt-1">Префікси децимальника не заважають</p>
          </div>
        )}

        {rows !== null && rows.length === 0 && !busy && (
          <p className="text-center text-gray-400 text-[13px] py-16">Нічого не знайдено</p>
        )}

        {rows !== null && rows.length > 0 && (
          <p className="text-[11px] text-gray-400 px-0.5 pt-1">Знайдено: {rows.length}</p>
        )}

        {rows?.map(r => {
          const st = statusStyle(r.status);
          return (
            <button
              key={r.row}
              onClick={() => onOpenOrder(r.headerRow, r.row)}
              className="w-full text-left bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 active:scale-[0.99] transition-transform cv-auto"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 break-words">{r.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{r.id}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg"
                  style={{ background: st.bg, color: st.fg }}>
                  {r.status || 'без статусу'}
                </span>
                {r.op && (
                  <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                    {r.op}
                  </span>
                )}
                {r.qty && (
                  <span className="text-[11px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg tabular-nums">
                    {r.qty} шт
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
                <span className="font-semibold truncate">{r.orderNum}</span>
                {r.client && <span className="truncate">· {r.client}</span>}
                {r.executor && (
                  <span className="flex items-center gap-1 ml-auto flex-shrink-0">
                    <User size={11} /> {r.executor}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
