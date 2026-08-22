// ================================================================
//  src/components/OrderInsights.tsx — смуга під шапкою замовлення.
//
//  Дві речі, яких бракувало на екрані:
//
//  1. ЩО СИСТЕМА ВЖЕ ЗНАЄ — результати ШІ мають одне місце. Раніше
//     ти закривав вікно «Покупних» і більше не бачив, що воно там
//     порахувало. Тепер видно одразу: збірки, покупні, маса, порізка.
//     Не пораховано — плитка сіра з підписом «прочитати».
//
//  2. ЧОГО БРАКУЄ — стіна «—» у таблиці не каже, скільки саме
//     незаповнено і чи це критично. Чіп показує «Матеріал 21/35»,
//     а клік лишає в таблиці САМЕ ТІ рядки, де поля немає.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Blocks, ShoppingCart, Weight, Calculator } from 'lucide-react';
import { api } from '../api';
import { driveIdFromUrl } from '../lib/ai';
import { num } from './ItemsTable';
import { OrderItem, OrderAiSummary } from '../types';

/** Поля, повнота яких має значення для запуску в роботу. */
export const GAP_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'material', label: 'Матеріал' },
  { key: 'thickness', label: 'Товщина' },
  { key: 'qty', label: 'К-сть' },
  { key: 'op', label: 'Операція' },
  { key: 'executor', label: 'Виконавець' },
  { key: 'assembly', label: 'Збірка' },
  { key: 'clientPrice', label: 'Ціна' },
  { key: 'rowStatus', label: 'Статус' },
];

interface Props {
  order: string;
  items: OrderItem[];
  /** Активний фільтр «показати рядки, де цього поля немає». */
  gap: string;
  onGap: (field: string) => void;
  onTool: (t: 'asm' | 'purch' | 'calc' | 'tmc') => void;
  /** Разом по замовленню з прорахунку — читає сторінка, тут лише показ. */
  calcTotal?: number;
  /** Змінюється після записів у картку — привід перечитати зведення. */
  refreshKey?: number;
  /** Маси зі штампів (fileId → кг) — щоб сторінка могла зважити вибране. */
  onMasses?: (m: Record<string, number>) => void;
}

const OPEN_KEY = 'erp-insights-open';

/**
 * Вага набору позицій за штампами. Та сама деталь стоїть у кількох
 * рядках-операціях (маршрут) — креслення важить один раз, інакше вага
 * помножилась би на число операцій.
 */
export function weighItems(items: OrderItem[], masses: Record<string, number>) {
  const seen = new Set<string>();      // креслення, які вже зважили
  const missing = new Set<string>();   // креслення без маси у штампі
  let kg = 0;
  items.forEach(i => {
    const id = driveIdFromUrl(i.url || '');
    if (!id) return;
    const m = masses[id];
    if (!m) { missing.add(id); return; }
    if (seen.has(id)) return;
    seen.add(id);
    kg += m * (num(i.assignedQty) || num(i.qty) || 1);
  });
  return { kg, files: seen.size, missing: missing.size };
}

