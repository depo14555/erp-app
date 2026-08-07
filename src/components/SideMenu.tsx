// ================================================================
//  src/components/SideMenu.tsx
//  Бокове меню (гамбургер) — повторює Пульт керування з таблиці:
//  відділи (Виробництво / Бухгалтерія / Логістика / Склад) з тими
//  самими інструментами. Реалізовані пункти ведуть на екрани
//  додатка, решта позначені «скоро» (макет для майбутньої роботи).
// ================================================================

import { useState } from 'react';
import { X, ChevronRight, LogOut, Smartphone, FlaskConical, Database } from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey, ENVS, setEnv } from '../api';

interface MenuItem {
  icon: string;
  label: string;
  badge?: 'NEW' | 'AI' | 'скоро';
  tab?: AppTab;      // якщо пункт уже працює в додатку
}
interface MenuGroup { title: string; items: MenuItem[] }
interface Dept { key: string; icon: string; label: string; groups: MenuGroup[] }

const DEPTS: Dept[] = [
  {
    key: 'prod', icon: '🏭', label: 'Виробництво',
    groups: [
      { title: 'У додатку', items: [
        { icon: '📊', label: 'Огляд', tab: 'dashboard' },
        { icon: '📋', label: 'Замовлення', tab: 'orders' },
        { icon: '🔍', label: 'Пошук деталі', tab: 'search' },
      ]},
      { title: 'Вхідні', items: [
        { icon: '📨', label: 'Перевірити пошту', badge: 'скоро' },
      ]},
      { title: 'Операції', items: [
        { icon: '📋', label: 'Додати операцію', badge: 'скоро' },
        { icon: '🚀', label: 'Тех.запуск', badge: 'NEW' },
        { icon: '📁', label: 'Групувати по СК', badge: 'NEW' },
        { icon: '🖨️', label: 'Друк креслень', badge: 'скоро' },
        { icon: '📦', label: 'Покупні вироби', badge: 'скоро' },
        { icon: '📊', label: 'Діаграма Ганта', badge: 'скоро' },
      ]},
      { title: 'Файли', items: [
        { icon: '📐', label: 'Специфікація', badge: 'скоро' },
        { icon: '📥', label: 'Імпорт переліку', badge: 'AI' },
        { icon: '✂️', label: 'Розкрій DXF', badge: 'NEW' },
        { icon: '🗂️', label: 'Креслення', badge: 'скоро' },
        { icon: '🎨', label: 'Photoshop', badge: 'скоро' },
        { icon: '🔄', label: 'Заміна файлів', badge: 'NEW' },
      ]},
      { title: 'AI', items: [
        { icon: '🔬', label: 'Аналіз ТМЦ', badge: 'AI' },
        { icon: '📦', label: 'Покупні зі збірок', badge: 'AI' },
        { icon: '🤖', label: 'AI Помічник', badge: 'AI' },
      ]},
      { title: 'Workflow', items: [
        { icon: '📁', label: 'Розподіл КД', badge: 'скоро' },
        { icon: '📤', label: 'Відправити виконавцю', badge: 'NEW' },
        { icon: '🔌', label: 'Підключити контрагента', badge: 'NEW' },
      ]},
    ],
  },
  {
    key: 'acc', icon: '💰', label: 'Бухгалтерія',
    groups: [
      { title: 'Документи', items: [
        { icon: '📄', label: 'Договір', badge: 'скоро' },
        { icon: '🧾', label: 'Рахунок клієнту', badge: 'скоро' },
        { icon: '📋', label: 'Видаткова', badge: 'скоро' },
      ]},
      { title: 'Аналітика', items: [
        { icon: '📊', label: 'Прибуток', badge: 'скоро' },
        { icon: '📈', label: 'Графіки', badge: 'скоро' },
      ]},
    ],
  },
  {
    key: 'log', icon: '🚛', label: 'Логістика',
    groups: [
      { title: 'Нова Пошта', items: [
        { icon: '📮', label: 'Створити ТТН', badge: 'скоро' },
        { icon: '🔍', label: 'Трекінг', badge: 'скоро' },
      ]},
    ],
  },
  {
    key: 'wh', icon: '📦', label: 'Склад',
    groups: [
      { title: 'Склад', items: [
        { icon: '📥', label: 'Прийняти', badge: 'скоро' },
        { icon: '📤', label: 'Видати', badge: 'скоро' },
      ]},
    ],
  },
];

