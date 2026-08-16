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
import { ChevronDown, ChevronRight, Blocks, ShoppingCart, Weight, Scissors } from 'lucide-react';
import { api } from '../api';
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
  onTool: (t: 'asm' | 'purch' | 'calc') => void;
  /** Змінюється після записів у картку — привід перечитати зведення. */
  refreshKey?: number;
}

const OPEN_KEY = 'erp-insights-open';

export default function OrderInsights({ order, items, gap, onGap, onTool, refreshKey }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  const [ai, setAi] = useState<OrderAiSummary | null>(null);

  useEffect(() => {
    let alive = true;
    api.aiOrder(order)
      .then(d => { if (alive) setAi(d); })
      .catch(() => { /* зведення не критичне — екран працює й без нього */ });
    return () => { alive = false; };
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
      key: 'mass', Icon: Weight, label: 'Маса збірок',
      value: ai?.mass ? `${ai.mass} кг` : '',
      tool: 'asm' as const,
    },
    {
      key: 'cut', Icon: Scissors, label: 'Порізка і гіби',
      value: ai && (ai.cutRows || ai.bendRows)
        ? [ai.cutRows ? `${ai.cutRows} різ` : '', ai.bendRows ? `${ai.bendRows} гнуття` : '']
            .filter(Boolean).join(' · ')
        : '',
      tool: 'calc' as const,
    },
  ];

  return (
    <div className="px-3 pt-1.5 pb-2 border-b hairline">
      <button onClick={toggle} className="flex items-center gap-1.5 press mb-1.5"
        style={{ color: 'var(--ink-3)' }}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-[10px] font-bold uppercase tracking-[0.07em]">
          Що система знає · чого бракує
        </span>
        {!open && (
          <span className="text-[10.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>
            — розгорнути
          </span>
        )}
      </button>

      {open && (
        <>
          {/*
            Плитки нейтральні: пораховане позначає колірна смужка зліва
            й насичена цифра, а не заливка. Заливками екран швидко
            перетворюється на строкатість.
          */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 mb-2">
            {tiles.map(({ key, Icon, label, value, tool }) => (
              <button key={key} onClick={() => onTool(tool)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg text-left press transition-colors bg-white hover:bg-gray-50"
                style={{
                  boxShadow: `inset 0 0 0 1px var(--line), inset 2px 0 0 ${value ? '#6941C6' : 'transparent'}`,
                }}
                title={value ? 'Відкрити' : 'Ще не рахували — відкрити і прочитати'}>
                <Icon size={14} className="flex-shrink-0"
                  style={{ color: value ? '#6941C6' : 'var(--ink-3)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] leading-tight" style={{ color: 'var(--ink-3)' }}>{label}</span>
                  <span className="block text-[12px] font-bold leading-tight truncate tabular-nums"
                    style={{ color: value ? 'var(--ink)' : 'var(--ink-3)' }}>
                    {value || 'прочитати'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {GAP_FIELDS.map(({ key, label }) => {
              const n = filled[key] || 0;
              const done = total > 0 && n === total;
              const none = n === 0;
              const on = gap === key;
              // Стан несе крапка й колір цифри; сам чіп лишається нейтральним
              const dot = done ? '#079455' : none ? '#D92D20' : '#DC6803';
              return (
                <button key={key}
                  onClick={() => onGap(on ? '' : key)}
                  disabled={done}
                  className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md text-[11px] press disabled:cursor-default transition-colors bg-white hover:bg-gray-50 disabled:hover:bg-white"
                  style={on
                    ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)', background: 'var(--accent-soft)' }
                    : { boxShadow: 'inset 0 0 0 1px var(--line)' }}
                  title={done
                    ? `${label}: заповнено скрізь`
                    : `Показати рядки, де «${label}» не заповнено`}>
                  <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: dot }} />
                  <span style={{ color: 'var(--ink-2)' }}>{label}</span>
                  <span className="font-bold tabular-nums" style={{ color: done ? 'var(--ink-3)' : dot }}>
                    {n}/{total}
                  </span>
                </button>
              );
            })}
            {ai && ai.files > 0 && (
              <span className="text-[10.5px] ml-auto" style={{ color: 'var(--ink-3)' }}>
                прочитано креслень: {ai.files} · ${ai.cost.toFixed(3)}
                {ai.at && ` · ${ai.at}`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
