// ================================================================
//  src/components/OfflineBanner.tsx  v2.0
//  Компактна постійна смуга стану над нижнім меню (мобільний):
//  - офлайн: жовта «Офлайн · відмітки зберігаються · черга N»
//  - онлайн з чергою: синя з кнопкою «Синхронізувати»
//  Нічого не перекриває — живе в потоці, а не поверх контенту.
// ================================================================

import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  onSync?: () => void;
  isSyncing?: boolean;
}

export default function OfflineBanner({ isOnline, pendingCount, onSync, isSyncing = false }: OfflineBannerProps) {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`lg:hidden flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold border-t ${
        !isOnline
          ? 'bg-amber-300/90 text-amber-950 border-amber-400/60'
          : 'bg-blue-50 text-blue-800 border-blue-100'
      }`}
    >
      {!isOnline
        ? <WifiOff size={13} className="flex-shrink-0" />
        : <RefreshCw size={13} className={`flex-shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />}
      <span className="flex-1 truncate">
        {!isOnline
          ? `Офлайн — відмітки зберігаються на телефоні${pendingCount > 0 ? ` · в черзі: ${pendingCount}` : ''}`
          : isSyncing
            ? `Синхронізуємо ${pendingCount} відміток…`
            : `У черзі ${pendingCount} відміток`}
      </span>
      {isOnline && onSync && !isSyncing && (
        <button
          onClick={onSync}
          className="flex-shrink-0 bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold active:bg-blue-800 transition-colors"
        >
          Синхронізувати
        </button>
      )}
    </div>
  );
}
