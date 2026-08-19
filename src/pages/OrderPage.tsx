// ================================================================
//  src/pages/OrderPage.tsx
//  Картка замовлення: шапка зі статусом (редагується), позиції
//  з підгрупами за типом файлу, статус рядка, посилання на креслення.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, RefreshCw, FolderOpen, FileText, Ruler, Box, Paperclip,
  ExternalLink, User, Search, Printer, X, Send, Tags, Rocket, Paintbrush, Receipt,
  FolderTree, Calculator, Wrench, Layers, ShoppingCart, Blocks, Scale,
  LayoutGrid, Table2 as TableIcon,
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
import PurchasedSheet from '../components/PurchasedSheet';
import AssemblySheet from '../components/AssemblySheet';
import TmcSheet from '../components/TmcSheet';
import OrderInsights, { GAP_FIELDS, weighItems } from '../components/OrderInsights';
import DrawingPane from '../components/DrawingPane';
import PinchZoom from '../components/PinchZoom';
import PurchasedInline, { PurchLine } from '../components/PurchasedInline';
import { AiBadge } from '../components/Sidebar';
import { OrderDetail, OrderItem, Lists, PurchasedRow, statusStyle, fileKind } from '../types';

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
  purchSignal?: number;
  asmSignal?: number;
  tmcSignal?: number;
  /** Відкрити інструмент одразу після відкриття замовлення (із загального прорахунку). */
  autoOpen?: 'calc' | null;
  /** Рядок, на якому треба опинитись (з пошуку деталі або QR). */
  focusRow?: number | null;
  onAutoOpened?: () => void;
  onFocused?: () => void;
}

const GROUP_META = {
  pdf:   { label: 'Креслення (PDF)',    icon: FileText,  color: 'var(--blue)', bg: 'var(--blue-bg)' },
  dxf:   { label: 'Файли різу (DXF)',   icon: Ruler,     color: 'var(--amber)', bg: 'var(--amber-bg)' },
  '3d':  { label: '3D-моделі',          icon: Box,       color: 'var(--green)', bg: 'var(--green-bg)' },
  other: { label: 'Інші позиції',       icon: Paperclip, color: 'var(--ink-2)', bg: 'var(--bg)' },
} as const;

const PAGE = 40; // позицій на групу за раз — великі замовлення (400+) не вішають телефон

/** Зони таблиці позицій — під різні ролі в одному замовленні. */
/*
  Три зони замість чотирьох. «Прорахунок» і «Бухгалтерія» показували ті
  самі ціну й суму — тепер це одна зона «Гроші»: скільки роботи і скільки
  грошей. Рахує вікно прорахунку, таблиця показує результат.
*/
const ZONES: Array<{ key: TableMode; label: string; short: string; icon: string }> = [
  { key: 'prod',  label: 'Виробництво', short: 'Вироб.', icon: '🏭' },
  { key: 'money', label: 'Гроші', short: 'Гроші', icon: '💰' },
  { key: 'log',   label: 'Логістика', short: 'Логіст.', icon: '🚚' },
];

/** Дії з замовленням для телефона (на десктопі те саме в сайдбарі). */
const TOOLS: Array<{ key: string; label: string; hint: string; Icon: typeof Rocket; color: string; ai?: boolean }> = [
  { key: 'tech',    label: 'Тех.запуск',   hint: 'файли папки → рядки картки', Icon: Rocket,     color: '#EA580C' },
  { key: 'distr',   label: 'Розподіл КД',  hint: 'по виконавцях і операціях',  Icon: FolderTree, color: '#7C3AED' },
  { key: 'calc',    label: 'Прорахунок',   hint: 'час, ціни, групи в рахунок', Icon: Calculator, color: '#0D9488' },
  { key: 'photo',   label: 'Фотошоп',      hint: 'закрити зайве на кресленні', Icon: Paintbrush, color: '#DB2777' },
  { key: 'send',    label: 'Виконавцю',    hint: 'відправити позиції в його таблицю', Icon: Send, color: '#4F46E5' },
  { key: 'print',   label: 'Друк + QR',    hint: 'пакет креслень для цеху',    Icon: Printer,    color: '#0369A1' },
  { key: 'billing', label: 'Рахунки',      hint: 'оплати і документи',         Icon: Receipt,    color: 'var(--green)' },
  { key: 'asm',     label: 'Склад збірок', hint: 'що в яку збірку входить',    Icon: Blocks,     color: '#7C3AED', ai: true },
  { key: 'tmc',     label: 'ТМЦ і вага',   hint: 'матеріал, товщина, маса зі штампа', Icon: Scale, color: '#1B4FD8', ai: true },
  { key: 'purch',   label: 'Покупні',      hint: 'кріплення зі специфікацій збірок', Icon: ShoppingCart, color: '#EA580C', ai: true },
];

