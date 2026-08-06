// ================================================================
//  src/pages/OrderPage.tsx
//  Картка замовлення: шапка зі статусом (редагується), позиції
//  з підгрупами за типом файлу, статус рядка, посилання на креслення.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, RefreshCw, FolderOpen, FileText, Ruler, Box, Paperclip,
  ExternalLink, User, Search,
} from 'lucide-react';
import StatusPicker from '../components/StatusPicker';
import ItemsTable from '../components/ItemsTable';
import { OrderDetail, OrderItem, Lists, statusStyle, fileKind } from '../types';

interface Props {
  detail: OrderDetail;
  orderStatusList: string[];
  rowStatusList: string[];
  lists: Lists | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSetOrderStatus: (s: string) => void;
  onSetRowStatus: (row: number, s: string) => void;
  onUpdateRow: (row: number, field: string, value: string) => Promise<void>;
}

const GROUP_META = {
  pdf:   { label: 'Креслення (PDF)',    icon: FileText,  color: '#0D47A1', bg: '#E3F2FD' },
  dxf:   { label: 'Файли різу (DXF)',   icon: Ruler,     color: '#E65100', bg: '#FFF3E0' },
  '3d':  { label: '3D-моделі',          icon: Box,       color: '#1B5E20', bg: '#E8F5E9' },
  other: { label: 'Інші позиції',       icon: Paperclip, color: '#455A64', bg: '#F5F5F5' },
} as const;

const PAGE = 40; // позицій на групу за раз — великі замовлення (400+) не вішають телефон

