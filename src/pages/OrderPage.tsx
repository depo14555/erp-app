// ================================================================
//  src/pages/OrderPage.tsx
//  Картка замовлення: шапка зі статусом (редагується), позиції
//  з підгрупами за типом файлу, статус рядка, посилання на креслення.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, RefreshCw, FolderOpen, FileText, Ruler, Box, Paperclip,
  ExternalLink, User, Search, Printer, X, Send, Tags, Rocket, Paintbrush, Receipt,
  FolderTree, Calculator, Scissors, Wrench, Layers,
} from 'lucide-react';
import StatusPicker from '../components/StatusPicker';
import ItemsTable, { TableMode } from '../components/ItemsTable';
import DeliverySheet from '../components/DeliverySheet';
import BulkEditSheet from '../components/BulkEditSheet';
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
  onRefresh: (label?: string) => void;
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
  /** Відкрити інструмент одразу після відкриття замовлення (із загального прорахунку). */
  autoOpen?: 'calc' | null;
  /** Рядок, на якому треба опинитись (з пошуку деталі або QR). */
  focusRow?: number | null;
  onAutoOpened?: () => void;
  onFocused?: () => void;
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

/** Дії з замовленням для телефона (на десктопі те саме в сайдбарі). */
const TOOLS: Array<{ key: string; label: string; hint: string; Icon: typeof Rocket; color: string }> = [
  { key: 'tech',    label: 'Тех.запуск',   hint: 'файли папки → рядки картки', Icon: Rocket,     color: '#EA580C' },
  { key: 'distr',   label: 'Розподіл КД',  hint: 'по виконавцях і операціях',  Icon: FolderTree, color: '#7C3AED' },
  { key: 'nest',    label: 'Розкрій DXF',  hint: 'листи, вага, вартість різу', Icon: Scissors,   color: '#0891B2' },
  { key: 'calc',    label: 'Прорахунок',   hint: 'час, ціни, групи в рахунок', Icon: Calculator, color: '#0D9488' },
  { key: 'photo',   label: 'Фотошоп',      hint: 'закрити зайве на кресленні', Icon: Paintbrush, color: '#DB2777' },
  { key: 'send',    label: 'Виконавцю',    hint: 'відправити позиції в його таблицю', Icon: Send, color: '#4F46E5' },
  { key: 'print',   label: 'Друк + QR',    hint: 'пакет креслень для цеху',    Icon: Printer,    color: '#0369A1' },
  { key: 'billing', label: 'Рахунки',      hint: 'оплати і документи',         Icon: Receipt,    color: '#059669' },
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
  printSignal, billingSignal, techSignal, photoSignal, sendSignal, distrSignal, calcSignal, nestSignal, autoOpen, onAutoOpened,
  focusRow, onFocused,
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
  const [showTools, setShowTools] = useState(false);   // телефон: усі дії замовлення
  const [tableMode, setTableMode] = useState<TableMode>('prod');
  const [addOpItem, setAddOpItem] = useState<OrderItem | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Згорнуті вікна — як на ПК: робота триває, знизу з'являється плашка
  const [minimized, setMinimized] = useState<Set<SheetKey>>(new Set());
  const [finished, setFinished] = useState<Set<SheetKey>>(new Set());
  const [pickBulk, setPickBulk] = useState(false);
  const [bulkEdit, setBulkEdit] = useState(false);   // масова зміна будь-якого поля
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
  // Прийшли із загального прорахунку — одразу показуємо вікно прорахунку
  useEffect(() => {
    if (autoOpen !== 'calc') return;
    setShowCalc(true);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, header.headerRow]);

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

  function toggleRow(row: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row); else next.add(row);
      return next;
    });
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

  // ── Перехід на конкретну позицію (з пошуку деталі / QR) ──
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    if (!focusRow) return;
    const target = items.find(i => i.row === focusRow);
    if (!target) return;
    // фільтри і «показати ще» не мають ховати те, на що ми йдемо
    setQ(''); setFOp(''); setFExec(''); setFStatus(''); setFKind('');
    // «Показати ще» не має ховати позицію — піднімаємо ліміт усіх груп
    setLimits({ pdf: 9999, dxf: 9999, '3d': 9999, other: 9999 });
    setFlash(focusRow);
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-row="${focusRow}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocused?.();
    }, 260);
    const off = setTimeout(() => setFlash(null), 3200);
    return () => { clearTimeout(timer); clearTimeout(off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow, items]);

  // Клас-спалах вішаємо на елемент напряму — так він працює і в таблиці, і в картках
  useEffect(() => {
    if (!flash) return;
    const el = document.querySelector(`[data-row="${flash}"]`);
    if (!el) return;
    el.classList.add('row-flash');
    return () => el.classList.remove('row-flash');
  }, [flash, view, tableMode]);
  /** Термін замовлення живе в першому рядку картки — беремо перший заповнений. */
  const deadline = useMemo(() => items.find(i => i.deadline)?.deadline || '', [items]);

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
        {/* Рядок 1: назад · номер · клієнт · статус · показники · дії */}
        <div className="flex items-center gap-2 px-2 pt-2 pb-2">
          <button onClick={onBack} className="p-1.5 press rounded-xl flex-shrink-0" style={{ color: 'var(--accent)' }} aria-label="Назад">
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-[17px] truncate leading-tight tracking-tight">
              {header.orderNum || header.projectId || 'Замовлення'}
            </h1>
            <p className="text-[11.5px] truncate flex items-center gap-1 leading-tight" style={{ color: 'var(--ink-3)' }}>
              <User size={10} /> {header.client || 'клієнт не вказаний'}
            </p>
          </div>

          <button onClick={() => setPickOrder(true)}
            className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press whitespace-nowrap flex-shrink-0"
            style={{ background: st.bg, color: st.fg }}>
            {header.status || 'без статусу'} ▾
          </button>

          <span className="flex-1" />

          {/* Показники замовлення — там, де раніше була самотня смужка прогресу */}
          <div className="hidden lg:flex items-center gap-5 pr-2 flex-shrink-0">
            <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
              позицій <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{total}</b>
            </span>
            <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
              готово <b className="tabular-nums" style={{ color: done ? st.solid : 'var(--ink)' }}>{done}</b>
            </span>
            {/* Термін проставлений не всюди — тоді показуємо дату запуску */}
            {(deadline || header.date) && (
              <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                {deadline ? 'термін' : 'запуск'}{' '}
                <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{deadline || header.date}</b>
              </span>
            )}
          </div>

          {/* Телефон: готовність коротко + усі інструменти під однією кнопкою */}
          <span className="lg:hidden text-[11.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
            {done}<span style={{ color: 'var(--ink-3)' }}>/{total}</span>
          </span>
          <button onClick={() => setShowTools(true)}
            className="lg:hidden flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-xl press ring-1 ring-gray-200 flex-shrink-0"
            style={{ color: 'var(--ink-2)' }} aria-label="Інструменти замовлення">
            <Wrench size={15} />
            <span className="text-[12px] font-bold">Дії</span>
          </button>
          <button onClick={() => onRefresh()} className="lg:hidden p-2 press rounded-xl flex-shrink-0" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Прогрес — тонка лінія на всю ширину під шапкою */}
        <div className="h-[3px] bg-gray-100" title={`Готово ${done} з ${total}`}>
          <div className="h-full grow-x" style={{ width: `${pct}%`, background: st.solid }} />
        </div>

        {/*
          Рядок 2: зони · вигляд · фільтри. На широкому екрані все в одну
          лінію (зони зліва, фільтри справа), на телефоні фільтри переносяться
          на власний рядок — через w-full + order на дочірніх елементах.
        */}
        <div className="px-3 pt-2 pb-2.5 flex flex-wrap items-center gap-2">

        {/* Зони таблиці */}
        {view === 'table' && (
          <div className="order-1 flex-1 min-w-0 lg:flex-none flex items-center gap-0.5 p-0.5 rounded-xl bg-[#F1F2F4] overflow-x-auto no-scrollbar">
            {ZONES.map(({ key, label, short }) => {
              const on = tableMode === key;
              return (
                <button key={key} onClick={() => setTableMode(key)} title={label}
                  className="flex items-center justify-center px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all whitespace-nowrap"
                  style={on
                    ? { background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(16,24,40,.08)' }
                    : { color: 'var(--ink-3)' }}>
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Картки / Таблиця */}
        <div className="order-2 lg:order-3 flex items-center gap-0.5 p-0.5 rounded-xl bg-[#F1F2F4] flex-shrink-0 ml-auto">
          {(['cards', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-all"
              style={view === v
                ? { background: '#fff', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(16,24,40,.08)' }
                : { color: 'var(--ink-3)' }}>
              {v === 'cards' ? 'Картки' : 'Таблиця'}
            </button>
          ))}
        </div>

        {/* Фільтри: пошук + операція / виконавець / статус (обидва вигляди) */}
        <div className={`order-3 lg:order-2 w-full lg:w-auto lg:flex-1 lg:min-w-0 flex items-center gap-1.5 flex-nowrap overflow-x-auto lg:overflow-visible no-scrollbar ${view === 'table' ? 'lg:justify-end' : 'lg:justify-start'}`}>
          <div className="relative flex-1 min-w-[150px] flex-shrink-0 lg:flex-none lg:w-[230px]">
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
            <span className="text-[11px] font-semibold tabular-nums ml-auto lg:ml-0 flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
              {filtered.filter(i => !i.group).length} поз.
            </span>
          )}
        </div>

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
                      data-row={item.row}
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
          <button onClick={() => setBulkEdit(true)} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-indigo-500 hover:bg-indigo-400 press whitespace-nowrap disabled:opacity-50">
            <Layers size={13} /> Змінити поле
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
            onSent={() => { setSelected(new Set()); markFinished('send'); onRefresh('Оновлюю після відправки…'); }}
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
            onLaunched={() => { markFinished('tech'); onRefresh('Оновлюю після тех.запуску…'); }}
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
            onSaved={() => { markFinished('photo'); onRefresh('Оновлюю після фотошопу…'); }}
          />
        </div>
      )}

      {showBilling && (
        <BillingSheet
          detail={detail}
          onClose={() => setShowBilling(false)}
          onToast={onToast}
          onChanged={() => onRefresh('Оновлюю оплати…')}
        />
      )}

      {showDistr && (
        <div className={hide('distr')}>
          <DistributionSheet
            detail={detail}
            onClose={() => setShowDistr(false)}
            onMinimize={() => minimize('distr')}
            onToast={onToast}
            onDone={() => { markFinished('distr'); onRefresh('Оновлюю після розподілу КД…'); }}
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
            onApplied={() => { markFinished('calc'); onRefresh('Оновлюю ціни в картці…'); }}
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

      {/* Телефон: усі дії замовлення в одній шторці */}
      {showTools && (
        <div className="lg:hidden fixed inset-0 z-[75] flex items-end">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setShowTools(false)} />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl animate-sheet-up max-h-[85dvh] flex flex-col">
            <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] leading-tight">Дії з замовленням</p>
                <p className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                  {header.orderNum || header.projectId}{header.client ? ` · ${header.client}` : ''}
                </p>
              </div>
              <button onClick={() => setShowTools(false)} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] grid grid-cols-2 gap-1.5">
              {TOOLS.map(({ key, label, Icon, color, hint }) => (
                <button key={key}
                  onClick={() => {
                    setShowTools(false);
                    if (key === 'tech') setShowTech(true);
                    else if (key === 'distr') setShowDistr(true);
                    else if (key === 'nest') setShowNest(true);
                    else if (key === 'calc') setShowCalc(true);
                    else if (key === 'photo') setShowPhoto(true);
                    else if (key === 'send') setShowSend(true);
                    else if (key === 'print') setShowPrint(true);
                    else if (key === 'billing') setShowBilling(true);
                  }}
                  className="flex items-start gap-2.5 p-3 rounded-2xl ring-1 ring-gray-200/70 text-left press active:bg-gray-50">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '16', color }}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold leading-tight">{label}</span>
                    <span className="block text-[10.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{hint}</span>
                  </span>
                </button>
              ))}
              {header.folderUrl && (
                <a href={header.folderUrl} target="_blank" rel="noreferrer" onClick={() => setShowTools(false)}
                  className="flex items-start gap-2.5 p-3 rounded-2xl ring-1 ring-gray-200/70 text-left press active:bg-gray-50">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-600">
                    <FolderOpen size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold leading-tight">Папка на Диску</span>
                    <span className="block text-[10.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>усі файли замовлення</span>
                  </span>
                </a>
              )}
            </div>
          </div>
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
              onRefresh(`Додаю операцію «${op}»…`);
            } catch (e: any) {
              onToast(e?.message || 'Не вдалося додати операцію', true);
            }
          }}
          onClose={() => setAddOpItem(null)}
        />
      )}

      {/* Масова зміна поля для вибраних позицій */}
      {bulkEdit && (
        <BulkEditSheet
          rows={[...selected]}
          items={items.filter(i => selected.has(i.row))}
          lists={lists}
          rowStatusList={rowStatusList}
          onClose={() => setBulkEdit(false)}
          onToast={onToast}
          onDone={() => { setBulkEdit(false); setSelected(new Set()); onRefresh('Оновлюю позиції…'); }}
        />
      )}

      {/* Доставка вибраних деталей */}
      {showDelivery && (
        <DeliverySheet
          items={items.filter(i => selected.has(i.row))}
          onClose={() => setShowDelivery(false)}
          onToast={onToast}
          onDone={() => { setShowDelivery(false); setSelected(new Set()); onRefresh('Оновлюю доставку…'); }}
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
