// ================================================================
//  src/components/PinchZoom.tsx — таблиця на телефоні: зменшити,
//  щоб побачити всю, і збільшити пальцями потрібне місце.
//
//  Чому не системний зум браузера: він розтягує ВСЮ сторінку, і тоді
//  шторки (вони fixed) виїжджають за край екрана. Тут масштабується
//  лише вміст таблиці — шапка, фільтри й вікна лишаються на місці.
//
//  Ширину внутрішнього шару множимо на 1/scale: так при зменшенні
//  таблиця займає всю ширину екрана, а не третину, і горизонтальна
//  прокрутка рахує реальні межі.
// ================================================================

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';

const MIN = 0.35;
const MAX = 2;

interface Props {
  children: ReactNode;
  /** Ключ, при зміні якого масштаб скидається на «вписати» (нове замовлення). */
  fitKey?: string | number;
}

const dist = (t: TouchList) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export default function PinchZoom({ children, fitKey }: Props) {
  const [scale, setScale] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ d: number; s: number } | null>(null);
  /** Користувач сам крутив масштаб — більше не «вписуємо» за нього. */
  const touched = useRef(false);

  /**
   * Вписати таблицю по ширині екрана. Міряємо саме <table>: у неї свій
   * горизонтальний скрол, тому обгортка про справжню ширину не знає.
   * Трансформ на ширину не впливає, тому множити на поточний масштаб
   * не треба — інакше кожен виклик зменшував би вдвічі.
   */
  const fit = useCallback(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    const t = i.querySelector('table');
    const content = Math.max(t ? t.scrollWidth : 0, 0) || i.scrollWidth;
    if (!content || !b.clientWidth) return;
    const next = Math.min(1, Math.max(MIN, b.clientWidth / content));
    setScale(Math.round(next * 100) / 100);
  }, []);

  // Нове замовлення чи інша зона — показуємо всю таблицю одразу
  useEffect(() => {
    if (fitKey === undefined) return;
    touched.current = false;
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Рядки приїхали пізніше або змінилась ширина колонок — вписуємо ще раз,
  // але тільки поки користувач не задав масштаб сам.
  useEffect(() => {
    const i = inner.current;
    if (!i || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (touched.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    const t = i.querySelector('table');
    if (t) ro.observe(t);
    ro.observe(i);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [fit, fitKey, children]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      gesture.current = { d: dist(e.touches), s: scale };
      touched.current = true;
    }
    function onMove(e: TouchEvent) {
      const g = gesture.current;
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();                    // це наш жест, не прокрутка сторінки
      const next = g.s * (dist(e.touches) / g.d);
      setScale(Math.min(MAX, Math.max(MIN, Math.round(next * 100) / 100)));
    }
    function onEnd(e: TouchEvent) {
      if (e.touches.length < 2) gesture.current = null;
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [scale]);

  const step = (d: number) => {
    touched.current = true;
    setScale(s => Math.min(MAX, Math.max(MIN, Math.round((s + d) * 100) / 100)));
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={box} className="flex-1 min-h-0 overflow-auto">
        <div ref={inner}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            width: `${100 / scale}%`,
          }}>
          {children}
        </div>
      </div>

      {/* Масштаб: кнопки для тих, кому жест незручний */}
      <div className="absolute bottom-2 right-2 flex items-center rounded-lg overflow-hidden shadow-md"
        style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line-2), 0 1px 3px rgba(27,31,36,.18)' }}>
        <button onClick={() => step(-0.1)} className="px-2 py-1.5 press" aria-label="Зменшити"
          style={{ color: 'var(--ink-2)' }}>
          <Minus size={14} />
        </button>
        <button onClick={fit} className="px-1.5 py-1.5 k-value text-[11px] press" title="Вписати таблицю в екран">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => step(0.1)} className="px-2 py-1.5 press" aria-label="Збільшити"
          style={{ color: 'var(--ink-2)' }}>
          <Plus size={14} />
        </button>
        <button onClick={fit} className="px-2 py-1.5 press border-l" aria-label="Вписати"
          style={{ color: 'var(--accent)', borderColor: 'var(--line)' }}>
          <Maximize size={13} />
        </button>
      </div>
    </div>
  );
}
