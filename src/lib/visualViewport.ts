// ================================================================
//  src/lib/visualViewport.ts — шторки на збільшеному пальцями екрані.
//
//  Коли сторінку розтягнули двома пальцями, `position: fixed` рахується
//  від СТОРІНКИ, а не від того, що видно. Тому вікно (Прорахунок,
//  Склад збірок, меню дій) виїжджало за край: ліва частина зрізана,
//  кнопки «Закрити» не дістати.
//
//  Тут ми міряємо видиму частину (visualViewport) і кладемо її в змінні
//  --vv-*, а правило в index.css саджає кожен fixed-шар саме туди.
//  Масштаб 1 — змінні дорівнюють звичайним 0/100%, тобто нічого не
//  змінюється.
// ================================================================

export function watchVisualViewport(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};

  let frame = 0;
  const apply = () => {
    frame = 0;
    const s = document.documentElement.style;
    // Масштаб не змінювали — лишаємо звичайну поведінку fixed
    if (Math.abs(vv.scale - 1) < 0.01) {
      s.setProperty('--vv-left', '0px');
      s.setProperty('--vv-top', '0px');
      s.setProperty('--vv-w', '100%');
      s.setProperty('--vv-h', '100%');
      return;
    }
    s.setProperty('--vv-left', `${vv.offsetLeft}px`);
    s.setProperty('--vv-top', `${vv.offsetTop}px`);
    s.setProperty('--vv-w', `${vv.width}px`);
    s.setProperty('--vv-h', `${vv.height}px`);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

  apply();
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  return () => {
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