const BADGE_STYLE: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  AI: 'bg-violet-100 text-violet-700',
  'скоро': 'bg-gray-100 text-gray-500',
};

interface Props {
  env: EnvKey;
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  onSoon: (label: string) => void;
  onLogout: () => void;
  onEnvChange: () => void;
}

export default function SideMenu({ env, onClose, onNavigate, onSoon, onLogout, onEnvChange }: Props) {
  const [dept, setDept] = useState('prod');
  const active = DEPTS.find(d => d.key === dept)!;

  function switchEnv(next: EnvKey) {
    if (next === env) return;
    setEnv(next);
    onEnvChange();
  }

  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />

      <aside className="relative w-[86%] max-w-[340px] bg-white h-full flex flex-col shadow-2xl animate-slide-in-left">
        {/* Шапка меню */}
        <div className="flex-shrink-0 bg-gradient-to-br from-indigo-600 to-blue-600 px-4 pt-4 pb-3 text-white">
          <div className="flex items-start gap-2">
            <span className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-[18px]">
              ⚙️
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] leading-tight">ERP Металообробка</p>
              <p className="text-[11px] text-white/70 mt-0.5">Пульт керування</p>
            </div>
            <button onClick={onClose} className="p-1 text-white/80 active:scale-90 transition-transform" aria-label="Закрити">
              <X size={20} />
            </button>
          </div>

          {/* Відділи */}
          <div className="flex gap-1 mt-3 -mx-1 overflow-x-auto pb-0.5">
            {DEPTS.map(d => (
              <button
                key={d.key}
                onClick={() => setDept(d.key)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-colors ${
                  dept === d.key ? 'bg-white text-indigo-700' : 'bg-white/15 text-white/90'
                }`}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Пункти */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {active.groups.map(group => (
            <div key={group.title} className="mb-3">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button
                    key={item.label}
                    onClick={() => (item.tab ? onNavigate(item.tab) : onSoon(item.label))}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <span className="text-[16px] w-6 text-center flex-shrink-0">{item.icon}</span>
                    <span className={`flex-1 text-[13.5px] font-medium truncate ${
                      item.badge === 'скоро' ? 'text-gray-400' : 'text-gray-800'
                    }`}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${BADGE_STYLE[item.badge]}`}>
                        {item.badge}
                      </span>
                    )}
                    {item.tab && <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mx-3 my-2 p-3 rounded-2xl bg-blue-50/70 flex gap-2">
            <Smartphone size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-900/80 leading-relaxed">
              Пункти з позначкою «скоро» поки виконуються в таблиці — тут вони як макет
              майбутнього функціоналу додатка.
            </p>
          </div>
        </div>

        {/* Низ: середовище + вихід */}
        <div className="flex-shrink-0 border-t border-gray-100 p-2 space-y-1">
          <p className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Джерело даних
          </p>
          <div className="flex gap-1 px-1">
            {(Object.keys(ENVS) as EnvKey[]).map(k => {
              const on = env === k;
              const Icon = k === 'test' ? FlaskConical : Database;
              return (
                <button key={k} onClick={() => switchEnv(k)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl text-[11.5px] font-bold transition-colors"
                  style={on
                    ? { background: k === 'test' ? '#FEF3C7' : 'var(--accent-soft)', color: k === 'test' ? '#92400E' : 'var(--accent)' }
                    : { background: '#F5F6F8', color: 'var(--ink-3)' }}>
                  <Icon size={13} /> {ENVS[k].label}
                </button>
              );
            })}
          </div>
          {env === 'test' && (
            <p className="px-3 pb-1 text-[10.5px] text-amber-700">
              Працюєте з копією — реальні дані не змінюються.
            </p>
          )}

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            <LogOut size={16} />
            <span className="text-[13.5px] font-semibold">Вийти з додатка</span>
          </button>

          <div className="flex items-center justify-between px-3 pb-1 pt-0.5">
            <span className="text-[10px] text-gray-400">Версія від {__BUILD_TIME__}</span>
            <button
              onClick={async () => {
                // Жорстке оновлення: скидаємо сервіс-воркер і кеші
                try {
                  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
                  await Promise.all(regs.map(r => r.unregister()));
                  const keys = await caches?.keys?.() ?? [];
                  await Promise.all(keys.map(k => caches.delete(k)));
                } catch { /* не критично */ }
                location.reload();
              }}
              className="text-[10px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg"
            >
              Оновити додаток
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
