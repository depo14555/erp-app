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

interface Props {
  order: string;
  items: OrderItem[];
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

export default function OrderInsights({ order, items, onTool, refreshKey, onMasses, calcTotal }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  const [ai, setAi] = useState<OrderAiSummary | null>(null);

  useEffect(() => {
    let alive = true;
    api.aiOrder(order)
      .then(d => { if (alive) { setAi(d); onMasses?.(d.masses || {}); } })
      .catch(() => { /* зведення не критичне — екран працює й без нього */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, refreshKey]);

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
