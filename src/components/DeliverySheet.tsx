// ================================================================
//  src/components/DeliverySheet.tsx — 🚚 доставка вибраних деталей:
//  спосіб (Нова Пошта / самовивіз / наш транспорт / кур'єр / інше),
//  ТТН для НП, примітка. Мітка пишеться в примітку рядків і видна
//  в зоні «Логістика» таблиці позицій.
// ================================================================

import { useState } from 'react';
import { X, Truck, Loader2 } from 'lucide-react';
import { api } from '../api';
import { OrderItem } from '../types';

interface Props {
  items: OrderItem[]; // вибрані деталі
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onDone: () => void;
}

const METHODS = [
  { key: 'Нова Пошта', icon: '📮' },
  { key: 'Самовивіз', icon: '🤝' },
  { key: 'Наш транспорт', icon: '🚐' },
  { key: "Кур'єр", icon: '🛵' },
  { key: 'Інше', icon: '📦' },
];

export default function DeliverySheet({ items, onClose, onToast, onDone }: Props) {
  const [method, setMethod] = useState('Нова Пошта');
  const [ttn, setTtn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      const res = await api.setDelivery(items.map(i => i.row), method, ttn.trim(), note.trim());
      onToast(`${res.tag} → ${res.updated} дет.`);
      onDone();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти доставку', true);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={busy ? undefined : onClose} />
      <div className="relative w-full lg:w-[480px] max-h-[92dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Truck size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Доставка деталей</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              вибрано {items.length} — мітка з'явиться в зоні «Логістика»
            </p>
          </div>
          {!busy && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {/* Спосіб */}
          <div className="grid grid-cols-2 gap-1.5">
            {METHODS.map(m => (
              <button key={m.key} onClick={() => setMethod(m.key)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[12.5px] font-bold transition-colors press"
                style={method === m.key
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--bg)', color: 'var(--ink-2)' }}>
                <span className="text-[15px]">{m.icon}</span> {m.key}
              </button>
            ))}
          </div>

          {method === 'Нова Пошта' && (
            <input value={ttn} onChange={e => setTtn(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="№ ТТН (наприклад 20450...)" inputMode="numeric"
              className="k-input w-full px-3 py-2.5 rounded-xl outline-none text-[13px] tabular-nums" />
          )}

          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Примітка (куди, кому, коли — необов'язково)"
            className="k-input w-full px-3 py-2.5 rounded-xl outline-none text-[12.5px]" />

          {/* Вибрані деталі */}
          <div className="rounded-2xl ring-1 ring-gray-200/60 divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
            {items.map(i => (
              <div key={i.row} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                <span className="flex-1 truncate">{i.name}</span>
                {i.qty && <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{i.qty} шт</span>}
                {i.executor && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 flex-shrink-0" style={{ color: 'var(--ink-2)' }}>{i.executor}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={apply} disabled={busy}
            className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-60 inline-flex items-center justify-center gap-2"
            style={{ background: '#EA580C' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : '🚚'}
            {busy ? 'Зберігаю…' : `Відправити ${items.length} дет. · ${method}`}
          </button>
        </div>
      </div>
    </div>
  );
}
