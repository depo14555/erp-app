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
import { OrderDetail, OrderItem, CalcBundle, CalcData, CalcRowMeta, CalcNest, CalcLine } from '../types';
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

/** Найчастіші витрати, яких немає в кресленнях — щоб не набирати руками. */
const EXTRA_PRESETS = ['Метал', 'Доставка', 'Порошкове фарбування', 'Оцинкування', 'Кріплення', 'Пакування'];

/** Рядок «Інших витрат» в UI: суму тримаємо текстом, щоб «12,5» дописувалось. */
interface ExtraRow { label: string; sumTxt: string }

function money(n: number): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function uid(): string {
  return 'b' + Math.random().toString(36).slice(2, 9);
}

/** Позиція гнеться? Дивимось операцію картки. */
export function isBend(i: OrderItem): boolean {
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
  /** Інші витрати замовлення: метал, доставка, покриття. */
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [openExtras, setOpenExtras] = useState(false);
  /** Зафіксовані розкладки — щоб після закриття вікна вони не зникали. */
  const [nests, setNests] = useState<CalcNest[]>([]);
  /** Ціна за один гіб — одна на замовлення. */
  const [bendPrice, setBendPrice] = useState('');
  /** Стан збереження: показуємо одразу, звіряємо потім. */
  const [saveState, setSaveState] = useState<'' | 'saving' | 'ok' | 'bad'>('');

  useEffect(() => {
    api.calcGet(detail.header.headerRow)
      .then(r => {
        setBundles(r.data?.bundles || []);
        setMeta(r.data?.meta || {});
        setExtras((r.data?.extras || []).map(e => ({ label: e.label, sumTxt: e.sum ? String(e.sum) : '' })));
        setNests(r.data?.nests || []);
        setBendPrice(r.data?.bendPrice ? String(r.data.bendPrice) : '');
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
  /** Гібів на одній деталі — лише для операції гнуття. */
  const bendsOf = (i: OrderItem) => (isBend(i) ? metaOf(i.row).bends || 0 : 0);
  /** Гібів на всю призначену кількість. */
  const bendsAll = (i: OrderItem) => bendsOf(i) * qtyOf(i);
  /** Ціна гіба для позиції: власна, якщо є, інакше спільна на замовлення. */
  const bendPriceOf = (i: OrderItem) => metaOf(i.row).bendPrice || num(bendPrice);
  /** Вартість гнуття позиції: гіби × ціна за гіб. */
  const bendSum = (i: OrderItem) => bendsAll(i) * bendPriceOf(i);
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
    // Витрати живуть у двох місцях: власний список замовлення й старі
    // рядки всередині груп рахунку — беремо обидва, щоб нічого не з'їло.
    const ex = extras.reduce((s, e) => s + num(e.sumTxt), 0)
      + bundles.reduce((s, b) => s + b.extras.reduce((x, e) => x + (e.sum || 0), 0), 0);
    // Гіби окремо в суму НЕ йдуть: вони входять у ціну за штуку кнопкою
    // «Гіби → ціна». Інакше та сама робота порахувалась би двічі.
    return { time, sum, extras: ex, bends, bendCost, cut, all: sum + ex };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prices, bundles, meta, extras, bendPrice]);

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

  /** Рядки, які гнуть. Тільки за операцією — гіби решти позицій не наші. */
  const bendRows = useMemo(() => items.filter(isBend), [items]);

  /**
   * Картки робіт. Якщо гнуття не виділили окремою операцією, картка
   * все одно збирає гнуті рядки — щоб було де поставити ціну за гіб.
   */
  const cards = useMemo(() => {
    const list: Array<{ key: string; label: string; kind: string; rows: OrderItem[]; bendCard?: boolean }> =
      opCards.map(c => ({ ...c, bendCard: c.key === 'bend' }));
    if (!list.some(c => c.bendCard) && bendRows.length) {
      list.splice(list[0]?.key === 'cut' ? 1 : 0, 0,
        { key: 'bend', label: 'Гнуття', kind: 'Гнуття', rows: bendRows, bendCard: true });
    }
    return list;
  }, [opCards, bendRows]);

  /**
   * Що вже дав розкрій. Раніше читалось із рядків витрат у групах —
   * тепер розкладки лежать своїм списком і переживають закриття вікна.
   */
  const nestInfo = useMemo(() => {
    if (nests.length) {
      const sheets = nests.reduce((s, n) => s + n.sheets, 0);
      const kg = nests.reduce((s, n) => s + n.kgSheets, 0);
      const cost = nests.reduce((s, n) => s + n.cost, 0);
      return `листів ${sheets} · металу ${kg.toFixed(1)} кг · різ ${money(cost)} грн`;
    }
    const lines = bundles.flatMap(b => b.extras).filter(e => /порізк|лист/i.test(e.label));
    if (!lines.length) return '';
    const sum = lines.reduce((s, e) => s + (e.sum || 0), 0);
    return `${lines.length} розкладка${lines.length > 1 ? 'и' : ''} · ${money(sum)} грн`;
  }, [nests, bundles]);

  /** Сума картки: у гнуття — гроші за гіби, у решти — ціна × кількість. */
  const cardSum = (card: { rows: OrderItem[]; bendCard?: boolean }) =>
    card.bendCard
      ? card.rows.reduce((s, i) => s + bendSum(i), 0)
      : card.rows.reduce((s, i) => s + sumOf(i), 0);
  const cardTime = (rows: OrderItem[]) => rows.reduce((s, i) => s + timeAllOf(i) + cutHours(i), 0);

  /** Складена ціна позиції: тариф різу + гіби. */
  const composedOf = (i: OrderItem) => {
    const m = metaOf(i.row);
    return Math.round(((m.cutPrice || 0) + bendsOf(i) * bendPriceOf(i)) * 100) / 100;
  };
  /** Гіби цієї позиції вже покладені в ціну за штуку? */
  const bendInPrice = (i: OrderItem) => composedOf(i) > 0 && priceOf(i) === composedOf(i);

  /** Позиції картки, де складена ціна відрізняється від поточної. */
  const cardPriceable = (rows: OrderItem[]) =>
    rows.filter(i => composedOf(i) > 0 && composedOf(i) !== priceOf(i));
  /** Те саме по всьому замовленню — для нижньої панелі списку позицій. */
  const allPriceable = useMemo(
    () => cardPriceable(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, meta, prices, bendPrice]
  );

  /**
   * Ціна за штуку складається з робіт: тариф різу плюс гіби. Обидві
   * кнопки ведуть сюди, тому натиснути двічі безпечно — результат той
   * самий, а не подвоєний.
   */
  function composePrice(rows: OrderItem[]) {
    const targets = rows.filter(i => composedOf(i) > 0);
    if (!targets.length) { onToast('Нема з чого складати: порахуйте різ або проставте гіби', true); return; }
    const nextPrices = { ...prices };
    const nextMeta = { ...meta };
    targets.forEach(i => {
      const p = composedOf(i);
      nextMeta[String(i.row)] = { ...(nextMeta[String(i.row)] || {}), price: p };
      nextPrices[i.row] = String(p);
    });
    setMeta(nextMeta);
    setPrices(nextPrices);
    onToast(`💰 Ціну складено для ${targets.length} поз.`);
  }

  function addExtra(label = '') {
    setExtras(e => [...e, { label, sumTxt: '' }]);
    setOpenExtras(true);
  }
  function patchExtra(idx: number, patch: Partial<ExtraRow>) {
    setExtras(e => e.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function delExtra(idx: number) {
    setExtras(e => e.filter((_, i) => i !== idx));
  }
  /** Дописати/оновити витрату з розкрою — по назві, щоб не плодити дублі. */
  function putExtra(label: string, sum: number) {
    setExtras(prev => {
      const head = label.split('·')[0].trim();
      const i = prev.findIndex(x => x.label.startsWith(head));
      const line = { label, sumTxt: String(Math.round(sum * 100) / 100) };
      return i >= 0 ? prev.map((x, k) => (k === i ? line : x)) : [...prev, line];
    });
    setOpenExtras(true);
  }
  function nestToExtra(n: CalcNest) {
    putExtra(`Лазерна порізка ${n.key} · листів ${n.sheets} (${n.sheetW}×${n.sheetH})`, n.cost);
    onToast(`➕ ${n.key} — ${money(n.cost)} грн в «Інші витрати»`);
  }

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
    const made: CalcBundle[] = cards
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

  function nowStamp(): string {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  /** Плоский зріз прорахунку — те, що ляже в аркуш «Прорахунок». */
  function buildLines(): CalcLine[] {
    const out: CalcLine[] = [];
    cards.forEach(c => {
      if (!c.rows.length) return;
      const sum = cardSum(c);
      const time = cardTime(c.rows);
      const qty = c.rows.reduce((s, i) => s + qtyOf(i), 0);
      if (c.bendCard) {
        // Гроші за гіби вже сидять у ціні за штуку — сюди пишемо нулем,
        // інакше «Разом» у таблиці рахувало б ту саму роботу двічі.
        const gibs = c.rows.reduce((s, i) => s + bendsAll(i), 0);
        const inPrice = c.rows.every(bendInPrice);
        out.push({
          section: 'Роботи', name: 'Гнуття', payTo: 'клієнт',
          count: c.rows.length, qty: gibs, sum: 0, time,
          note: `гібів ${gibs} на ${money(sum)} грн — ${inPrice ? 'входить у ціну позицій' : 'ще не перенесено в ціну'}`,
        });
        return;
      }
      out.push({
        section: 'Роботи', name: c.label, payTo: 'клієнт',
        count: c.rows.length, qty, sum, time, note: '',
      });
    });
    // Розкрій пишемо без суми: вартість різу потрапляє в гроші лише
    // тоді, коли її свідомо перенесли в «Інші витрати» чи в ціну.
    nests.forEach(n => out.push({
      section: 'Розкрій', name: `${n.key} · ${n.sheets} л. ${n.sheetW}×${n.sheetH}`, payTo: '',
      count: n.rows.length, qty: n.parts, sum: 0, time: n.timeMin / 60,
      note: `різ ${n.lenM.toFixed(1)} м · врізок ${n.pierces} · деталі ${n.kgParts.toFixed(1)} кг · `
        + `метал ${n.kgSheets.toFixed(1)} кг · остача ${n.kgRest.toFixed(1)} кг · `
        + `заповнення ${n.usedPct}% · різ ${money(n.cost)} грн · ${n.at}`,
    }));
    extras.forEach(e => out.push({
      section: 'Інші витрати', name: e.label || 'без назви', payTo: 'клієнт',
      count: 0, qty: 0, sum: num(e.sumTxt), time: 0, note: '',
    }));
    out.push({
      section: 'РАЗОМ', name: detail.header.orderNum || detail.header.projectId, payTo: '',
      count: items.length, qty: items.reduce((s, i) => s + qtyOf(i), 0),
      sum: totals.all, time: totals.time + totals.cut,
      note: `гібів ${totals.bends} · час різу ${totals.cut.toFixed(1)} год`,
    });
    return out;
  }

  /**
   * Збереження одним рухом: структура прорахунку, ціни й час у самій
   * картці і людський зріз в аркуші «Прорахунок» — бо джерело правди
   * таблиця, а не це вікно. В UI показуємо збережене одразу, а вже
   * потім тихо перечитуємо й звіряємо: якщо хаб чогось не дописав,
   * скажемо про це, а не мовчатимемо.
   */
  async function save() {
    const data: CalcData = {
      bundles, meta,
      extras: extras.filter(e => e.label || num(e.sumTxt)).map(e => ({ label: e.label, sum: num(e.sumTxt) })),
      nests,
      bendPrice: num(bendPrice) || undefined,
      total: totals.all,
      lines: buildLines(),
    };
    const rows = pending.filter(p => byRow.has(p.row));
    const prev = updatedAt;
    setSaving(true);
    setSaveState('saving');
    setUpdatedAt(nowStamp());                       // оптимістично, до відповіді
    try {
      const res = await api.calcSave(detail.header.headerRow, data, rows);
      setUpdatedAt(res.updatedAt || nowStamp());
      setPrices({});
      onToast(`💾 Збережено · ${res.bundles} груп`
        + (res.cells ? ` · у картку ${res.cells} знач.` : '')
        + (res.sheetRows ? ` · в таблицю ${res.sheetRows} ряд.` : ''));
      if (res.cells) onApplied();
      verify(data);
    } catch (e: any) {
      setUpdatedAt(prev);
      setSaveState('bad');
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setSaving(false);
    }
  }

  /** Тиха звірка: що реально лежить у хабі після збереження. */
  async function verify(sent: CalcData) {
    try {
      const r = await api.calcGet(detail.header.headerRow);
      const got = r.data || ({} as CalcData);
      const same =
        (got.bundles || []).length === sent.bundles.length &&
        Object.keys(got.meta || {}).length === Object.keys(sent.meta || {}).length &&
        (got.extras || []).length === (sent.extras || []).length &&
        (got.nests || []).length === (sent.nests || []).length;
      setSaveState(same ? 'ok' : 'bad');
      if (!same) onToast('⚠️ Збережене не збіглося з тим, що в хабі — збережіть ще раз', true);
    } catch {
      setSaveState('bad');
    }
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
            <p className="text-[11.5px] flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--ink-3)' }}>
              <span>{detail.header.orderNum || detail.header.projectId}</span>
              <span>{updatedAt ? `· збережено ${updatedAt}` : '· ще не збережено'}</span>
              {saveState === 'saving' && <span style={{ color: 'var(--blue)' }}>· зберігаю…</span>}
              {saveState === 'ok' && <span style={{ color: 'var(--green)' }}>· звірено ✓</span>}
              {saveState === 'bad' && <span style={{ color: 'var(--accent)' }}>· не звірено</span>}
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
              {cards.map(card => {
                const on = openCard === card.key;
                const isCut = card.key === 'cut';
                const isBendCard = !!card.bendCard;
                const sum = cardSum(card);
                const canPrice = cardPriceable(card.rows);
                const hasBends = card.rows.some(isBend);
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
                          {card.rows.length} поз. · {isBendCard
                            ? `гібів ${card.rows.reduce((s, i) => s + bendsAll(i), 0) || 0}`
                            : `ціна є в ${withPrice}`}
                          {cardTime(card.rows) > 0 ? ` · ${cardTime(card.rows).toFixed(1)} год` : ''}
                        </span>
                      </span>
                      {!isBendCard && withPrice < card.rows.length && (
                        <span className="k-chip" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                          нема ціни: {card.rows.length - withPrice}
                        </span>
                      )}
                      {/* Гнуття не окремий пиріг: його гроші живуть у ціні за
                          штуку. Чіп каже, чи їх туди вже переклали. */}
                      {isBendCard && sum > 0 && (
                        <span className="k-chip" style={card.rows.every(bendInPrice)
                          ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-line)' }
                          : { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
                          {card.rows.every(bendInPrice) ? 'у ціні' : '→ у ціну'}
                        </span>
                      )}
                      <span className="k-value text-[14px] whitespace-nowrap"
                        style={isBendCard ? { color: 'var(--ink-2)' } : undefined}>
                        {sum ? money(sum) : '—'}
                      </span>
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
                              {canPrice.length > 0 && (
                                <button onClick={() => composePrice(canPrice)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold press"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
                                  <CornerUpRight size={11} /> Тариф → ціна ({canPrice.length})
                                </button>
                              )}
                            </>
                          ) : isBendCard ? (
                            <>
                              <span className="k-label">Ціна за один гіб</span>
                              <input value={bendPrice} onChange={e => setBendPrice(e.target.value)}
                                inputMode="decimal" placeholder="0"
                                title="Одна ціна на все замовлення; у рядку можна перебити своєю"
                                className="k-input w-[74px] px-2 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                              <span className="k-label">
                                гібів {card.rows.reduce((s, i) => s + bendsAll(i), 0) || '—'} · на {money(cardSum(card))} грн
                              </span>
                              {canPrice.length > 0 && (
                                <button onClick={() => composePrice(canPrice)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold press"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' }}>
                                  <CornerUpRight size={11} /> Різ + гіби → ціна ({canPrice.length})
                                </button>
                              )}
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
                          <thead>
                            <tr>
                              <th className="k-label text-left pb-1">позиція</th>
                              <th className="k-label text-right pb-1 pr-1 whitespace-nowrap">к-сть</th>
                              {hasBends && <th className="k-label text-right pb-1 pr-1 whitespace-nowrap">гіб/шт</th>}
                              <th className="k-label text-right pb-1 pr-1 whitespace-nowrap">ціна/шт</th>
                              <th className="k-label text-right pb-1 whitespace-nowrap">сума</th>
                            </tr>
                          </thead>
                          <tbody>
                            {card.rows.map(i => {
                              const m = metaOf(i.row);
                              const bp = bendPriceOf(i);
                              const rowSum = isBendCard ? bendSum(i) : sumOf(i);
                              const bends = bendsOf(i);
                              const hint = [
                                m.cutPrice ? `різ ${money(m.cutPrice)}` : '',
                                bends && bp ? `гіби ${bends}×${money(bp)}` : '',
                              ].filter(Boolean).join(' + ');
                              return (
                                <tr key={i.row} className="border-t hairline">
                                  <td className="py-[5px] pr-2 truncate" style={{ maxWidth: 0, width: '100%' }} title={i.name}>
                                    {i.name}
                                    {hint ? <span className="k-label block">{hint} = {money(composedOf(i))} грн/шт</span> : null}
                                  </td>
                                  <td className="py-[5px] px-1 text-right font-mono text-[11.5px] whitespace-nowrap"
                                    style={{ color: 'var(--ink-3)' }}>{qtyOf(i) || '—'} шт</td>
                                  {hasBends && (
                                    <td className="py-[5px] px-1 w-[62px]">
                                      {isBend(i) ? (
                                        <input value={m.bends ?? ''}
                                          onChange={e => setMetaVal(i.row, 'bends', e.target.value)}
                                          inputMode="decimal" placeholder="0"
                                          title={bendsAll(i) ? `Всього гібів: ${bendsAll(i)}` : 'Скільки гібів на одній деталі'}
                                          className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                                      ) : (
                                        <span className="block text-center" style={{ color: 'var(--ink-3)' }}>—</span>
                                      )}
                                    </td>
                                  )}
                                  <td className="py-[5px] px-1 w-[84px]">
                                    <input value={prices[i.row] ?? m.price ?? i.clientPrice ?? ''}
                                      onChange={e => {
                                        setPrices(p => ({ ...p, [i.row]: e.target.value }));
                                        setMetaVal(i.row, 'price', e.target.value);
                                      }}
                                      inputMode="decimal" placeholder="0"
                                      className="k-input w-full px-1.5 py-1 rounded-lg outline-none text-[12px] tabular-nums text-right" />
                                  </td>
                                  <td className="py-[5px] pl-1 text-right font-mono font-semibold whitespace-nowrap w-[86px]">
                                    {rowSum ? money(rowSum) : <span className="k-empty">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
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
                            {/* Що вже розклали — лишається після закриття панелі.
                                Поки панель відкрита, ті самі цифри показує вона. */}
                            {nests.length > 0 && !showNest && (
                              <div className="rounded-lg overflow-hidden" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                                {nests.map((n, k) => (
                                  <div key={n.key + k}
                                    className="flex items-center gap-2 flex-wrap px-2.5 py-1.5"
                                    style={k ? { borderTop: '1px solid var(--line)' } : undefined}>
                                    <span className="text-[12px] font-bold whitespace-nowrap">{n.key}</span>
                                    <span className="k-label" style={{ flex: '1 1 240px' }}>
                                      листів {n.sheets} ({n.sheetW}×{n.sheetH}) · заповнення {n.usedPct}% ·
                                      деталі {n.kgParts.toFixed(1)} кг · метал {n.kgSheets.toFixed(1)} кг ·
                                      остача {n.kgRest.toFixed(1)} кг · різ {n.lenM.toFixed(1)} м ·
                                      врізок {n.pierces} · {n.timeMin.toFixed(0)} хв · {n.at}
                                    </span>
                                    <span className="k-value whitespace-nowrap">{money(n.cost)} грн</span>
                                    <button onClick={() => nestToExtra(n)}
                                      className="px-2 py-1 rounded-lg text-[11px] font-bold press whitespace-nowrap"
                                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                                      → у витрати
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Сам розкрій — тут же: листи, вага, залишок, вартість різу */}
                            {showNest && (
                              <NestingSheet embedded detail={detail} onToast={onToast}
                                onClose={() => setShowNest(false)}
                                saved={nests}
                                onNest={setNests}
                                onExtra={putExtra} />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="card overflow-hidden" style={{ background: 'var(--surface)' }}>
                <button onClick={() => setOpenExtras(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left press">
                  <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}><Plus size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold">Інші витрати</span>
                    <span className="k-label">
                      {extras.length
                        ? `${extras.length} ряд. · метал, доставка, покриття`
                        : 'метал, доставка, покриття — усе, чого немає в кресленнях'}
                    </span>
                  </span>
                  <span className="k-value text-[14px]">{totals.extras ? money(totals.extras) : '—'}</span>
                </button>

                {openExtras && (
                  <div className="px-3 pb-3 border-t hairline pt-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {EXTRA_PRESETS.map(preset => (
                        <button key={preset} onClick={() => addExtra(preset)}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold press"
                          style={{ background: 'var(--bg)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                          + {preset}
                        </button>
                      ))}
                    </div>

                    {extras.map((e, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <input value={e.label} onChange={ev => patchExtra(k, { label: ev.target.value })}
                          placeholder="за що — піде рядком у рахунок"
                          className="k-input flex-1 min-w-0 px-2 py-1.5 rounded-lg outline-none text-[12.5px]" />
                        <input value={e.sumTxt} onChange={ev => patchExtra(k, { sumTxt: ev.target.value })}
                          inputMode="decimal" placeholder="0"
                          className="k-input w-[104px] px-2 py-1.5 rounded-lg outline-none text-[12.5px] tabular-nums text-right" />
                        <button onClick={() => delExtra(k)} className="p-1.5 rounded-lg press"
                          style={{ color: 'var(--ink-3)' }} aria-label="Прибрати рядок">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}

                    <button onClick={() => addExtra()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold press"
                      style={{ background: 'var(--bg)', color: 'var(--ink-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                      <Plus size={12} /> Додати рядок
                    </button>

                    {bundles.some(b => b.extras.length) && (
                      <p className="k-label">
                        ще {money(bundles.reduce((s, b) => s + b.extras.reduce((x, e) => x + (e.sum || 0), 0), 0))} грн
                        лежить у групах рахунку — з попередніх розкладок
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 border-t hairline px-3 py-2 flex items-center gap-2 flex-wrap"
              style={{ background: 'var(--surface)' }}>
              <span className="k-label">Разом по замовленню</span>
              <span className="k-value text-[15px]">{money(totals.all)} грн</span>
              <button onClick={bundlesFromCards}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold press ml-auto"
                style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line-2)' }}>
                <Layers size={12} /> Зібрати рахунок ({cards.length})
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
                      value={bendPrice}
                      onChange={e => setBendPrice(e.target.value)}
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
                {allPriceable.length > 0 && (
                  <button onClick={() => composePrice(allPriceable)} disabled={saving || !!cutBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold press disabled:opacity-50"
                    style={{ background: '#E0F2FE', color: '#0369A1' }}
                    title="Скласти ціну за штуку з робіт: тариф різу + гіби. Якщо вартість розкрою вже стоїть рядком в «Інших витратах», приберіть його — інакше порізка порахується двічі">
                    <CornerUpRight size={12} /> Різ + гіби → ціна ({allPriceable.length})
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
