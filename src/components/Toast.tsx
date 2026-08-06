import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  isError?: boolean;
  onClose: () => void;
}

export default function Toast({ message, isError, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up ${
      isError
        ? 'bg-red-500'
        : 'bg-green-500'
    } text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 min-w-80 max-w-md`}>
      <div className="flex-shrink-0">
        {isError ? (
          <AlertCircle size={20} strokeWidth={2} className="text-white" />
        ) : (
          <CheckCircle size={20} strokeWidth={2} className="text-white" />
        )}
      </div>
      <span className="flex-1 font-medium">{message}</span>
      <button
        onClick={onClose}
        className="hover:bg-white/20 rounded-lg p-1.5 transition-colors duration-150 flex-shrink-0"
      >
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
