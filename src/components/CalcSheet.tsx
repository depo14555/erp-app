// ================================================================
//  src/components/CalcSheet.tsx — 🧮 Прорахунок замовлення.
//  Ліворуч — позиції з часом і ціною (що вибрано, те й рахується),
//  праворуч — «картки»: групи позицій + інші витрати, з назвою для
//  рахунку («Порізка комплект металу 3мм») і прив'язкою оплати.
//  Зберігається в таблиці-хабі, тож бачать усі.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X, Calculator, Loader2, Plus, Trash2, Save, Clock, Layers,
  ArrowRight, Wallet, CheckSquare, Square, Scissors, CornerUpRight, Wrench,
} from 'lucide-react';
import { MinimizeButton } from './PageSheet';
import NestingSheet from './NestingSheet';
import { api } from '../api';
import { OrderDetail, OrderItem, CalcBundle, CalcData, CalcRowMeta } from '../types';
import { num, qtyOf, timeAllOf } from './ItemsTable';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onMinimize?: () => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Ціни записані в картку — оновити замовлення. */
  onApplied: () => void;
}

/** Класифікація групи — як це називається у нас і в рахунку. */
const KINDS = [
  'Порізка металу', 'Гнуття', 'Токарні роботи', 'Фрезерні роботи',
  'Зварювальні роботи', 'Покриття', 'Матеріал', 'Логістика', 'Інше',
];

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function uid(): string {
  return 'b' + Math.random().toString(36).slice(2, 9);
}

/** Позиція гнеться? Дивимось операцію картки. */
function isBend(i: OrderItem): boolean {
  return /гнут|гиб|гіб|бенд/i.test(String(i.op || ''));
}
/** Позиція ріжеться лазером? Файл креслення — DXF. */
function isDxf(i: OrderItem): boolean {
  return /\.dxf$/i.test(String(i.name || ''));
}

