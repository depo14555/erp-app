// ================================================================
//  src/lib/busy.ts — реєстр «іде довга робота».
//  Поки хоч одна операція активна:
//   · браузер перепитує перед закриттям/оновленням сторінки;
//   · додаток не пропонує оновитись до нової версії (щоб не втратити
//     розкрій, тех.запуск чи розподіл на середині).
// ================================================================

import { useEffect, useState } from 'react';

const active = new Map<string, string>();     // id → підпис операції
const listeners = new Set<(labels: string[]) => void>();

function notify() {
  const labels = [...active.values()];
  listeners.forEach(fn => fn(labels));
  if (labels.length) attachGuard(); else detachGuard();
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Текст сучасні браузери показують свій, але значення має бути непорожнім
  e.returnValue = 'Іде обробка — якщо оновити сторінку, результат буде втрачено';
  return e.returnValue;
}

let guarded = false;
function attachGuard() {
  if (guarded) return;
  window.addEventListener('beforeunload', onBeforeUnload);
  guarded = true;
}
function detachGuard() {
  if (!guarded) return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  guarded = false;
}

export function beginBusy(id: string, label: string): void {
  active.set(id, label);
  notify();
}
export function endBusy(id: string): void {
  if (active.delete(id)) notify();
}

/** Позначає операцію активною, поки `on` — true. */
export function useBusy(on: boolean, label: string): void {
  useEffect(() => {
    if (!on) return;
    const id = label + ':' + Math.random().toString(36).slice(2, 8);
    beginBusy(id, label);
    return () => endBusy(id);
  }, [on, label]);
}

/** Підписка на список активних операцій (порожній — можна оновлюватись). */
export function useBusyLabels(): string[] {
  const [labels, setLabels] = useState<string[]>(() => [...active.values()]);
  useEffect(() => {
    listeners.add(setLabels);
    return () => { listeners.delete(setLabels); };
  }, []);
  return labels;
}
