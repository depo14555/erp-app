// ================================================================
//  src/pages/OrderPage.tsx
//  Картка замовлення: шапка зі статусом (редагується), позиції
//  з підгрупами за типом файлу, статус рядка, посилання на креслення.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, RefreshCw, FolderOpen, FileText, Ruler, Box, Paperclip,
  ExternalLink, User, Search, Printer, X, Send, Tags, Rocket, Paintbrush, Receipt,
  FolderTree, Calculator,
} from 'lucide-react';
import StatusPicker from '../components/StatusPicker';
import ItemsTable, { TableMode } from '../components/ItemsTable';
import DeliverySheet from '../components/DeliverySheet';
import { api } from '../api';
import PrintSheet from '../components/PrintSheet';
import SendSheet from '../components/SendSheet';
import TechLaunchSheet from '../components/TechLaunchSheet';
import PhotoSheet from '../components/PhotoSheet';
import BillingSheet from '../components/BillingSheet';
import DistributionSheet from '../components/DistributionSheet';
import CalcSheet from '../components/CalcSheet';
import NestingSheet from '../components/NestingSheet';
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
  onBulkStatus: (rows: number[], status: string) => Promise<void>;
  onToast: (msg: string, err?: boolean) => void;
  printSignal?: number;   // сигнали з сайдбара — відкрити відповідний інструмент
  billingSignal?: number;
  techSignal?: number;
  photoSignal?: number;
  sendSignal?: number;
  distrSignal?: number;
  calcSignal?: number;
  nestSignal?: number;
}

const GROUP_META = {
  pdf:   { label: 'Креслення (PDF)',    icon: FileText,  color: '#0D47A1', bg: '#E3F2FD' },
  dxf:   { label: 'Файли різу (DXF)',   icon: Ruler,     color: '#E65100', bg: '#FFF3E0' },
  '3d':  { label: '3D-моделі',          icon: Box,       color: '#1B5E20', bg: '#E8F5E9' },
  other: { label: 'Інші позиції',       icon: Paperclip, color: '#455A64', bg: '#F5F5F5' },
} as const;

const PAGE = 40; // позицій на групу за раз — великі замовлення (400+) не вішають телефон

/** Зони таблиці позицій — під різні ролі в одному замовленні. */
const ZONES: Array<{ key: TableMode; label: string; short: string; icon: string }> = [
  { key: 'prod', label: 'Виробництво', short: 'Вироб.', icon: '🏭' },
  { key: 'calc', label: 'Прорахунок', short: 'Прорах.', icon: '🧮' },
  { key: 'buh',  label: 'Бухгалтерія', short: 'Бухг.', icon: '💰' },
  { key: 'log',  label: 'Логістика', short: 'Логіст.', icon: '🚚' },
];

/** Вікна інструментів, які можна згорнути (робота продовжується у фоні). */
type SheetKey = 'print' | 'send' | 'tech' | 'photo' | 'distr' | 'calc' | 'nest';
const SHEET_META: Record<SheetKey, { label: string; emoji: string }> = {
  print: { label: 'Друк креслень', emoji: '🖨️' },
  send:  { label: 'Відправка виконавцю', emoji: '📤' },
  tech:  { label: 'Тех.запуск', emoji: '🚀' },
  photo: { label: 'Фотошоп креслень', emoji: '🎨' },
  distr: { label: 'Розподіл КД', emoji: '📂' },
  calc:  { label: 'Прорахунок', emoji: '🧮' },
  nest:  { label: 'Розкрій DXF', emoji: '✂️' },
};