export default function CalcSheet({ detail, onClose, onMinimize, onToast, onApplied }: Props) {
  const items = useMemo(() => detail.items.filter(i => !i.group), [detail.items]);
  const [bundles, setBundles] = useState<CalcBundle[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<string>('');
  /** Ціни, введені тут і ще не записані в картку: row → ціна за 1 шт. */
  const [prices, setPrices] = useState<Record<number, string>>({});
  /** Гіби і час порізки по рядках. */
  const [meta, setMeta] = useState<Record<string, CalcRowMeta>>({});
  const [cutBusy, setCutBusy] = useState('');
  /** Картки за видами робіт — головний вигляд; таблиця позицій лишається під ним. */
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [openCard, setOpenCard] = useState<string>('cut');
  /** Розкрій розгортається в картці порізки — важкий, тому не одразу. */
  const [showNest, setShowNest] = useState(false);

  useEffect(() => {
    api.calcGet(detail.header.headerRow)
      .then(r => {
        setBundles(r.data?.bundles || []);
        setMeta(r.data?.meta || {});
        setUpdatedAt(r.data?.updatedAt || '');
        if (r.data?.bundles?.length) setActive(r.data.bundles[0].id);
      })
      .catch(e => onToast(e?.message || 'Не вдалося прочитати прорахунок', true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byRow = useMemo(() => new Map(items.map(i => [i.row, i])), [items]);
  /**
   * Ціна позиції: щойно введена → збережена в прорахунку → з картки.
   * Середня ланка й була дірою: ціни трималися лише в пам'яті вікна,
   * тому після «Зберегти прорахунок» у групах знову світилось 0,00.
   */
  const priceOf = (i: OrderItem) => {
    if (prices[i.row] !== undefined) return num(prices[i.row]);
    const saved = meta[String(i.row)]?.price;
    return saved !== undefined ? saved : num(i.clientPrice);
  };
  const sumOf = (i: OrderItem) => priceOf(i) * qtyOf(i);

  /** Рядки, які вже лежать у якійсь групі. */
  const taken = useMemo(() => {
    const s = new Set<number>();
    bundles.forEach(b => b.rows.forEach(r => s.add(r)));
    return s;
  }, [bundles]);

  const metaOf = (row: number): CalcRowMeta => meta[String(row)] || {};
  /** Гібів на всю призначену кількість. */
  const bendsAll = (i: OrderItem) => (metaOf(i.row).bends || 0) * qtyOf(i);
  /** Вартість гнуття позиції: гіби × ціна за гіб. */
  const bendSum = (i: OrderItem) => bendsAll(i) * (metaOf(i.row).bendPrice || 0);
  /** Час порізки позиції, год. */
  const cutHours = (i: OrderItem) => (metaOf(i.row).cutMin || 0) * qtyOf(i) / 60;

  const totals = useMemo(() => {
    let time = 0, sum = 0, bends = 0, bendCost = 0, cut = 0;
    items.forEach(i => {
      time += timeAllOf(i);
      sum += sumOf(i);
      bends += bendsAll(i);
      bendCost += bendSum(i);
      cut += cutHours(i);
    });
    const extras = bundles.reduce((s, b) => s + b.extras.reduce((x, e) => x + (e.sum || 0), 0), 0);
    return { time, sum, extras, bends, bendCost, cut, all: sum + extras + bendCost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prices, bundles, meta]);

  /**
   * КАРТКИ ЗА ВИДАМИ РОБІТ. Рахують не «позицію за позицією», а
   * «порізка стільки, гнуття стільки» — так, як це тримають у голові
   * і як воно потім лягає в рахунок. Позиція з маршрутом «лазер →
   * гнуття» чесно живе у двох картках: це дві різні роботи.
   */
  const opCards = useMemo(() => {
    const map = new Map<string, { key: string; label: string; kind: string; rows: OrderItem[] }>();
    items.forEach(i => {
      const op = String(i.op || '').trim();
      // Групуємо за ВИДОМ РОБОТИ, а не за типом файла: позиція з операцією
      // «Лазер» належить до порізки, навіть якщо DXF до неї ще не приклали
      const key = /лазер|порізк|різ/i.test(op) ? 'cut'
        : isBend(i) ? 'bend'
        : op ? 'op:' + op.toLowerCase()
        : 'none';
      const label = key === 'cut' ? 'Лазерна порізка'
        : key === 'bend' ? 'Гнуття'
        : op || 'Без операції';
      const kind = key === 'cut' ? 'Порізка металу'
        : key === 'bend' ? 'Гнуття'
        : /токар/i.test(op) ? 'Токарні роботи'
        : /фрез/i.test(op) ? 'Фрезерні роботи'
        : /сл\.?св|зварю/i.test(op) ? 'Зварювальні роботи'
        : /фарб|покрит/i.test(op) ? 'Покриття'
        : 'Інше';
      const cur = map.get(key) || { key, label, kind, rows: [] };
      cur.rows.push(i);
      map.set(key, cur);
    });
    const order = ['cut', 'bend'];
    return [...map.values()].sort((a, b) => {
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.label.localeCompare(b.label, 'uk');
    });
  }, [items, meta]);

  /**
   * Що вже дав розкрій. Вікно розкрою кладе в групи рядок витрат
   * «лазерна порізка … м, врізок …, листів …» — з нього й читаємо,
   * щоб картка показувала стан, а не порожнечу.
   */
  const nestInfo = useMemo(() => {
    const lines = bundles.flatMap(b => b.extras).filter(e => /порізк|лист/i.test(e.label));
    if (!lines.length) return '';
    const sum = lines.reduce((s, e) => s + (e.sum || 0), 0);
    return `${lines.length} розкладка${lines.length > 1 ? 'и' : ''} · ${money(sum)} грн`;
  }, [bundles]);

  const cardSum = (rows: OrderItem[]) => rows.reduce((s, i) => s + sumOf(i) + bendSum(i), 0);
  const cardTime = (rows: OrderItem[]) => rows.reduce((s, i) => s + timeAllOf(i) + cutHours(i), 0);

  /** Одна ціна на всі позиції картки — найчастіша дія при прорахунку. */
  function priceCard(rows: OrderItem[], raw: string) {
    const v = num(raw);
    setPrices(p => {
      const n = { ...p };
      rows.forEach(i => { n[i.row] = raw; });
      return n;
    });
    setMeta(m => {
      const n = { ...m };
      rows.forEach(i => {
        const cur = { ...(n[String(i.row)] || {}) };
        if (v > 0) cur.price = v; else delete cur.price;
        if (Object.keys(cur).length) n[String(i.row)] = cur; else delete n[String(i.row)];
      });
      return n;
    });
  }

  /** Рахунок збирається з карток: одна картка — один рядок рахунку. */
  function bundlesFromCards() {
    const made: CalcBundle[] = opCards
      .filter(c => c.rows.length)
      .map(c => {
        const old = bundles.find(b => b.kind === c.kind);
        return {
          id: old?.id || uid(),
          kind: c.kind,
          invoiceName: old?.invoiceName || `${c.label} — ${detail.header.orderNum || detail.header.projectId}`,
          payTo: old?.payTo || 'client',
          rows: c.rows.map(i => i.row),
          extras: old?.extras || [],
          note: old?.note || '',
        } as CalcBundle;
      });
    // рядки витрат із розкрою не втрачаємо — вони живуть у своїх групах
    const keep = bundles.filter(b => !made.some(m => m.kind === b.kind) && b.extras.length);
    setBundles([...made, ...keep]);
    setActive(made[0]?.id || '');
    onToast(`📋 Рахунок зібрано з ${made.length} карток`);
  }

  function setMetaVal(row: number, key: keyof CalcRowMeta, raw: string) {
    const v = num(raw);
    setMeta(m => {
      const cur = { ...(m[String(row)] || {}) };
      if (v > 0) cur[key] = v; else delete cur[key];
      const next = { ...m };
      if (Object.keys(cur).length) next[String(row)] = cur; else delete next[String(row)];
      return next;
    });
  }

  /**
   * Час лазерної порізки — рахується з самих креслень: довжина різу
   * ділиться на швидкість для товщини, плюс врізки (кожен замкнений
   * контур — одна врізка). Ті самі таблиці, що й у модулі розкрою.
   */
  async function cutFromDxf() {
    setCutBusy('Читаю перелік DXF…');
    try {
      const list = await api.nestItems(detail.header.headerRow);
      const dxf = list.items || [];
      if (!dxf.length) { onToast('У картці немає позицій із DXF-посиланням', true); return; }
      const nest = await import('../lib/nesting');
      const next: Record<string, CalcRowMeta> = { ...meta };
      let done = 0, failed = 0;
      for (const it of dxf) {
        setCutBusy(`Рахую ${done + 1} з ${dxf.length}: ${it.fileName}`);
        try {
          const fd = await api.fileData(it.fileId);
          const text = decodeURIComponent(escape(atob(fd.base64)));
          const parsed: any = (nest as any).parseDxf(text);
          // Таблиці швидкості й тарифу читають ключ «матеріал · товщина».
          // Раніше сюди йшла сама товщина — ключ не розпізнавався,
          // і час рахувався з запасною швидкістю 2 м/хв для будь-якої сталі.
          const key = `${it.material || 'Ст.3'} · ${String(it.thickness || '').replace('.', ',')}`;
          const speed = (nest as any).suggestSpeed(key) || 2;         // м/хв
          const pierce = (nest as any).suggestPierceSec(key) || 0.5;  // с на врізку
          const perM = (nest as any).suggestPerM(key) || 0;           // грн/м різу
          const lenM = parsed.cutLen / 1000;
          const loops = parsed.loops || 1;
          const min = lenM / speed + loops * pierce / 60;
          const cur = { ...(next[String(it.row)] || {}) };
          cur.cutMin = Math.round(min * 1000) / 1000;
          // Тариф постачальника: 1 врізка = 100 мм різу
          if (perM) cur.cutPrice = Math.round((lenM + loops * 0.1) * perM * 100) / 100;
          next[String(it.row)] = cur;
          done++;
        } catch { failed++; }
      }
      setMeta(next);
      onToast(failed
        ? `Час порізки порахувано для ${done} з ${dxf.length} (не вдалось: ${failed})`
        : `✅ Час порізки порахувано для ${done} позицій`, failed > 0);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося порахувати час порізки', true);
    } finally {
      setCutBusy('');
    }
  }

  function bundleSum(b: CalcBundle): number {
    const rows = b.rows.reduce((s, r) => { const i = byRow.get(r); return s + (i ? sumOf(i) : 0); }, 0);
    return rows + b.extras.reduce((s, e) => s + (e.sum || 0), 0);
  }
  function bundleTime(b: CalcBundle): number {
    return b.rows.reduce((s, r) => { const i = byRow.get(r); return s + (i ? timeAllOf(i) : 0); }, 0);
  }
  function patch(id: string, p: Partial<CalcBundle>) {
    setBundles(prev => prev.map(b => (b.id === id ? { ...b, ...p } : b)));
  }

  function addBundle() {
    const b: CalcBundle = {
      id: uid(), kind: KINDS[0], invoiceName: '', payTo: 'client',
      rows: [...sel], extras: [], note: '',
    };
    setBundles(prev => [...prev, b]);
    setActive(b.id);
    setSel(new Set());
  }
  function addSelected(id: string) {
    if (!sel.size) return;
    patch(id, { rows: [...new Set([...(bundles.find(b => b.id === id)?.rows || []), ...sel])] });
    setSel(new Set());
  }

  async function save() {
    setSaving(true);
    try {
      const data: CalcData = { bundles, meta };
      const res = await api.calcSave(detail.header.headerRow, data);
      setUpdatedAt(res.updatedAt);
      const n = res.bundles;
      const word = n % 10 === 1 && n % 100 !== 11 ? 'група' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'групи' : 'груп');
      onToast(`💾 Прорахунок збережено · ${n} ${word}`);
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setSaving(false);
    }
  }

  /** Позиції, для яких порахований тариф різу, але ціна ще інша. */
  const cutPriced = useMemo(
    () => items.filter(i => {
      const c = metaOf(i.row).cutPrice;
      return !!c && c !== priceOf(i);
    }).map(i => i.row),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, meta, prices]
  );

  /**
   * Тариф різу стає ціною за штуку. Саме це й питають найчастіше:
   * «є 150 деталей і тариф — порахуй». Ставимо ціну кожній позиції,
   * далі сума рахується як завжди: к-сть × ціна.
   */
  function priceFromCut() {
    if (!cutPriced.length) return;
    const nextPrices = { ...prices };
    setMeta(m => {
      const next = { ...m };
      cutPriced.forEach(r => {
        const c = next[String(r)]?.cutPrice;
        if (!c) return;
        next[String(r)] = { ...next[String(r)], price: c };
        nextPrices[r] = String(c);
      });
      return next;
    });
    setPrices(nextPrices);
    onToast(`✂️ Ціну з тарифу різу поставлено ${cutPriced.length} позиціям`);
  }

  /** Час на одну деталь у годинах — з хвилин різу, порахованих із DXF. */
  const hoursOf = (i: OrderItem) => {
    const m = metaOf(i.row).cutMin || 0;
    return m ? Math.round((m / 60) * 1000) / 1000 : 0;
  };

  /**
   * Що з прорахунку ще не стоїть у картці: ціна за штуку і час різу.
   * Беремо і щойно введене, і збережене раніше — після перевідкриття
   * вікна кнопка має працювати так само.
   */
  const pending = useMemo(() => {
    const out: Array<{ row: number; fields: Record<string, string> }> = [];
    items.forEach(i => {
      const fields: Record<string, string> = {};
      const p = priceOf(i);
      if (p > 0 && p !== num(i.clientPrice)) fields.clientPrice = String(p);
      const h = hoursOf(i);
      if (h > 0 && h !== num(i.time)) fields.time = String(h);
      if (Object.keys(fields).length) out.push({ row: i.row, fields });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prices, meta]);
  const pendingPrices = pending;

  /**
   * Записуємо в картку те, що порахували: ціну за штуку в «Ціна клієнту»
   * і час різу в «Час на виконання». Одним запитом на всі рядки —
   * erp.rowsUpdate саме для цього: у кожного рядка свої значення.
   */
  async function applyPrices() {
    const rows = pending.filter(p => byRow.has(p.row));
    if (!rows.length) { onToast('Немає що записувати — усе вже в картці', true); return; }
    setSaving(true);
    try {
      const res = await api.rowsUpdate(rows);
      const withTime = rows.filter(r => r.fields.time).length;
      const withPrice = rows.filter(r => r.fields.clientPrice).length;
      onToast(`✅ У картку: ціни ${withPrice} поз.${withTime ? ` · час різу ${withTime} поз.` : ''} (${res.cells} значень)`);
      setPrices({});
      onApplied();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося записати в картку', true);
    } finally {
      setSaving(false);
    }
  }

  /** Ціна за гіб одна на замовлення — тримаємо її в meta кожного гнутого рядка. */
  const bendPriceAll = useMemo(() => {
    const vals = items.filter(isBend).map(i => metaOf(i.row).bendPrice).filter(v => v);
    return vals.length ? String(vals[0]) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, meta]);

  function applyBendPrice(raw: string) {
    const v = num(raw);
    setMeta(m => {
      const next = { ...m };
      items.filter(isBend).forEach(i => {
        const cur = { ...(next[String(i.row)] || {}) };
        if (v > 0) cur.bendPrice = v; else delete cur.bendPrice;
        if (Object.keys(cur).length) next[String(i.row)] = cur; else delete next[String(i.row)];
      });
      return next;
    });
  }

  function toggleRow(row: number) {
    setSel(prev => { const n = new Set(prev); n.has(row) ? n.delete(row) : n.add(row); return n; });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative w-full lg:w-[1180px] max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Calculator size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Прорахунок</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {updatedAt ? ` · збережено ${updatedAt}` : ' · ще не збережено'}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 mr-2">
            <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              <Clock size={11} className="inline -mt-0.5" /> {totals.time.toFixed(1)} год
            </span>
            <span className="text-[14px] font-bold tabular-nums">{money(totals.all)} грн</span>
          </div>
          <div className="flex items-center rounded-lg overflow-hidden mr-1"
            style={{ boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
            {([['cards', 'Роботи'], ['table', 'Позиції']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className="px-2.5 py-[5px] text-[11.5px] font-bold transition-colors"
                style={view === v ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-2)' }}>
                {label}
              </button>
            ))}
          </div>
          {onMinimize && <MinimizeButton onClick={onMinimize} />}
          <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
        ) : view === 'cards' ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5" style={{ background: 'var(--bg)' }}>
              {opCards.map(card => {
                const on = openCard === card.key;
                const isCut = card.key === 'cut';
                const isBendCard = card.key === 'bend';
                const sum = cardSum(card.rows);
                const withPrice = card.rows.filter(i => priceOf(i) > 0).length;
                return (
                  <div key={card.key} className="card overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <button onClick={() => setOpenCard(on ? '' : card.key)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left press">
                      <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                        style={isCut ? { background: 'var(--blue-bg)', color: 'var(--blue)' }
                          : isBendCard ? { background: 'var(--amber-bg)', color: 'var(--amber)' }
                          : { background: 'var(--bg)', color: 'var(--ink-2)' }}>
                        {isCut ? <Scissors size={14} /> : isBendCard ? <CornerUpRight size={14} /> : <Wrench size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold truncate">{card.label}</span>
                        <span className="k-label">
                          {card.rows.length} поз. · ціна є в {withPrice}
                          {cardTime(card.rows) > 0 ? ` · ${cardTime(card.rows).toFixed(1)} год` : ''}
                        </span>
                      </span>
                      {withPrice < card.rows.length && (
                        <span className="k-chip" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                          нема ціни: {card.rows.length - withPrice}
                        </span>
                      )}
                      <span className="k-value text-[14px] whitespace-nowrap">{sum ? money(sum) : '—'}</span>
                    </button>

                    {on && (
                      <div className="px-3 pb-3 border-t hairline pt-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                          {isCut ? (
                            <>
                              <span className="k-label">Тариф різу з креслень</span>
                              <button onClick={cutFromDxf} disabled={!!cutBusy || saving}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold press disabled:opacity-50"
                                style={{ background: 'var(--blue-bg)', color: 'var(--blue)', boxShadow: 'inset 0 0 0 1px var(--blue-line)' }}>
                                {cutBusy ? <Loader2 size={11} className="animate-spin" /> : <Scissors size={11} />}
                                {cutBusy || 'Перерахувати з DXF'}
                              </button>
                              {cutPriced.length > 0 && (
                                <button onClick={priceFromCut}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold press"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
                                  <CornerUpRight size={11} /> Тариф → ціна ({cutPriced.length})
                                </button>
                              )}
                            </>
                          ) : isBendCard ? (
                            <>
                              <span className="k-label">Ціна за один гіб</span>
                              <input value={bendPriceAll} onChange={e => applyBendPrice(e.target.value)}
                                inputMode="decimal" placeholder="0"
                                className="k-input w-[74px] px-2 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                              <span className="k-label">гібів усього: {totals.bends || '—'}</span>
                            </>
                          ) : (
                            <span className="k-label">Ціна ставиться руками — цю роботу з креслення не порахувати</span>
                          )}
                          <span className="ml-auto flex items-center gap-1.5">
                            <span className="k-label">одна ціна на всі</span>
                            <input inputMode="decimal" placeholder="0"
                              onChange={e => priceCard(card.rows, e.target.value)}
                              className="k-input w-[74px] px-2 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                          </span>
                        </div>

                        <table className="w-full border-collapse text-[12px]">
                          <tbody>
                            {card.rows.map(i => (
                              <tr key={i.row} className="border-t hairline">
                                <td className="py-[5px] pr-2 truncate" style={{ maxWidth: 0, width: '100%' }} title={i.name}>
                                  {i.name}
                                  {metaOf(i.row).cutPrice ? (
                                    <span className="k-label">тариф різу {money(metaOf(i.row).cutPrice as number)} грн/шт</span>
                                  ) : null}
                                </td>
                                <td className="py-[5px] px-1 text-right font-mono text-[11.5px] whitespace-nowrap"
                                  style={{ color: 'var(--ink-3)' }}>{qtyOf(i) || '—'} шт</td>
                                <td className="py-[5px] px-1 w-[84px]">
                                  <input value={prices[i.row] ?? metaOf(i.row).price ?? i.clientPrice ?? ''}
                                    onChange={e => {
                                      setPrices(p => ({ ...p, [i.row]: e.target.value }));
                                      setMetaVal(i.row, 'price', e.target.value);
                                    }}
                                    inputMode="decimal" placeholder="0"
                                    className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                                </td>
                                <td className="py-[5px] pl-1 text-right font-mono font-semibold whitespace-nowrap w-[86px]">
                                  {sumOf(i) ? money(sumOf(i)) : <span className="k-empty">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {isCut && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap rounded-lg px-2.5 py-2"
                              style={{ background: 'var(--blue-bg)', boxShadow: 'inset 0 0 0 1px var(--blue-line)' }}>
                              <span className="text-[12px] font-bold" style={{ color: 'var(--blue)' }}>Розкрій на листи</span>
                              <span className="k-label" style={nestInfo ? { color: 'var(--blue)' } : undefined}>
                                {nestInfo || 'ще не розкладали'}
                              </span>
                              <button onClick={() => setShowNest(v => !v)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold press ml-auto"
                                style={showNest
                                  ? { background: 'var(--surface)', color: 'var(--blue)', boxShadow: 'inset 0 0 0 1px var(--blue-line)' }
                                  : { background: 'var(--blue)', color: '#fff' }}>
                                <Scissors size={11} /> {showNest ? 'Згорнути розкрій' : nestInfo ? 'Перерозкласти' : 'Розкласти на листи'}
                              </button>
                            </div>
                            {/* Сам розкрій — тут же: листи, вага, залишок, вартість різу */}
                            {showNest && (
                              <NestingSheet embedded detail={detail} onToast={onToast} onClose={() => setShowNest(false)} />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="card overflow-hidden" style={{ background: 'var(--surface)' }}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}><Plus size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold">Інші витрати</span>
                    <span className="k-label">метал, доставка, покриття — усе, чого немає в кресленнях</span>
                  </span>
                  <span className="k-value text-[14px]">{totals.extras ? money(totals.extras) : '—'}</span>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2 flex-wrap"
              style={{ background: 'var(--surface)' }}>
              <span className="k-label">Разом по замовленню</span>
              <span className="k-value text-[15px]">{money(totals.all)} грн</span>
              <button onClick={bundlesFromCards}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold press ml-auto"
                style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
                <Layers size={12} /> Зібрати рахунок ({opCards.length})
              </button>
              <button onClick={applyPrices} disabled={saving || !pending.length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold press disabled:opacity-40"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Записати в картку{pending.length ? ` (${pending.length})` : ''}
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold press"
                style={{ background: 'var(--green)', color: '#fff' }}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Зберегти
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(380px,460px)]">

            {/* ЛІВОРУЧ: позиції */}
            <div className="flex flex-col min-h-0 border-r hairline">
              <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
                <button onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map(i => i.row)))}
                  className="p-1 press" aria-label="Вибрати все">
                  {sel.size === items.length && items.length > 0
                    ? <CheckSquare size={15} className="text-[var(--accent)]" />
                    : <Square size={15} className="text-gray-300" />}
                </button>
                <p className="text-[12px] font-bold flex-1">
                  Позиції <span style={{ color: 'var(--ink-3)' }}>({items.length})</span>
                </p>
                {sel.size > 0 && (
                  <button onClick={addBundle}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold text-white press"
                    style={{ background: '#0D9488' }}>
                    <Layers size={12} /> Об'єднати {sel.size} у групу
                  </button>
                )}
                {sel.size > 0 && active && (
                  <button onClick={() => addSelected(active)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <ArrowRight size={12} /> у відкриту
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-auto thin-scrollbar">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-[var(--bg)] z-10">
                    <tr>
                      {['', 'Найменування', 'Призн.', 'Гібів/шт', 'Порізка хв/шт', 'Час всього', 'Ціна/шт', 'Сума'].map((h, i) => (
                        <th key={i} className="text-left font-semibold text-[10.5px] uppercase tracking-wide text-[var(--ink-3)] px-2 py-2 border-b hairline whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(i => {
                      const inBundle = taken.has(i.row);
                      return (
                        <tr key={i.row} className="border-b hairline hover:bg-[var(--bg)]"
                          style={sel.has(i.row) ? { background: 'var(--accent-soft)' } : undefined}>
                          <td className="px-2 py-1.5 w-[32px]">
                            <button onClick={() => toggleRow(i.row)} className="flex press" aria-label="Вибрати">
                              {sel.has(i.row)
                                ? <CheckSquare size={14} className="text-[var(--accent)]" />
                                : <Square size={14} className="text-gray-300" />}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 max-w-[260px]">
                            <span className="block truncate">{i.name}</span>
                            <span className="block text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>
                              {[i.assembly, i.op, i.material, i.thickness && `S${i.thickness}`].filter(Boolean).join(' · ') || i.id}
                              {inBundle && <span className="text-teal-600 font-bold"> · у групі</span>}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{qtyOf(i) || '—'}</td>

                          {/* Гіби — лише там, де операція справді гнуття */}
                          <td className="px-1 py-1 w-[74px]">
                            {isBend(i) ? (
                              <input
                                value={metaOf(i.row).bends ?? ''}
                                onChange={e => setMetaVal(i.row, 'bends', e.target.value)}
                                inputMode="decimal" placeholder="0"
                                title={bendsAll(i) ? `Всього гібів: ${bendsAll(i)}` : 'Кількість гібів на одній деталі'}
                                className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right"
                              />
                            ) : (
                              <span className="block text-center" style={{ color: 'var(--ink-3)' }}>—</span>
                            )}
                          </td>

                          {/* Час порізки — лише для DXF */}
                          <td className="px-1 py-1 w-[84px]">
                            {isDxf(i) ? (
                              <input
                                value={metaOf(i.row).cutMin ?? ''}
                                onChange={e => setMetaVal(i.row, 'cutMin', e.target.value)}
                                inputMode="decimal" placeholder="0"
                                title={cutHours(i) ? `На всі: ${cutHours(i).toFixed(2)} год` : 'Хвилин різу на одну деталь'}
                                className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right"
                              />
                            ) : (
                              <span className="block text-center" style={{ color: 'var(--ink-3)' }}>—</span>
                            )}
                            {/* Тариф різу з DXF: скільки коштує розрізати ОДНУ деталь */}
                            {metaOf(i.row).cutPrice ? (
                              <span className="block text-[9.5px] text-right mt-0.5 tabular-nums" style={{ color: '#0369A1' }}
                                title="Довжина контуру за тарифом товщини + врізки (1 врізка = 100 мм різу)">
                                {money(metaOf(i.row).cutPrice!)} грн/шт
                              </span>
                            ) : null}
                          </td>

                          <td className="px-2 py-1.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                            {timeAllOf(i) ? `${timeAllOf(i).toFixed(2)} год` : '—'}
                          </td>
                          <td className="px-1 py-1 w-[86px]">
                            <input
                              value={prices[i.row] ?? metaOf(i.row).price ?? i.clientPrice ?? ''}
                              // пишемо і в meta — це те, що йде в «Зберегти прорахунок»
                              onChange={e => {
                                setPrices(p => ({ ...p, [i.row]: e.target.value }));
                                setMetaVal(i.row, 'price', e.target.value);
                              }}
                              inputMode="decimal" placeholder="0"
                              className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums font-semibold whitespace-nowrap">
                            {sumOf(i) ? money(sumOf(i)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Гнуття: одна ціна за гіб на все замовлення */}
              {totals.bends > 0 && (
                <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2 flex-wrap bg-amber-50/60">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: 'var(--amber)' }}>
                    <CornerUpRight size={13} /> Гнуття: {totals.bends} гібів
                  </span>
                  <label className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    ціна за гіб
                    <input
                      value={bendPriceAll}
                      onChange={e => applyBendPrice(e.target.value)}
                      inputMode="decimal" placeholder="0"
                      className="k-input w-[74px] px-2 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right"
                    />
                  </label>
                  <span className="text-[11.5px] font-bold tabular-nums" style={{ color: 'var(--amber)' }}>
                    = {money(totals.bendCost)} грн
                  </span>
                </div>
              )}

              <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  Час: <b style={{ color: 'var(--ink-2)' }}>{totals.time.toFixed(1)} год</b> ·
                  Роботи: <b style={{ color: 'var(--ink-2)' }}>{money(totals.sum)}</b> ·
                  Інші: <b style={{ color: 'var(--ink-2)' }}>{money(totals.extras)}</b>
                  {totals.cut > 0 && <> · Порізка: <b style={{ color: 'var(--ink-2)' }}>{totals.cut.toFixed(2)} год</b></>}
                </span>
                <button onClick={cutFromDxf} disabled={!!cutBusy || saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-50"
                  style={{ background: '#E0F2FE', color: '#0369A1' }}
                  title="Прочитати DXF і порахувати час різу за довжиною контурів і врізками">
                  {cutBusy ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                  {cutBusy || 'Час порізки з DXF'}
                </button>
                {cutPriced.length > 0 && (
                  <button onClick={priceFromCut} disabled={saving || !!cutBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-50"
                    style={{ background: '#E0F2FE', color: '#0369A1' }}
                    title="Поставити тариф різу як ціну за штуку. Якщо в групі вже стоїть рядок витрат «лазерна порізка», приберіть його — інакше порізка порахується двічі">
                    <CornerUpRight size={12} /> Тариф → ціна ({cutPriced.length})
                  </button>
                )}
                <button onClick={applyPrices} disabled={saving || !pendingPrices.length}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-40"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  title="Прорахунок зберігається окремо; ця кнопка ставить у картку ціну за штуку («Ціна клієнту») і час різу («Час на виконання»)">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {saving ? 'Записую…' : `Записати в картку${pending.length ? ` (${pending.length})` : ''}`}
                </button>
              </div>
            </div>

            {/* ПРАВОРУЧ: групи-картки */}
            <div className="flex flex-col min-h-0 bg-[var(--bg)]">
              <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b hairline">
                <p className="text-[12px] font-bold flex-1">Групи для рахунку ({bundles.length})</p>
                <button onClick={addBundle}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold press"
                  style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}>
                  <Plus size={12} /> Нова
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                {!bundles.length && (
                  <p className="text-center text-[12px] py-10" style={{ color: 'var(--ink-3)' }}>
                    Виберіть позиції ліворуч і натисніть «Об'єднати у групу».<br />
                    Група — це один рядок майбутнього рахунку.
                  </p>
                )}

                {bundles.map(b => {
                  const on = active === b.id;
                  return (
                    <div key={b.id}
                      onClick={() => setActive(b.id)}
                      className={`rounded-2xl bg-white p-2.5 ring-1 transition-colors ${on ? 'ring-teal-300' : 'ring-gray-200/70'}`}>
                      <div className="flex items-center gap-1.5">
                        <select value={b.kind} onChange={e => patch(b.id, { kind: e.target.value })}
                          className="k-input px-2 py-1 rounded-lg bg-teal-50 text-teal-700 text-[11.5px] font-bold outline-none">
                          {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                          {!KINDS.includes(b.kind) && <option value={b.kind}>{b.kind}</option>}
                        </select>
                        <span className="ml-auto text-[13px] font-bold tabular-nums">{money(bundleSum(b))} грн</span>
                        <button onClick={() => setBundles(prev => prev.filter(x => x.id !== b.id))}
                          className="p-1 rounded-lg press text-red-500" aria-label="Видалити групу">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <input
                        value={b.invoiceName}
                        onChange={e => patch(b.id, { invoiceName: e.target.value })}
                        placeholder="Назва в рахунку — напр. «Порізка комплект металу 3мм»"
                        className="k-input mt-1.5 w-full px-2 py-1.5 rounded-lg outline-none text-[12px]"
                      />

                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          <Wallet size={10} className="inline -mt-0.5" /> оплата:
                        </span>
                        {([['client', 'клієнт нам'], ['executor', 'ми виконавцю']] as const).map(([v, label]) => (
                          <button key={v} onClick={() => patch(b.id, { payTo: v })}
                            className="px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors"
                            style={b.payTo === v
                              ? { background: v === 'client' ? 'var(--green-bg)' : '#FFF7ED', color: v === 'client' ? 'var(--green)' : 'var(--amber)' }
                              : { background: 'var(--bg)', color: 'var(--ink-3)' }}>
                            {label}
                          </button>
                        ))}
                        <span className="ml-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          {b.rows.length} поз. · {bundleTime(b).toFixed(1)} год
                        </span>
                      </div>

                      {/* Позиції групи */}
                      {b.rows.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {b.rows.map(r => {
                            const i = byRow.get(r);
                            if (!i) return null;
                            return (
                              <div key={r} className="flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded-lg bg-gray-50">
                                <span className="flex-1 truncate">{i.name}</span>
                                {/*
                                  «120×0,00 → 0,00» читалось як множення на нуль
                                  і збивало з пантелику. Коли ціни на позицію
                                  немає, показуємо просто кількість: гроші цієї
                                  групи сидять у рядку витрат нижче.
                                */}
                                <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}
                                  title={priceOf(i) ? 'кількість × ціна за 1 шт' : 'ціну за позицію не проставлено'}>
                                  {priceOf(i) ? `${qtyOf(i)}×${money(priceOf(i))}` : `${qtyOf(i)} шт`}
                                </span>
                                <span className="tabular-nums font-semibold flex-shrink-0"
                                  style={sumOf(i) ? undefined : { color: 'var(--line-2)', fontWeight: 400 }}>
                                  {sumOf(i) ? money(sumOf(i)) : '—'}
                                </span>
                                <button onClick={() => patch(b.id, { rows: b.rows.filter(x => x !== r) })}
                                  className="p-0.5 press flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-label="Прибрати">
                                  <X size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Інші витрати */}
                      <div className="mt-1.5 space-y-0.5">
                        {b.extras.map((e, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <input value={e.label}
                              onChange={ev => patch(b.id, { extras: b.extras.map((x, k) => k === idx ? { ...x, label: ev.target.value } : x) })}
                              placeholder="Витрата — напр. «метал 3мм, лист»"
                              className="k-input flex-1 min-w-0 px-2 py-1 rounded-lg outline-none text-[11.5px]" />
                            <input value={e.sum || ''}
                              onChange={ev => patch(b.id, { extras: b.extras.map((x, k) => k === idx ? { ...x, sum: num(ev.target.value) } : x) })}
                              inputMode="decimal" placeholder="0"
                              className="k-input w-[84px] px-2 py-1 rounded-lg outline-none text-[11.5px] tabular-nums text-right" />
                            <button onClick={() => patch(b.id, { extras: b.extras.filter((_, k) => k !== idx) })}
                              className="p-1 press text-red-500 flex-shrink-0" aria-label="Прибрати витрату">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => patch(b.id, { extras: [...b.extras, { label: '', sum: 0 }] })}
                          className="text-[11px] font-bold press px-1.5 py-1 rounded-lg" style={{ color: 'var(--accent)' }}>
                          + інші витрати (порізка, метал, доставка…)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex-shrink-0 border-t hairline p-2.5 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[12px] font-bold">Разом по замовленню</span>
                  <span className="text-[16px] font-bold tabular-nums">{money(totals.all)} грн</span>
                </div>
                <button onClick={save} disabled={saving}
                  className="w-full py-2.5 rounded-2xl font-bold text-[13.5px] text-white press disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#0D9488' }}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Зберегти прорахунок
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
