// ================================================================
//  src/pages/OrderPage.tsx
//  Картка замовлення: шапка зі статусом (редагується), позиції
//  з підгрупами за типом файлу, статус рядка, посилання на креслення.
// ================================================================

import { useMemo, useState } from 'react';
import {
  ChevronLeft, RefreshCw, FolderOpen, FileText, Ruler, Box, Paperclip,
  ExternalLink, User, Search,
} from 'lucide-react';
import StatusPicker from '../components/StatusPicker';
import { OrderDetail, OrderItem, statusStyle, fileKind } from '../types';

interface Props {
  detail: OrderDetail;
  orderStatusList: string[];
  rowStatusList: string[];
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSetOrderStatus: (s: string) => void;
  onSetRowStatus: (row: number, s: string) => void;
}

const GROUP_META = {
  pdf:   { label: 'Креслення (PDF)',    icon: FileText,  color: '#0D47A1', bg: '#E3F2FD' },
  dxf:   { label: 'Файли різу (DXF)',   icon: Ruler,     color: '#E65100', bg: '#FFF3E0' },
  '3d':  { label: '3D-моделі',          icon: Box,       color: '#1B5E20', bg: '#E8F5E9' },
  other: { label: 'Інші позиції',       icon: Paperclip, color: '#455A64', bg: '#F5F5F5' },
} as const;

export default function OrderPage({
  detail, orderStatusList, rowStatusList, loading,
  onBack, onRefresh, onSetOrderStatus, onSetRowStatus,
}: Props) {
  const [q, setQ] = useState('');
  const [pickOrder, setPickOrder] = useState(false);
  const [pickRow, setPickRow] = useState<OrderItem | null>(null);

  const { header, items } = detail;
  const st = statusStyle(header.status);

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

  return (
    <div className="flex flex-col h-full">
      {/* Шапка замовлення */}
      <div className="flex-shrink-0" style={{ background: st.solid }}>
        <div className="flex items-center gap-1 px-2 py-2">
          <button onClick={onBack} className="p-1 text-white/90 active:scale-90 transition-transform" aria-label="Назад">
            <ChevronLeft size={26} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-[15px] truncate">
              {header.orderNum || header.projectId || 'Замовлення'}
            </h1>
            <p className="text-white/80 text-[11px] truncate flex items-center gap-1">
              <User size={11} /> {header.client || '—'}
            </p>
          </div>
          <button onClick={onRefresh} className="p-2 text-white/90 active:scale-90 transition-transform" aria-label="Оновити">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPickOrder(true)}
            className="bg-white/95 px-3 py-1.5 rounded-xl text-[12px] font-bold active:scale-95 transition-transform"
            style={{ color: st.fg }}
          >
            {header.status || 'без статусу'} ▾
          </button>
          <span className="text-white/90 text-[11px] font-semibold">
            Готово {done} з {total}
          </span>
          {header.folderUrl && (
            <a
              href={header.folderUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 bg-white/20 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
            >
              <FolderOpen size={13} /> Папка
            </a>
          )}
        </div>
      </div>

      {/* Пошук по позиціях */}
      <div className="px-3 py-2 bg-gray-50">
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
                {list.map(item => {
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
              </div>
            </div>
          );
        })}
      </div>

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
