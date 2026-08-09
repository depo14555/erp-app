// ================================================================
//  src/components/LoadingBar.tsx — помітний індикатор роботи:
//  тонка смуга вгорі екрана + плашка з підписом, що саме зараз
//  вантажиться. Маленький значок у куті непомітний, особливо на
//  телефоні, тому реакція на дотик має бути одразу і по центру.
// ================================================================

import { useEffect, useState } from 'react';

interface Props {
  active: boolean;
  label?: string;
}

export default function LoadingBar({ active, label }: Props) {
  // Дуже швидкі відповіді не блимають: плашка з'являється через 250 мс
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Смуга вгорі — видно завжди, коли щось вантажиться */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[95] overflow-hidden bg-[var(--accent-soft)]">
        <div
          className="h-full w-1/3 animate-loading-bar rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
        />
      </div>

      {/* Плашка з підписом — коли відповідь не миттєва.
          Центрування робить зовнішній контейнер: анімація теж займає
          transform, і -translate-x-1/2 на тому ж елементі не спрацював би. */}
      {show && (
        <div className="fixed top-[60px] left-0 right-0 z-[95] flex justify-center px-3 pointer-events-none">
          <div className="animate-fade-in flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-2xl bg-gray-900 text-white shadow-2xl max-w-full">
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin flex-shrink-0" />
            <span className="text-[12.5px] font-semibold truncate">{label || 'Завантаження…'}</span>
          </div>
        </div>
      )}
    </>
  );
}