/** Відкриває вікно лише при ЗМІНІ сигналу, ігноруючи значення на монтуванні. */
function useOpenSignal(signal: number | undefined, open: () => void) {
  const prev = useRef(signal);
  useEffect(() => {
    if (signal !== undefined && signal !== prev.current) open();
    prev.current = signal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
}

export default function OrderPage({
  detail, orderStatusList, rowStatusList, lists, loading,
  onBack, onRefresh, onSetOrderStatus, onSetRowStatus, onUpdateRow, onBulkStatus, onToast,
  printSignal, billingSignal, techSignal, photoSignal, sendSignal, distrSignal, calcSignal, nestSignal,
}: Props) {
  const [q, setQ] = useState('');
  const [fOp, setFOp] = useState('');
  const [fExec, setFExec] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fKind, setFKind] = useState('');   // тип файлу: pdf / dxf / 3d / other
  const [pickOrder, setPickOrder] = useState(false);
  const [pickRow, setPickRow] = useState<OrderItem | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showDistr, setShowDistr] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showNest, setShowNest] = useState(false);
  const [tableMode, setTableMode] = useState<TableMode>('prod');
  const [addOpItem, setAddOpItem] = useState<OrderItem | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Згорнуті вікна — як на ПК: робота триває, знизу з'являється плашка
  const [minimized, setMinimized] = useState<Set<SheetKey>>(new Set());
  const [finished, setFinished] = useState<Set<SheetKey>>(new Set());
  const [pickBulk, setPickBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>({});
  // На широкому екрані за замовчуванням таблиця, на телефоні — картки
  const [view, setView] = useState<'cards' | 'table'>(
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'table' : 'cards'
  );

  const { header, items } = detail;
  const st = statusStyle(header.status);

  // Новий пошук/фільтр або інше замовлення — показуємо знову з першої сторінки
  useEffect(() => { setLimits({}); }, [q, fOp, fExec, fStatus, fKind, header.headerRow]);
  useEffect(() => { setFOp(''); setFExec(''); setFStatus(''); setFKind(''); setQ(''); setSelected(new Set()); }, [header.headerRow]);
  // Кнопка «Друк креслень + QR» у сайдбарі відкриває вікно друку для цього замовлення
  // Сигнали спрацьовують лише при ЗМІНІ (не при монтуванні компонента —
  // інакше вікна самі відкривались при повторному відкритті замовлення)
  useOpenSignal(printSignal, () => setShowPrint(true));
  useOpenSignal(billingSignal, () => setShowBilling(true));
  useOpenSignal(techSignal, () => setShowTech(true));
  useOpenSignal(photoSignal, () => setShowPhoto(true));
  useOpenSignal(sendSignal, () => setShowSend(true));
  useOpenSignal(distrSignal, () => setShowDistr(true));
  useOpenSignal(calcSignal, () => setShowCalc(true));
  useOpenSignal(nestSignal, () => setShowNest(true));

  const real = useMemo(() => items.filter(i => !i.group), [items]);
  const fOps = useMemo(() => distinct(real.map(i => i.op)), [real]);
  const fExecs = useMemo(() => distinct(real.map(i => i.executor)), [real]);
  const fStatuses = useMemo(() => distinct(real.map(i => i.rowStatus)), [real]);
  /** Типи файлів, які реально є в замовленні — чіпи фільтра. */
  const fKinds = useMemo(() => {
    const counts: Record<string, number> = {};
    real.forEach(i => { const k = fileKind(i.name); counts[k] = (counts[k] || 0) + 1; });
    return (Object.keys(GROUP_META) as Array<keyof typeof GROUP_META>)
      .filter(k => counts[k])
      .map(k => ({ key: k as string, count: counts[k] }));
  }, [real]);
  const hasFilter = !!(q.trim() || fOp || fExec || fStatus || fKind);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(i => {
      if (i.group) return !hasFilter;
      if (fOp && i.op !== fOp) return false;
      if (fExec && i.executor !== fExec) return false;
      if (fStatus && i.rowStatus !== fStatus) return false;
      if (fKind && fileKind(i.name) !== fKind) return false;
      if (query && ![i.name, i.id, i.op, i.executor, i.material, i.note, i.assembly].join(' ').toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, q, fOp, fExec, fStatus, fKind, hasFilter]);

  const groups = useMemo(() => {
    const acc: Record<string, OrderItem[]> = { pdf: [], dxf: [], '3d': [], other: [] };
    filtered.forEach(i => { if (!i.group) acc[fileKind(i.name)].push(i); });
    return acc;
  }, [filtered]);

  const done = items.filter(i => !i.group && String(i.rowStatus).includes('Готово')).length;
  const total = items.filter(i => !i.group).length;

  // ── Вибір рядків для масових дій ──
  const visibleRows = useMemo(() => filtered.filter(i => !i.group).map(i => i.row), [filtered]);

  function toggleRow(row: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });
  }
  function toggleAll() {
    setSelected(prev => (visibleRows.some(r => !prev.has(r))
      ? new Set([...prev, ...visibleRows])
      : new Set([...prev].filter(r => !visibleRows.includes(r)))));
  }
  /** Набір рядків одразу: шапка таблиці, Shift-діапазон. */
  function selectRows(rows: number[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      rows.forEach(r => (on ? next.add(r) : next.delete(r)));
      return next;
    });
  }

  async function applyBulkStatus(status: string) {
    setPickBulk(false);
    const rows = [...selected];
    setBulkBusy(true);
    try {
      await onBulkStatus(rows, status);
      onToast(`Статус «${status}» → ${rows.length} поз.`);
      setSelected(new Set());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося оновити статуси', true);
    } finally {
      setBulkBusy(false);
    }
  }

  const pct = total > 0 ? Math.round((100 * done) / total) : 0;

  // ── Згортання вікон ──
  function minimize(key: SheetKey) {
    setMinimized(prev => new Set(prev).add(key));
    onToast(`${SHEET_META[key].emoji} ${SHEET_META[key].label} — згорнуто, плашка внизу`);
  }
  function restore(key: SheetKey) {
    setMinimized(prev => { const n = new Set(prev); n.delete(key); return n; });
    setFinished(prev => { const n = new Set(prev); n.delete(key); return n; });
  }
  /** Операція завершилась, поки вікно було згорнуте — підсвічуємо плашку. */
  function markFinished(key: SheetKey) {
    setFinished(prev => (minimized.has(key) ? new Set(prev).add(key) : prev));
    if (minimized.has(key)) onToast(`✅ ${SHEET_META[key].label}: готово — відкрийте вікно`);
  }
  const hide = (key: SheetKey) => (minimized.has(key) ? 'hidden' : '');

  return (
    <div className="relative flex flex-col h-full bg-[var(--bg)]">
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
          {/* На десктопі ці інструменти живуть у сайдбарі (секція «Завдання») */}
          {header.folderUrl && (
            <a href={header.folderUrl} target="_blank" rel="noreferrer"
              className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Папка">
              <FolderOpen size={18} />
            </a>
          )}
          <button onClick={() => setShowBilling(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Рахунки і оплати" title="Рахунки і оплати">
            <Receipt size={17} />
          </button>
          <button onClick={() => setShowTech(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Тех.запуск" title="Тех.запуск">
            <Rocket size={17} />
          </button>
          <button onClick={() => setShowDistr(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Розподіл КД" title="Розподіл КД по виконавцях і операціях">
            <FolderTree size={17} />
          </button>
          <button onClick={() => setShowCalc(true)} className="p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Прорахунок" title="Прорахунок: час, ціни, групи для рахунку">
            <Calculator size={17} />
          </button>
          <button onClick={() => setShowPhoto(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Фотошоп креслень" title="Фотошоп: закрити конфіденційне">
            <Paintbrush size={17} />
          </button>
          <button onClick={() => setShowSend(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Відправити виконавцю" title="Відправити виконавцю">
            <Send size={17} />
          </button>
          <button onClick={() => setShowPrint(true)} className="lg:hidden p-1.5 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Друк креслень" title="Друк креслень + QR">
            <Printer size={18} />
          </button>
          {/* На десктопі оновлення в шапці додатка — тут лише для телефона */}
          <button onClick={onRefresh} className="lg:hidden p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="px-3 pb-2.5 pt-1 flex items-center gap-2 flex-wrap">
          {/* Статус + готовність — один блок, читається як стан замовлення */}
          <div className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-2xl bg-[#F7F8FA] ring-1 ring-gray-200/70">
            <button onClick={() => setPickOrder(true)}
              className="px-2.5 py-1 rounded-xl text-[11.5px] font-bold press whitespace-nowrap"
              style={{ background: st.bg, color: st.fg }}>
              {header.status || 'без статусу'} ▾
            </button>
            <div className="flex items-center gap-2">
              <div className="w-[110px] sm:w-[150px] h-1.5 bg-gray-200/80 rounded-full overflow-hidden">
                <div className="h-full rounded-full grow-x" style={{ width: `${pct}%`, background: st.solid }} />
              </div>
              <span className="text-[11.5px] font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                {done}<span style={{ color: 'var(--ink-3)' }}>/{total}</span>
              </span>
            </div>
          </div>

          {/* Зони таблиці — головний перемикач роботи */}
          {view === 'table' && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-2xl bg-[#F7F8FA] ring-1 ring-gray-200/70">
              {ZONES.map(({ key, label, short, icon }) => {
                const on = tableMode === key;
                return (
                  <button key={key} onClick={() => setTableMode(key)} title={label}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-all whitespace-nowrap"
                    style={on
                      ? { background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(16,24,40,.08)' }
                      : { color: 'var(--ink-3)' }}>
                    <span className="text-[12px] leading-none">{icon}</span>
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{short}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Вигляд: картки / таблиця */}
          <div className="ml-auto flex items-center gap-0.5 p-0.5 rounded-2xl bg-[#F7F8FA] ring-1 ring-gray-200/70">
            {(['cards', 'table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-all"
                style={view === v
                  ? { background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(16,24,40,.08)' }
                  : { color: 'var(--ink-3)' }}>
                {v === 'cards' ? 'Картки' : 'Таблиця'}
              </button>
            ))}
          </div>
        </div>

        {/* Фільтри: пошук + операція / виконавець / статус (обидва вигляди) */}
        <div className="px-3 pb-2.5 flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[150px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Пошук деталі…"
              className="w-full pl-7 pr-6 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400" aria-label="Очистити">
                <X size={13} />
              </button>
            )}
          </div>
          <FilterChip value={fOp} onChange={setFOp} label="Операція" options={fOps} />
          <FilterChip value={fExec} onChange={setFExec} label="Виконавець" options={fExecs} />
          <FilterChip value={fStatus} onChange={setFStatus} label="Статус" options={fStatuses} />
          {/* Тип файлу: PDF / DXF / 3D / інші — лише ті, що є в замовленні */}
          {fKinds.length > 1 && fKinds.map(({ key, count }) => {
            const meta = GROUP_META[key as keyof typeof GROUP_META];
            const on = fKind === key;
            return (
              <button key={key} onClick={() => setFKind(on ? '' : key)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors whitespace-nowrap"
                style={on ? { background: meta.color, color: '#fff' } : { background: meta.bg, color: meta.color }}
                title={meta.label}>
                {key === 'pdf' ? 'PDF' : key === 'dxf' ? 'DXF' : key === '3d' ? '3D' : 'Інші'} · {count}
              </button>
            );
          })}
          {hasFilter && (
            <button onClick={() => { setQ(''); setFOp(''); setFExec(''); setFStatus(''); setFKind(''); }}
              className="text-[11px] font-bold px-2 py-1.5 rounded-xl press" style={{ color: 'var(--ink-3)' }}>
              Скинути
            </button>
          )}
          {hasFilter && (
            <span className="text-[11px] font-semibold tabular-nums ml-auto" style={{ color: 'var(--ink-2)' }}>
              {filtered.filter(i => !i.group).length} поз.
            </span>
          )}
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex-1 min-h-0 bg-white">
          <ItemsTable
            items={filtered.filter(i => !i.group)}
            lists={lists}
            mode={tableMode}
            onSave={(row, field, value) => onUpdateRow(row, field, value)}
            onAddOp={setAddOpItem}
            selected={selected}
            onToggleRow={toggleRow}
            onSelectRows={selectRows}
          />
        </div>
      ) : (
      <>
      {/* Позиції */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-4">
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
                        {item.assignedQty && (
                          <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg tabular-nums"
                            title="Призначено виконавцю (колонка «Призн.»)">
                            призн. {item.assignedQty}
                          </span>
                        )}
                        {item.assembly && (
                          <span className="text-[11px] font-semibold bg-violet-50 text-violet-700 px-2 py-0.5 rounded-lg"
                            title="Збірка (вихідна папка)">
                            📦 {item.assembly}
                          </span>
                        )}
                        {item.time && (
                          <span className="text-[11px] font-semibold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-lg tabular-nums"
                            title="Час на виконання, год на 1 шт">
                            ⏱ {item.time}
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

      {/* Панель масових дій — з'являється, коли є вибрані рядки */}
      {selected.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-gray-900 text-white rounded-2xl shadow-2xl pl-4 pr-1.5 py-1.5 animate-sheet-up">
          <span className="text-[12.5px] font-bold tabular-nums whitespace-nowrap">
            {selected.size} вибрано
          </span>
          <button onClick={() => setPickBulk(true)} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-white/10 hover:bg-white/20 press whitespace-nowrap disabled:opacity-50">
            <Tags size={13} /> {bulkBusy ? 'Зберігаю…' : 'Статус'}
          </button>
          <button onClick={() => setShowSend(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-blue-500 hover:bg-blue-400 press whitespace-nowrap">
            <Send size={13} /> Виконавцю
          </button>
          <button onClick={() => setShowDelivery(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-orange-500 hover:bg-orange-400 press whitespace-nowrap">
            🚚 Доставка
          </button>
          <button onClick={() => setSelected(new Set())}
            className="p-2 rounded-xl hover:bg-white/10 press" aria-label="Зняти вибір">
            <X size={15} />
          </button>
        </div>
      )}

      {pickBulk && (
        <StatusPicker
          title={`Статус для ${selected.size} позицій`}
          subtitle={header.orderNum}
          options={rowStatusList}
          current=""
          onPick={applyBulkStatus}
          onClose={() => setPickBulk(false)}
        />
      )}

      {showSend && (
        <div className={hide('send')}>
          <SendSheet
            detail={detail}
            preselect={selected.size ? [...selected] : undefined}
            onClose={() => setShowSend(false)}
            onMinimize={() => minimize('send')}
            onToast={onToast}
            onSent={() => { setSelected(new Set()); markFinished('send'); onRefresh(); }}
          />
        </div>
      )}

      {showPrint && (
        <div className={hide('print')}>
          <PrintSheet detail={detail} onClose={() => setShowPrint(false)}
            onMinimize={() => minimize('print')} onToast={onToast} />
        </div>
      )}

      {showTech && (
        <div className={hide('tech')}>
          <TechLaunchSheet
            detail={detail}
            onClose={() => setShowTech(false)}
            onMinimize={() => minimize('tech')}
            onToast={onToast}
            onLaunched={() => { markFinished('tech'); onRefresh(); }}
          />
        </div>
      )}

      {showPhoto && (
        <div className={hide('photo')}>
          <PhotoSheet
            detail={detail}
            onClose={() => setShowPhoto(false)}
            onMinimize={() => minimize('photo')}
            onToast={onToast}
            onSaved={() => { markFinished('photo'); onRefresh(); }}
          />
        </div>
      )}

      {showBilling && (
        <BillingSheet
          detail={detail}
          onClose={() => setShowBilling(false)}
          onToast={onToast}
          onChanged={onRefresh}
        />
      )}

      {showDistr && (
        <div className={hide('distr')}>
          <DistributionSheet
            detail={detail}
            onClose={() => setShowDistr(false)}
            onMinimize={() => minimize('distr')}
            onToast={onToast}
            onDone={() => { markFinished('distr'); onRefresh(); }}
          />
        </div>
      )}

      {showCalc && (
        <div className={hide('calc')}>
          <CalcSheet
            detail={detail}
            onClose={() => setShowCalc(false)}
            onMinimize={() => minimize('calc')}
            onToast={onToast}
            onApplied={() => { markFinished('calc'); onRefresh(); }}
          />
        </div>
      )}

      {showNest && (
        <div className={hide('nest')}>
          <NestingSheet
            detail={detail}
            onClose={() => setShowNest(false)}
            onMinimize={() => minimize('nest')}
            onToast={onToast}
          />
        </div>
      )}

      {/* Плашки згорнутих вікон — як панель задач */}
      {minimized.size > 0 && (
        <div className="fixed bottom-3 left-3 z-[78] flex flex-col-reverse gap-1.5 max-w-[70vw]">
          {[...minimized].map(k => {
            const done = finished.has(k);
            return (
              <button key={k} onClick={() => restore(k)}
                className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-2xl shadow-lg press bg-white ring-1 ring-gray-200 hover:bg-gray-50 animate-sheet-up"
                title="Повернути вікно">
                <span className="text-[14px] leading-none">{SHEET_META[k].emoji}</span>
                <span className="text-[12.5px] font-bold truncate">{SHEET_META[k].label}</span>
                {done
                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">готово</span>
                  : <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-[var(--accent)] animate-spin" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Додати операцію деталі — рядок-дубль під нею (маршрут) */}
      {addOpItem && (
        <StatusPicker
          title="Додати операцію"
          subtitle={addOpItem.name}
          options={(lists?.operations || []).filter(o => o !== addOpItem.op)}
          current=""
          onPick={async op => {
            const item = addOpItem;
            setAddOpItem(null);
            onToast(`⏳ Додаю «${op}» до «${item.name.slice(0, 28)}»…`);
            try {
              await api.addOperation(item.row, op);
              onToast(`✅ «${op}» додано — маршрут оновлюється`);
              onRefresh();
            } catch (e: any) {
              onToast(e?.message || 'Не вдалося додати операцію', true);
            }
          }}
          onClose={() => setAddOpItem(null)}
        />
      )}

      {/* Доставка вибраних деталей */}
      {showDelivery && (
        <DeliverySheet
          items={items.filter(i => selected.has(i.row))}
          onClose={() => setShowDelivery(false)}
          onToast={onToast}
          onDone={() => { setShowDelivery(false); setSelected(new Set()); onRefresh(); }}
        />
      )}
    </div>
  );
}

function distinct(arr: string[]): string[] {
  return [...new Set(arr.map(s => String(s || '').trim()).filter(Boolean))].sort();
}

/** Фільтр-чіп: стилізований select — активний підсвічується акцентом. */
function FilterChip({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: string[];
}) {
  if (!options.length) return null;
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none pl-2.5 pr-6 py-1.5 rounded-xl text-[11px] font-bold outline-none max-w-[130px] truncate transition-colors"
        style={value
          ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
          : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px]"
        style={{ color: value ? 'var(--accent)' : 'var(--ink-3)' }}>▼</span>
    </div>
  );
}