/** Клітинка штампа: моно-підпис угорі, значення під ним. */
function StampCell({ k, v, hot, last }: { k: string; v: string; hot?: boolean; last?: boolean }) {
  return (
    <div className={`flex flex-col justify-center px-3.5 py-2 ${last ? '' : 'border-r'}`}
      style={{ borderColor: 'var(--line)' }}>
      <span className="k-label whitespace-nowrap">{k}</span>
      <span className="k-value whitespace-nowrap" style={hot ? { color: 'var(--accent)' } : undefined}>{v}</span>
    </div>
  );
}

/** Вікна інструментів, які можна згорнути (робота продовжується у фоні). */
type SheetKey = 'print' | 'send' | 'tech' | 'photo' | 'distr' | 'calc' | 'nest' | 'purch' | 'asm' | 'tmc';
const SHEET_META: Record<SheetKey, { label: string; emoji: string }> = {
  print: { label: 'Друк креслень', emoji: '🖨️' },
  send:  { label: 'Відправка виконавцю', emoji: '📤' },
  tech:  { label: 'Тех.запуск', emoji: '🚀' },
  photo: { label: 'Фотошоп креслень', emoji: '🎨' },
  distr: { label: 'Розподіл КД', emoji: '📂' },
  calc:  { label: 'Прорахунок', emoji: '🧮' },
  nest:  { label: 'Розкрій DXF', emoji: '✂️' },
  purch: { label: 'Покупні', emoji: '🔩' },
  asm:   { label: 'Склад збірок', emoji: '🧩' },
  tmc:   { label: 'ТМЦ і вага', emoji: '⚖️' },
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
  printSignal, billingSignal, techSignal, photoSignal, sendSignal, distrSignal, calcSignal, nestSignal, purchSignal, asmSignal, tmcSignal, autoOpen, onAutoOpened,
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
  const [showPurch, setShowPurch] = useState(false);
  const [showAsm, setShowAsm] = useState(false);
  const [showTmc, setShowTmc] = useState(false);
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
  const [byAsm, setByAsm] = useState(false);   // групувати позиції по збірках
  const [preview, setPreview] = useState<OrderItem | null>(null);  // креслення збоку
  const [gap, setGap] = useState('');          // «показати рядки, де цього поля немає»
  const [insightsTick, setInsightsTick] = useState(0);
  const [masses, setMasses] = useState<Record<string, number>>({});  // fileId → кг зі штампа
  // Вузький екран — таблиця показується в масштабованому шарі
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { header, items } = detail;
  const st = statusStyle(header.status);

  // Новий пошук/фільтр або інше замовлення — показуємо знову з першої сторінки
  useEffect(() => { setLimits({}); }, [q, fOp, fExec, fStatus, fKind, gap, header.headerRow]);
  useEffect(() => { setFOp(''); setFExec(''); setFStatus(''); setFKind(''); setQ(''); setGap(''); setSelected(new Set()); setPreview(null); }, [header.headerRow]);
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
  useOpenSignal(purchSignal, () => setShowPurch(true));
  useOpenSignal(asmSignal, () => setShowAsm(true));
  useOpenSignal(tmcSignal, () => setShowTmc(true));
  // Прийшли із загального прорахунку — одразу показуємо вікно прорахунку
  useEffect(() => {
    if (autoOpen !== 'calc') return;
    setShowCalc(true);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, header.headerRow]);

  const real = useMemo(() => items.filter(i => !i.group), [items]);
  /** Скільки важить те, що зараз відмічено галочками (за штампами ТМЦ). */
  const selKg = useMemo(
    () => weighItems(real.filter(i => selected.has(i.row)), masses),
    [real, selected, masses],
  );
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
  const hasFilter = !!(q.trim() || fOp || fExec || fStatus || fKind || gap);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(i => {
      if (i.group) return !hasFilter;
      if (fOp && i.op !== fOp) return false;
      if (fExec && i.executor !== fExec) return false;
      if (fStatus && i.rowStatus !== fStatus) return false;
      if (fKind && fileKind(i.name) !== fKind) return false;
      // «чого бракує»: лишаємо саме ті рядки, де поле порожнє
      if (gap && String((i as any)[gap] ?? '').trim()) return false;
      if (query && ![i.name, i.id, i.op, i.executor, i.material, i.note, i.assembly].join(' ').toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, q, fOp, fExec, fStatus, fKind, gap, hasFilter]);

  /** Активні фільтри чіпами — щоб було видно стан і зі згорнутою панеллю. */
  const activeFilters = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (q.trim()) out.push({ key: 'q', label: `«${q.trim()}»`, clear: () => setQ('') });
    if (fOp) out.push({ key: 'op', label: fOp, clear: () => setFOp('') });
    if (fExec) out.push({ key: 'exec', label: fExec, clear: () => setFExec('') });
    if (fStatus) out.push({ key: 'st', label: fStatus, clear: () => setFStatus('') });
    if (fKind) out.push({ key: 'kind', label: fKind.toUpperCase(), clear: () => setFKind('') });
    if (gap) {
      const f = GAP_FIELDS.find(x => x.key === gap);
      out.push({ key: 'gap', label: `без «${f?.label || gap}»`, clear: () => setGap('') });
    }
    return out;
  }, [q, fOp, fExec, fStatus, fKind, gap]);

  const filterCount = activeFilters.length;
  const clearFilters = () => {
    setQ(''); setFOp(''); setFExec(''); setFStatus(''); setFKind(''); setGap('');
  };

  const groups = useMemo(() => {
    const acc: Record<string, OrderItem[]> = { pdf: [], dxf: [], '3d': [], other: [] };
    filtered.forEach(i => { if (!i.group) acc[fileKind(i.name)].push(i); });
    return acc;
  }, [filtered]);

  /** Чи є взагалі проставлені збірки — від цього залежить, чи показувати перемикач. */
  const hasAsm = useMemo(() => real.some(i => String(i.assembly || '').trim()), [real]);

  /**
   * Покупні замовлення, розкладені по збірках. Кріплення не мають власного
   * рядка в картці — вони живуть в аркуші «Покупні», — тому показуємо їх
   * прямо в групі тієї збірки, куди вони входять.
   */
  const [purchRows, setPurchRows] = useState<PurchasedRow[]>([]);
  useEffect(() => {
    let alive = true;
    api.purchasedGet(header.projectId)
      .then(d => { if (alive) setPurchRows(d.rows); })
      .catch(() => { /* покупних ще нема — не біда */ });
    return () => { alive = false; };
  }, [header.projectId, insightsTick]);

  const purchByAsm = useMemo(() => {
    const m = new Map<string, PurchLine[]>();
    // Дублі з давніх записів (одне креслення прийшло кількома рядками
    // маршруту) не показуємо: чотири однакові гайки — це одна гайка
    const seen = new Set<string>();
    purchRows.forEach(r => {
      const asm = String(r['2'] || '').trim();
      if (!asm) return;
      const name = [String(r['6'] || '').trim(), String(r['5'] || '').trim()]
        .filter(Boolean).join(' ');
      const key = `${asm}|${String(r['4'] || '')}|${name}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const a = m.get(asm) || [];
      // row і status — щоб галочка «доставлено» писала прямо в аркуш
      a.push({
        pos: String(r['4'] || ''), name, total: String(r['9'] || ''),
        row: r.row, status: String(r['15'] || ''),
      });
      m.set(asm, a);
    });
    return m;
  }, [purchRows]);

  /**
   * Картки, згруповані по збірках: спершу збірки за назвою, «Без збірок» — знизу.
   * Це той самий поділ, що й у таблиці, просто в мобільному вигляді.
   */
  const asmGroupsRaw = useMemo(() => {
    const m = new Map<string, OrderItem[]>();
    filtered.forEach(i => {
      if (i.group) return;
      const k = String(i.assembly || '').trim();
      const a = m.get(k) || [];
      a.push(i);
      m.set(k, a);
    });
    const named = [...m.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'uk', { numeric: true }));
    const out = named.map(k => ({ key: k, items: m.get(k)! }));
    if (m.has('')) out.push({ key: '', items: m.get('')! });
    return out;
  }, [filtered]);

  /** Секції списку карток: або по типах файлів, або по збірках. */
  const sections = useMemo(() => (
    byAsm
      ? asmGroupsRaw.map(g => ({
          key: `asm:${g.key}`,
          label: g.key || 'Без збірок',
          Icon: Blocks,
          color: g.key ? '#5B21B6' : 'var(--ink-2)',
          bg: g.key ? '#F3EEFF' : 'var(--bg)',
          list: g.items,
        }))
      : (Object.keys(GROUP_META) as Array<keyof typeof GROUP_META>).map(k => ({
          key: k as string,
          label: GROUP_META[k].label,
          Icon: GROUP_META[k].icon,
          color: GROUP_META[k].color,
          bg: GROUP_META[k].bg,
          list: groups[k],
        }))
  ), [byAsm, asmGroupsRaw, groups]);

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
      <div className="flex-shrink-0 bg-white border-b" style={{ borderColor: 'var(--ink)', borderBottomWidth: 1.5 }}>
        {/*
          ШТАМП ЗАМОВЛЕННЯ — як основний напис на кресленні: назва ліворуч,
          праворуч клітинки з підписами. Дані завжди на тому самому місці.
        */}
        <div className="flex items-stretch">
          <button onClick={onBack} className="px-3 press flex-shrink-0 border-r"
            style={{ borderColor: 'var(--line)', color: 'var(--ink)' }} aria-label="Назад">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-3 px-3.5 py-2 min-w-0 flex-1 border-r" style={{ borderColor: 'var(--line)' }}>
            <span className="font-mono text-[18px] font-semibold whitespace-nowrap">
              {header.orderNum || header.projectId || 'Замовлення'}
            </span>
            <button onClick={() => setPickOrder(true)} className="k-chip press flex-shrink-0"
              style={{ background: st.bg, color: st.fg, borderColor: st.fg + '55' }}>
              {header.status || 'без статусу'}
            </button>
            <span className="font-extrabold text-[13.5px] truncate pl-3 border-l hidden sm:block"
              style={{ borderColor: 'var(--line)' }}>
              {header.client || 'клієнт не вказаний'}
            </span>
          </div>

          {/* Клітинки показників — на телефоні лишається тільки готовність */}
          <div className="hidden lg:flex items-stretch flex-shrink-0">
            <StampCell k="Позицій" v={String(total)} />
            <StampCell k="Готово" v={`${done} · ${pct}%`} hot={!done} />
            <StampCell k={deadline ? 'Термін' : 'Запуск'} v={deadline || header.date || '—'} />
            <StampCell k="ID" v={header.projectId} last />
          </div>

          <div className="lg:hidden flex items-center gap-1 px-1.5 flex-shrink-0">
            <span className="k-value">{done}<span style={{ color: 'var(--ink-3)' }}>/{total}</span></span>

            {/*
              Вигляд перенесено сюди зі стрічки фільтрів: на телефоні кожен
              рядок над таблицею — це мінус десяток позицій на екрані.
            */}
            <div className="flex items-center rounded-md overflow-hidden mx-0.5"
              style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              {([['cards', LayoutGrid, 'Картки'], ['table', TableIcon, 'Таблиця']] as const).map(([v, Icon, label]) => (
                <button key={v} onClick={() => setView(v)} title={label} aria-label={label}
                  className="px-2 py-1.5 press transition-colors"
                  style={view === v ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-2)' }}>
                  <Icon size={14} strokeWidth={2} />
                </button>
              ))}
            </div>

            <button onClick={() => setShowTools(true)} className="p-1.5 press" aria-label="Інструменти замовлення">
              <Wrench size={16} />
            </button>
            <button onClick={() => onRefresh()} className="p-1.5 press" aria-label="Оновити">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Прогрес — тонка лінія на всю ширину під штампом */}
        <div className="h-[2.5px]" style={{ background: 'var(--line)' }} title={`Готово ${done} з ${total}`}>
          <div className="h-full grow-x" style={{ width: `${pct}%`, background: done ? 'var(--green)' : 'var(--line-2)' }} />
        </div>

        {/*
          Рядок 2: зони · вигляд · фільтри. На широкому екрані все в одну
          лінію (зони зліва, фільтри справа), на телефоні фільтри переносяться
          на власний рядок — через w-full + order на дочірніх елементах.
        */}
        <div className="px-3 pt-2 pb-2 flex flex-wrap items-center gap-1.5">

        {/* Зони таблиці */}
        {view === 'table' && (
          <div className="order-1 flex-shrink-0 flex items-center rounded-lg bg-white overflow-hidden"
            style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            {ZONES.map(({ key, label, short }) => {
              const on = tableMode === key;
              return (
                <button key={key} onClick={() => setTableMode(key)} title={label}
                  className="px-2.5 py-[6px] text-[12px] font-bold transition-colors whitespace-nowrap"
                  style={on ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-2)' }}>
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </button>
              );
            })}
          </div>
        )}

        {/*
          Пошук, типи файлів і активні фільтри. На ПК стоять у тому самому
          рядку, що й зони — місця там вистачає; на телефоні переносяться
          на власний рядок (w-full + order).
          Операцію/виконавця/статус у таблиці прибрано — вони є прямо
          в заголовках колонок; у картках заголовків немає, тому там списки
          лишаються.
        */}
        <div className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 lg:min-w-0 flex items-center gap-1.5">
          <div className="relative flex-1 min-w-[120px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Пошук деталі…"
              className="k-input w-full pl-7 pr-6 py-[6px] rounded-lg outline-none text-[12.5px]"
              style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400" aria-label="Очистити">
                <X size={13} />
              </button>
            )}
          </div>

          {view === 'cards' && (
            <>
              <FilterChip value={fOp} onChange={setFOp} label="Операція" options={fOps} />
              <FilterChip value={fExec} onChange={setFExec} label="Виконавець" options={fExecs} />
              <FilterChip value={fStatus} onChange={setFStatus} label="Статус" options={fStatuses} />
            </>
          )}

          {/* Тип файлу — такої колонки в таблиці немає, тому чіпи лишаються */}
          {fKinds.length > 1 && fKinds.map(({ key, count }) => {
            const meta = GROUP_META[key as keyof typeof GROUP_META];
            const on = fKind === key;
            return (
              <button key={key} onClick={() => setFKind(on ? '' : key)}
                className="k-chip press flex items-center gap-1.5 flex-shrink-0"
                style={on ? { borderColor: meta.color, color: meta.color } : undefined}
                title={meta.label}>
                <span className="w-1.5 h-1.5 flex-shrink-0" style={{ background: meta.color }} />
                {key === 'pdf' ? 'PDF' : key === 'dxf' ? 'DXF' : key === '3d' ? '3D' : 'Інші'}
                <span className="font-bold">{count}</span>
              </button>
            );
          })}

          {activeFilters.filter(f => f.key !== 'q' && f.key !== 'kind').map(f => (
            <button key={f.key} onClick={f.clear}
              className="k-chip press flex items-center gap-1 flex-shrink-0"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}
              title="Прибрати фільтр">
              {f.label}
              <X size={10} />
            </button>
          ))}

          {filterCount > 0 && (
            <>
              <button onClick={clearFilters} className="k-label press px-1 flex-shrink-0">Скинути</button>
              <span className="k-label whitespace-nowrap flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
                {filtered.filter(i => !i.group).length}/{real.length}
              </span>
            </>
          )}
        </div>

        {/* Групувати по збірках — показуємо лише коли збірки справді проставлені */}
        {hasAsm && (
          <button onClick={() => setByAsm(v => !v)}
            className="order-2 lg:order-3 flex items-center gap-1.5 px-2.5 py-[6px] rounded-lg text-[12px] font-bold flex-shrink-0 press transition-colors"
            style={byAsm
              ? { background: 'var(--violet-bg)', color: 'var(--violet)', boxShadow: 'inset 0 0 0 1px var(--violet-line)' }
              : { background: '#fff', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
            title="Групувати позиції по збірках; ті, що не входять у збірки — знизу">
            <Blocks size={13} />
            <span className="hidden xl:inline">Збірки</span>
          </button>
        )}

        {/* Картки / Таблиця — на телефоні цей перемикач стоїть у шапці */}
        <div className="order-2 lg:order-4 hidden lg:flex items-center rounded-lg bg-white overflow-hidden flex-shrink-0 ml-auto lg:ml-0"
          style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          {(['cards', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-2.5 py-[6px] text-[12px] font-bold transition-colors whitespace-nowrap"
              style={view === v ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-2)' }}>
              {v === 'cards' ? 'Картки' : 'Таблиця'}
            </button>
          ))}
        </div>

        </div>

        <OrderInsights
          order={header.projectId}
          items={real}
          gap={gap}
          onGap={setGap}
          onTool={t => {
            if (t === 'asm') setShowAsm(true);
            else if (t === 'purch') setShowPurch(true);
            else if (t === 'tmc') setShowTmc(true);
            else setShowCalc(true);
          }}
          refreshKey={insightsTick}
          onMasses={setMasses}
        />
      </div>

      {view === 'table' ? (
        <div className="flex-1 min-h-0 bg-white flex">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {/*
              На телефоні таблиця не влазить по ширині, тому вона живе
              в масштабованому шарі: двома пальцями або кнопками знизу.
              На ПК масштабувати нічого не треба — таблиця як була.
              Сам ItemsTable один: другий, прихований, дарма перемальовував
              би сотні рядків.
            */}
            {(() => {
              const table = (
                <ItemsTable
                  items={filtered.filter(i => !i.group)}
                  lists={lists}
                  mode={tableMode}
                  grouped={byAsm}
                  purchasedBy={purchByAsm}
                  onSave={(row, field, value) => onUpdateRow(row, field, value)}
                  onAddOp={setAddOpItem}
                  selected={selected}
                  onToggleRow={toggleRow}
                  onSelectRows={selectRows}
                  onPreview={setPreview}
                  previewRow={preview?.row ?? null}
                  rowStatusList={rowStatusList}
                />
              );
              return isNarrow
                ? <PinchZoom fitKey={`${header.headerRow}:${tableMode}:${byAsm}`}>{table}</PinchZoom>
                : <div className="flex flex-col flex-1 min-h-0">{table}</div>;
            })()}
          </div>

          {/* Креслення збоку: таблиця лишається на екрані */}
          {preview && (
            <div className="hidden lg:block flex-shrink-0 w-[42%] max-w-[760px] min-w-[380px]">
              <DrawingPane
                item={preview}
                items={filtered.filter(i => !i.group)}
                onPick={setPreview}
                onClose={() => setPreview(null)}
              />
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Позиції */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-4">
        {total === 0 && (
          <p className="text-center text-gray-400 text-[13px] py-14">У замовленні немає позицій</p>
        )}

        {sections.map(({ key, label, Icon, color, bg, list }) => {
          if (!list?.length) return null;
          return (
            <div key={key}>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 sticky top-0 z-10"
                style={{ background: bg, color }}
              >
                <Icon size={14} />
                <span className="text-[12px] font-bold">{label}</span>
                <span className="ml-auto text-[11px] font-semibold opacity-70">{list.length} поз.</span>
              </div>

              {/* Покупні цієї збірки — своїх карток вони не мають */}
              {byAsm && !!purchByAsm.get(label)?.length && (
                <div className="mb-2">
                  <PurchasedInline lines={purchByAsm.get(label)!} />
                </div>
              )}

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
            {/* Вага вибраного: маршрутні рядки одного креслення важать один раз */}
            {selKg.kg > 0 ? (
              <span className="font-mono font-normal text-white/60"
                title={`${selKg.files} креслень зі штампом · маршрутні рядки рахуються один раз`
                  + (selKg.missing ? ` · ще ${selKg.missing} без маси — прочитайте «ТМЦ і вага»` : '')}>
                {' · '}{selKg.kg.toFixed(1)} кг{selKg.missing ? ' +' : ''}
              </span>
            ) : selKg.missing > 0 && (
              <span className="font-mono font-normal text-white/40"
                title="Маса береться зі штампа — відкрийте «ТМЦ і вага»">
                {' · '}маси немає
              </span>
            )}
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
              {TOOLS.map(({ key, label, Icon, color, hint, ai }) => (
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
                    else if (key === 'purch') setShowPurch(true);
                    else if (key === 'asm') setShowAsm(true);
                    else if (key === 'tmc') setShowTmc(true);
                  }}
                  className="flex items-start gap-2.5 p-3 rounded-2xl ring-1 ring-gray-200/70 text-left press active:bg-gray-50">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '16', color }}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-bold leading-tight truncate">{label}</span>
                      {ai && <AiBadge small />}
                    </span>
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

      {/* Покупні вироби зі специфікацій складальних креслень */}
      {showPurch && (
        <div className={hide('purch')}>
          <PurchasedSheet
            detail={detail}
            onToast={onToast}
            onParsed={() => setInsightsTick(v => v + 1)}
            onMinimize={() => minimize('purch')}
            onClose={() => { setShowPurch(false); restore('purch'); setInsightsTick(v => v + 1); }}
          />
        </div>
      )}

      {/* Склад збірок: що в яку збірку входить */}
      {showAsm && (
        <div className={hide('asm')}>
          <AssemblySheet
            detail={detail}
            onToast={onToast}
            onRefresh={l => { setInsightsTick(v => v + 1); onRefresh(l); }}
            onParsed={() => setInsightsTick(v => v + 1)}
            onMinimize={() => minimize('asm')}
            onClose={() => { setShowAsm(false); restore('asm'); setInsightsTick(v => v + 1); }}
          />
        </div>
      )}

      {/* ТМЦ і вага: матеріал, товщина й маса зі штампа креслення */}
      {showTmc && (
        <div className={hide('tmc')}>
          <TmcSheet
            detail={detail}
            onToast={onToast}
            onRefresh={l => { setInsightsTick(v => v + 1); onRefresh(l); }}
            onParsed={() => setInsightsTick(v => v + 1)}
            onMinimize={() => minimize('tmc')}
            onClose={() => { setShowTmc(false); restore('tmc'); setInsightsTick(v => v + 1); }}
          />
        </div>
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
        className="k-input appearance-none pl-2.5 pr-6 py-1.5 rounded-xl text-[11px] font-bold outline-none max-w-[130px] truncate transition-colors"
        style={value
          ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
          : { background: 'var(--bg)', color: 'var(--ink-2)' }}>
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px]"
        style={{ color: value ? 'var(--accent)' : 'var(--ink-3)' }}>▼</span>
    </div>
  );
}
