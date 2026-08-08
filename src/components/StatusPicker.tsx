// ================================================================
//  src/components/StatusPicker.tsx
//  Нижня шторка вибору статусу (замовлення або рядка).
// ================================================================

import { useState } from 'react';
import { X, Check, Plus } from 'lucide-react';
import { statusStyle } from '../types';

interface Props {
  title: string;
  subtitle?: string;
  options: string[];
  current: string;
  onPick: (s: string) => void;
  onClose: () => void;
  /** Дозволити вписати свій варіант (типово так). */
  allowCustom?: boolean;
}

export default function StatusPicker({ title, subtitle, options, current, onPick, onClose, allowCustom = true }: Props) {
  const [custom, setCustom] = useState('');
  const typed = custom.trim();
  const isNew = !!typed && !options.some(o => o.toLowerCase() === typed.toLowerCase());
  const shown = typed
    ? options.filter(o => o.toLowerCase().includes(typed.toLowerCase()))
    : options;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-sheet-up max-h-[80vh] flex flex-col">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900 truncate">{title}</h3>
            {subtitle && <p className="text-[12px] text-gray-500 truncate mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Закрити">
            <X size={20} />
          </button>
        </div>

        {allowCustom && (
          <div className="px-3 pt-2.5 flex-shrink-0">
            <input
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && typed) onPick(typed); }}
              placeholder="Знайти або вписати свій варіант…"
              className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px]"
            />
          </div>
        )}

        <div className="p-2 overflow-y-auto">
          {isNew && (
            <button
              onClick={() => onPick(typed)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left mb-1"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Plus size={16} className="flex-shrink-0" />
              <span className="flex-1 text-[14px] font-bold truncate">Вписати «{typed}»</span>
            </button>
          )}
          {options.length === 0 && !isNew && (
            <p className="text-[13px] text-gray-500 p-4 text-center">Список порожній — впишіть свій варіант вище</p>
          )}
          {shown.map(opt => {
            const st = statusStyle(opt);
            const active = opt === current;
            return (
              <button
                key={opt}
                onClick={() => onPick(opt)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors ${
                  active ? 'bg-gray-50' : 'hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.solid }} />
                <span className="flex-1 text-[14px] font-semibold" style={{ color: st.fg }}>{opt}</span>
                {active && <Check size={18} className="text-blue-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
