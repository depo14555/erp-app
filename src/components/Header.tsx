// ================================================================
//  src/components/Header.tsx  v2.0
//  Тільки Back + Title + QR. Логотип, tabs "Головна/Наряд",
//  іконка додатку — перенесені в Global Header (App.tsx).
// ================================================================

import { ChevronLeft, QrCode, WifiOff, Wifi } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  onQRScan?: () => void;
  isOnline?: boolean;
  pendingCount?: number;
}

export default function Header({ title, onBack, onQRScan, isOnline = true, pendingCount = 0 }: HeaderProps) {
  return (
    <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-gray-200/60">
      <div className="px-3 sm:px-4 flex items-center justify-between h-12 gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {onBack && (
            <button onClick={onBack}
              className="flex-shrink-0 p-1 -ml-1 text-blue-500 hover:bg-blue-50 active:bg-blue-100 rounded-xl transition-colors"
              aria-label="Назад"
            >
              <ChevronLeft size={26} strokeWidth={2.5} />
            </button>
          )}
          <h1 className="text-[15px] font-bold text-gray-900 truncate">{title}</h1>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOnline && (
            <div className="flex items-center gap-1 bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded-lg">
              <WifiOff size={13} strokeWidth={2.5} />
              {pendingCount > 0 && <span className="bg-red-600 text-white px-1 py-0.5 rounded text-[9px] ml-0.5">{pendingCount}</span>}
            </div>
          )}
          {isOnline && pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-lg">
              <Wifi size={13} strokeWidth={2.5} />
            </div>
          )}
          {onQRScan && (
            <button onClick={onQRScan}
              className="w-8 h-8 flex items-center justify-center text-blue-600 bg-blue-50/50 hover:bg-blue-100 rounded-full transition-colors active:scale-95"
              aria-label="QR"
            >
              <QrCode size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}