export default function OrderInsights({ order, items, gap, onGap, onTool, refreshKey, onMasses, calcTotal }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  /**
   * Комплектність згортається сама, коли все заповнено: на 100 %
   * сітка полів більше нічого не каже — досить одного зеленого рядка.
   * Клік по рядку повертає сітку, якщо треба глянути.
   */
  const [compOverride, setCompOverride] = useState<boolean | null>(null);
  const [ai, setAi] = useState<OrderAiSummary | null>(null);

  useEffect(() => {
    let alive = true;
    api.aiOrder(order)
      .then(d => { if (alive) { setAi(d); onMasses?.(d.masses || {}); } })
      .catch(() => { /* зведення не критичне — екран працює й без нього */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, refreshKey]);

  /** Скільки рядків мають кожне поле заповненим. */
  const filled = useMemo(() => {
    const m: Record<string, number> = {};
    GAP_FIELDS.forEach(f => {
      m[f.key] = items.filter(i => String((i as any)[f.key] ?? '').trim()).length;
    });
    return m;
  }, [items]);

  /** Збірки рахуємо з самої картки — це вже записані дані, не кеш ШІ. */
  const asm = useMemo(() => {
    const s = new Set<string>();
    let rows = 0;
    items.forEach(i => {
      const v = String(i.assembly || '').trim();
      if (v) { s.add(v); rows++; }
    });
    return { count: s.size, rows };
  }, [items]);

  const total = items.length;

  function toggle() {
    setOpen(v => { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); return !v; });
  }

  /**
   * Маса металу в замовленні. Рахуємо ТУТ, а не в хабі: тільки клієнт
   * знає кількості й бачить, що та сама деталь стоїть у кількох
   * рядках-операціях — інакше вага множиться на число операцій.
   */
  const metal = useMemo(() => weighItems(items, ai?.masses || {}), [ai, items]);

  const tiles = [
    {
      key: 'asm', Icon: Blocks, label: 'Збірки',
      value: asm.count ? `${asm.count} · ${asm.rows} поз.` : '',
      tool: 'asm' as const,
    },
    {
      key: 'purch', Icon: ShoppingCart, label: 'Покупні',
      value: ai?.purchased ? `${ai.purchased} найм. · ${ai.purchasedTotal} шт` : '',
      tool: 'purch' as const,
    },
    {
      key: 'mass', Icon: Weight, label: 'Маса металу',
      // Лічильник поруч із вагою: скільки креслень її дали
      value: metal.kg ? `${metal.kg.toFixed(1)} кг · ${metal.files} крес.` : '',
      tool: 'tmc' as const,
    },
    {
      key: 'calc', Icon: Calculator, label: 'Прорахунок',
      value: calcTotal
        ? `${calcTotal.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} грн`
        : '',
      empty: 'не рахували', act: 'порахувати →',
      tool: 'calc' as const,
    },
  ];

  const filledTotal = GAP_FIELDS.reduce((s, f) => s + (filled[f.key] || 0), 0);
  const pct = total ? Math.round((100 * filledTotal) / (total * GAP_FIELDS.length)) : 0;

  return (
    <div className="px-3 pt-2 pb-2.5">
      <button onClick={toggle} className="flex items-center gap-1.5 press mb-1.5" style={{ color: 'var(--ink-2)' }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="k-head">Що прочитано · комплектність</span>
        {!open && <span className="k-label">— розгорнути</span>}
      </button>

      {open && (
        <>
          {/* ШТАМП 1: що система вже прочитала з креслень */}
          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-[11px] overflow-hidden mb-2 paper border"
            style={{ borderColor: 'var(--paper-line)' }}>
            {tiles.map(({ key, Icon, label, value, tool }, i) => (
              <button key={key} onClick={() => onTool(tool)}
                className="flex items-center gap-2.5 px-3 py-[7px] text-left press hover:bg-black/[0.03]"
                style={{ borderRight: i < tiles.length - 1 ? '1px dashed var(--paper-line)' : undefined }}
                title={value ? 'Відкрити' : 'Ще не рахували — відкрити і прочитати'}>
                <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={value
                    ? { background: 'var(--violet-bg)', boxShadow: 'inset 0 0 0 1px var(--violet-line)', color: 'var(--violet)' }
                    : { background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink-3)' }}>
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="k-label block">{label}</span>
                  <span className="k-value block truncate"
                    style={value ? undefined : { color: 'var(--ink-2)', fontWeight: 400 }}>
                    {value || (tiles[i] as any).empty || 'не читали'}
                  </span>
                </span>
                {!value && (
                  <span className="k-label flex-shrink-0" style={{ color: 'var(--accent)' }}>
                    {(tiles[i] as any).act || 'прочитати →'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ШТАМП 2: комплектність специфікації — смужка показує пропорцію */}
          <div className="k-frame paper overflow-hidden">
            <button onClick={() => setCompOverride(v => (v === null ? pct >= 100 ? true : false : !v))}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left press"
              style={{ borderBottom: (compOverride ?? pct < 100) ? '1px solid var(--paper-line)' : undefined }}>
              <span className="k-head">Комплектність специфікації</span>
              {pct >= 100 && <span className="k-label" style={{ color: 'var(--green)' }}>✓ все заповнено</span>}
              <span className="k-value ml-auto text-[10.5px]"
                style={pct >= 100 ? { color: 'var(--green)' } : undefined}>заповнено {pct}%</span>
              {(compOverride ?? pct < 100)
                ? <ChevronDown size={12} style={{ color: 'var(--ink-3)' }} />
                : <ChevronRight size={12} style={{ color: 'var(--ink-3)' }} />}
            </button>
            {(compOverride ?? pct < 100) && (
            <div className="grid grid-cols-4 lg:grid-cols-8">
              {GAP_FIELDS.map(({ key, label }, i) => {
                const n = filled[key] || 0;
                const ready = total > 0 && n === total;
                const none = n === 0;
                const on = gap === key;
                const w = total ? Math.round((100 * n) / total) : 0;
                return (
                  <button key={key} onClick={() => onGap(on ? '' : key)} disabled={ready}
                    className="px-2.5 py-[7px] text-left press disabled:cursor-default hover:bg-black/[0.03] disabled:hover:bg-transparent"
                    style={{
                      borderRight: (i + 1) % 8 ? '1px dashed var(--paper-line)' : undefined,
                      background: on ? 'var(--accent-soft)' : undefined,
                    }}
                    title={ready ? `${label}: заповнено скрізь` : `Показати рядки, де «${label}» не заповнено`}>
                    <span className="k-label block">{label}</span>
                    <span className="k-value block text-[13.5px]" style={ready ? undefined : { color: 'var(--accent)' }}>
                      {n} <span className="text-[10px] font-normal" style={{ color: 'var(--ink-2)' }}>/ {total}</span>
                    </span>
                    <span className="block h-[2.5px] mt-1.5" style={{ background: 'var(--line)' }}>
                      <span className="block h-full" style={{ width: `${w}%`, background: ready ? 'var(--green)' : 'var(--accent)' }} />
                    </span>
                    {none && <span className="k-label block mt-0.5" style={{ color: 'var(--accent)' }}>заповнити →</span>}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {ai && ai.files > 0 && (
            <p className="k-label mt-1.5 text-right">
              прочитано креслень {ai.files} · ${ai.cost.toFixed(3)}{ai.at && ` · ${ai.at}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