export default function OrderPage({
  detail, orderStatusList, rowStatusList, lists, loading,
  onBack, onRefresh, onSetOrderStatus, onSetRowStatus, onUpdateRow,
}: Props) {
  const [q, setQ] = useState('');
  const [pickOrder, setPickOrder] = useState(false);
  const [pickRow, setPickRow] = useState<OrderItem | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  // На широкому екрані за замовчуванням таблиця, на телефоні — картки
  const [view, setView] = useState<'cards' | 'table'>(
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'table' : 'cards'
  );

  const { header, items } = detail;
  const st = statusStyle(header.status);

  // Новий пошук або інше замовлення — показуємо знову з першої сторінки
  useEffect(() => { setLimits({}); }, [q, header.headerRow]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(i =>
      [i.name, i.op, i.executor, i.material, i.note, i.assembly].join(' ').toLowerCase().includes(query)
    );
  }, [items, q]);

  const groups = useMemo(() => {
    const acc: Record<string, OrderItem[]> = { pdf: [], dxf: [], '3d': [], other: [] };
    filtered.forEach(i => { if (!i.group) acc[fileKind(i.name)].push(i); });
    return acc;
  }, [filtered]);

  const done = items.filter(i => !i.group && String(i.rowStatus).includes('Готово')).length;
  const total = items.filter(i => !i.group).length;

  const pct = total > 0 ? Math.round((100 * done) / total) : 0;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Шапка замовлення — світла, мінімалістична */}
      <div className="flex-shrink-0 bg-white border-b hairline">
        <div className="flex items-center gap-1 px-2 pt-2">
          <button onClick={onBack} className="p-1.5 press rounded-xl" style={{ color: 'var(--accent)' }} aria-label="Назад">
            <ChevronLeft size={24} strokeWidth={2.2} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-[17px] truncate leading-tight tracking-tight">
              {header.orderNum || header.projectId || 'Замовлення'}
            </h1>
            <p className="text-[12px] truncate flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
              <User size={11} /> {header.client || '—'}
            </p>
          </div>
          {header.folderUrl && (
            <a href={header.folderUrl} target="_blank" rel="noreferrer"
              className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Папка">
              <FolderOpen size={18} />
            </a>
          )}
          <button onClick={onRefresh} className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-2 flex-wrap">
          <button onClick={() => setPickOrder(true)}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold press"
            style={{ background: st.bg, color: st.fg }}>
            {header.status || 'без статусу'} ▾
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full grow-x" style={{ width: `${pct}%`, background: st.solid }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
              {done}/{total}
            </span>
          </div>

          {/* Перемикач вигляду: картки / таблиця */}
          <div className="flex bg-gray-100 rounded-full p-0.5">
            {(['cards', 'table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                style={view === v ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-3)' }}>
                {v === 'cards' ? 'Картки' : 'Таблиця'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex-1 min-h-0 bg-white">
          <ItemsTable
            items={filtered.filter(i => !i.group)}
            lists={lists}
            onSave={(row, field, value) => onUpdateRow(row, field, value)}
          />
        </div>
      ) : (
      <>
      {/* Пошук по позиціях */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Пошук деталі, операції, виконавця…"
            className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[13px]"
          />
        </div>
      </div>

      {/* Позиції */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {total === 0 && (
          <p className="text-center text-gray-400 text-[13px] py-14">У замовленні немає позицій</p>
        )}

        {(Object.keys(GROUP_META) as Array<keyof typeof GROUP_META>).map(key => {
          const list = groups[key];
          if (!list?.length) return null;
          const meta = GROUP_META[key];
          const Icon = meta.icon;
          return (
            <div key={key}>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 sticky top-0 z-10"
                style={{ background: meta.bg, color: meta.color }}
              >
                <Icon size={14} />
                <span className="text-[12px] font-bold">{meta.label}</span>
                <span className="ml-auto text-[11px] font-semibold opacity-70">{list.length} поз.</span>
              </div>

              <div className="space-y-2">
                {list.slice(0, limits[key] ?? PAGE).map(item => {
                  const rst = statusStyle(item.rowStatus);
                  return (
                    <div
                      key={item.row}
                      className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 cv-auto"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] font-bold text-blue-600 break-words flex items-start gap-1"
                            >
                              <span className="flex-1">{item.name}</span>
                              <ExternalLink size={12} className="mt-1 flex-shrink-0" />
                            </a>
                          ) : (
                            <p className="text-[13px] font-bold text-gray-900 break-words">{item.name}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">{item.id}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {item.op && (
                          <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                            {item.op}
                          </span>
                        )}
                        {item.qty && (
                          <span className="text-[11px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-lg tabular-nums">
                            {item.qty} шт
                          </span>
                        )}
                        {item.material && (
                          <span className="text-[11px] text-gray-500">{item.material}</span>
                        )}
                        {item.thickness && (
                          <span className="text-[11px] text-gray-500">S{item.thickness}</span>
                        )}
                      </div>

                      {(item.executor || item.note) && (
                        <div className="mt-1.5 space-y-0.5">
                          {item.executor && (
                            <p className="text-[11px] text-gray-500 flex items-center gap-1">
                              <User size={11} /> {item.executor}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] text-gray-500 break-words">📝 {item.note}</p>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => setPickRow(item)}
                        className="mt-2 w-full text-left px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold active:scale-[0.99] transition-transform"
                        style={{ background: rst.bg, color: rst.fg }}
                      >
                        {item.rowStatus || 'встановити статус'} ▾
                      </button>
                    </div>
                  );
                })}

                {list.length > (limits[key] ?? PAGE) && (
                  <button
                    onClick={() => setLimits(prev => ({ ...prev, [key]: (prev[key] ?? PAGE) + PAGE }))}
                    className="w-full py-2.5 rounded-2xl bg-white ring-1 ring-gray-200 text-[12px] font-bold text-blue-600 active:bg-gray-50"
                  >
                    Показати ще {Math.min(PAGE, list.length - (limits[key] ?? PAGE))} з {list.length - (limits[key] ?? PAGE)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {pickOrder && (
        <StatusPicker
          title="Статус замовлення"
          subtitle={header.orderNum}
          options={orderStatusList}
          current={header.status}
          onPick={s => { setPickOrder(false); onSetOrderStatus(s); }}
          onClose={() => setPickOrder(false)}
        />
      )}

      {pickRow && (
        <StatusPicker
          title="Статус позиції"
          subtitle={pickRow.name}
          options={rowStatusList}
          current={pickRow.rowStatus}
          onPick={s => { const r = pickRow.row; setPickRow(null); onSetRowStatus(r, s); }}
          onClose={() => setPickRow(null)}
        />
      )}
    </div>
  );
}
