// ================================================================
//  src/components/NotificationsSheet.tsx
//  Шторка подій від виконавців (журнал DB_NOTIFICATIONS хаба):
//  нові ціни, статуси, коментарі.
// ================================================================

import { useEffect, useState } from 'react';
import { X, Bell, Loader2, Tag, Activity, MessageSquare } from 'lucide-react';
import { api } from '../api';
import { NotificationItem } from '../types';

interface Props {
  onClose: () => void;
  onToast: (msg: string, isError?: boolean) => void;
}

const KIND = {
  price:   { Icon: Tag,           label: 'Ціна',     color: '#2E7D32', bg: 'var(--green-bg)' },
  status:  { Icon: Activity,      label: 'Статус',   color: '#1565C0', bg: 'var(--blue-bg)' },
  comment: { Icon: MessageSquare, label: 'Коментар', color: '#6A1B9A', bg: '#F3E5F5' },
} as const;

export default function NotificationsSheet({ onClose, onToast }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNotifications()
      .then(setItems)
      .catch(err => onToast(err?.message || 'Не вдалося завантажити події', true))
      .finally(() => setLoading(false));
  }, [onToast]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-sheet-up max-h-[82vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-100">
          <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Bell size={16} />
          </span>
          <h3 className="flex-1 text-[15px] font-bold text-gray-900">Події від виконавців</h3>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Закрити">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[13px]">Завантаження…</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-center text-gray-400 text-[13px] py-12">Подій поки немає</p>
          )}

          {items.map((n, i) => {
            const meta = KIND[n.type as keyof typeof KIND] ?? {
              Icon: Activity, label: n.type || 'Подія', color: 'var(--ink-2)', bg: 'var(--bg)',
            };
            const Icon = meta.Icon;
            return (
              <div key={`${n.time}-${i}`} className="flex gap-2.5 p-2.5 rounded-2xl ring-1 ring-gray-200/70">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: meta.bg, color: meta.color }}>
                  <Icon size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[10.5px] text-gray-400 ml-auto flex-shrink-0">{n.time}</span>
                  </div>
                  <p className="text-[12.5px] text-gray-900 break-words mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {n.executor}{n.orderId && ` · ${n.orderId}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
