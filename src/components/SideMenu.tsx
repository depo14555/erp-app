// ================================================================
//  src/components/SideMenu.tsx
//  Бокове меню — пульт керування, як у таблиці: відділи
//  (Виробництво / Бухгалтерія / Логістика / Склад) з інструментами.
//  Реалізовані пункти ведуть на екрани додатка, решта — «скоро».
//  Дизайн: світла шапка, сегменти відділів, групи-картки.
// ================================================================

import { useState } from 'react';
import { X, ChevronRight, LogOut, FlaskConical, Database, RefreshCw } from 'lucide-react';
import { AppTab } from '../types';
import { EnvKey, ENVS, setEnv } from '../api';

interface MenuItem {
  icon: string;
  label: string;
  badge?: 'NEW' | 'AI' | 'скоро';
  tab?: AppTab;      // якщо пункт уже працює в додатку
  hint?: string;     // підказка-тост після переходу
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
        { icon: '🖨️', label: 'Друк креслень + QR', tab: 'orders', badge: 'NEW',
          hint: 'Відкрийте замовлення → 🖨️ у шапці' },
      ]},
      { title: 'Вхідні', items: [
        { icon: '📨', label: 'Перевірити пошту', badge: 'скоро' },
      ]},
      { title: 'Операції', items: [
        { icon: '📋', label: 'Додати операцію', badge: 'скоро' },
        { icon: '🚀', label: 'Тех.запуск', badge: 'NEW' },
        { icon: '📁', label: 'Групувати по СК', badge: 'NEW' },
        { icon: '📦', label: 'Покупні вироби', badge: 'скоро' },
        { icon: '📊', label: 'Діаграма Ганта', badge: 'скоро' },
      ]},
      { title: 'Файли', items: [
        { icon: '📐', label: 'Специфікація', badge: 'скоро' },
        { icon: '📥', label: 'Імпорт переліку', badge: 'AI' },
        { icon: '✂️', label: 'Розкрій DXF', badge: 'NEW' },
        { icon: '🎨', label: 'Photoshop', badge: 'скоро' },
        { icon: '🔄', label: 'Заміна файлів', badge: 'NEW' },
      ]},
      { title: 'AI', items: [
        { icon: '📦', label: 'Специфікація зі збірок', badge: 'AI' },
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
      { title: 'У додатку', items: [
        { icon: '🚚', label: 'Забрати / відвантажити', tab: 'logistics', badge: 'NEW' },
      ]},
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
  NEW: 'bg-blue-600/10 text-blue-700',
  AI: 'bg-violet-600/10 text-violet-700',
  'скоро': 'bg-gray-100 text-gray-400',
};

interface Props {
  env: EnvKey;
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  onSoon: (label: string) => void;
  onLogout: () => void;
  onEnvChange: () => void;
  onToast?: (msg: string) => void;
}

export default function SideMenu({ env, onClose, onNavigate, onSoon, onLogout, onEnvChange, onToast }: Props) {
  const [dept, setDept] = useState('prod');
  const active = DEPTS.find(d => d.key === dept)!;

  function switchEnv(next: EnvKey) {
    if (next === env) return;
    setEnv(next);
    onEnvChange();
  }

  function onItem(item: MenuItem) {
    if (item.tab) {
      onNavigate(item.tab);
      if (item.hint) onToast?.(item.hint);
    } else {
      onSoon(item.label);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <aside className="relative w-[88%] max-w-[350px] h-full flex flex-col shadow-2xl animate-slide-in-left bg-[var(--bg)]">
        {/* Шапка */}
        <div className="flex-shrink-0 bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-0 border-b hairline">
          <div className="flex items-center gap-2.5 pb-3">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[17px] shadow-md shadow-blue-600/25">
              ⚙️
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15.5px] leading-tight tracking-tight">ERP Металообробка</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Пульт керування</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl press hover:bg-gray-50" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={19} />
            </button>
          </div>

          {/* Відділи — сегменти */}
          <div className="flex gap-1 -mx-1 px-1 overflow-x-auto pb-2.5 no-scrollbar">
            {DEPTS.map(d => {
              const on = dept === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setDept(d.key)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all press"
                  style={on
                    ? { background: 'var(--ink)', color: '#fff' }
                    : { background: '#F3F4F6', color: 'var(--ink-2)' }}
                >
                  <span className="text-[13px]">{d.icon}</span> {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Пункти — групи-картки */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {active.groups.map(group => (
            <div key={group.title}>
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
                {group.title}
              </p>
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/60 overflow-hidden divide-y divide-gray-50">
                {group.items.map(item => {
                  const soon = item.badge === 'скоро';
                  return (
                    <button
                      key={item.label}
                      onClick={() => onItem(item)}
                      className="w-full flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 text-left press hover:bg-gray-50/80 active:bg-gray-100"
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[15px] flex-shrink-0 ${soon ? 'bg-gray-50' : 'bg-[var(--accent-soft)]'}`}>
                        {item.icon}
                      </span>
                      <span className={`flex-1 text-[13px] truncate ${soon ? 'font-medium text-gray-400' : 'font-semibold text-gray-800'}`}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${BADGE_STYLE[item.badge]}`}>
                          {item.badge}
                        </span>
                      )}
                      {item.tab && <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="px-2 text-[10.5px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Пункти «скоро» поки виконуються в таблиці — тут вони як план розвитку додатка.
          </p>
        </div>

        {/* Низ: середовище + вихід + версія */}
        <div className="flex-shrink-0 bg-white border-t hairline p-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex bg-gray-100 rounded-2xl p-1">
            {(Object.keys(ENVS) as EnvKey[]).map(k => {
              const on = env === k;
              const Icon = k === 'test' ? FlaskConical : Database;
              return (
                <button key={k} onClick={() => switchEnv(k)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11.5px] font-bold transition-all press"
                  style={on
                    ? { background: '#fff', color: k === 'test' ? '#B45309' : 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                    : { color: 'var(--ink-3)' }}>
                  <Icon size={13} /> {ENVS[k].label}
                </button>
              );
            })}
          </div>
          {env === 'test' && (
            <p className="px-2 text-[10.5px] text-amber-700">
              🧪 Працюєте з копією — реальні дані не змінюються.
            </p>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 press"
            >
              <LogOut size={14} />
              <span className="text-[12px] font-bold">Вийти</span>
            </button>
            <span className="ml-auto text-[10px]" style={{ color: 'var(--ink-3)' }}>Версія від {__BUILD_TIME__}</span>
            <button
              onClick={async () => {
                try {
                  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
                  await Promise.all(regs.map(r => r.unregister()));
                  const keys = await caches?.keys?.() ?? [];
                  await Promise.all(keys.map(k => caches.delete(k)));
                } catch { /* не критично */ }
                location.reload();
              }}
              className="p-1.5 rounded-lg press hover:bg-gray-50"
              style={{ color: 'var(--ink-3)' }}
              aria-label="Оновити додаток"
              title="Оновити додаток"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
