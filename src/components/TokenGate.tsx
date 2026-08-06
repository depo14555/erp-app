// ================================================================
//  src/components/TokenGate.tsx
//  Перший вхід: ключ доступу (API_AUTH_SECRET хаба) вводиться
//  один раз і зберігається на пристрої.
// ================================================================

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { api, setToken } from '../api';

interface Props {
  onSuccess: () => void;
}

export default function TokenGate({ onSuccess }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError('');
    setToken(value);
    try {
      await api.checkToken();
      onSuccess();
    } catch (err: any) {
      setToken('');
      setError(err?.message || 'Не вдалося підключитися');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl shadow-sm ring-1 ring-gray-200 p-6">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
          <KeyRound size={26} />
        </div>
        <h1 className="text-[18px] font-bold text-gray-900 text-center">ERP Металообробка</h1>
        <p className="text-[13px] text-gray-500 text-center mt-1 mb-5">
          Введіть ключ доступу, щоб підключитися до вашої таблиці
        </p>

        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Ключ доступу"
          autoFocus
          className="w-full px-4 py-3 rounded-2xl bg-gray-50 ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-[14px]"
        />

        {error && (
          <p className="text-[12px] text-red-600 font-medium mt-2 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full mt-4 bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-2xl font-bold text-[14px] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={17} className="animate-spin" />}
          {busy ? 'Перевіряю…' : 'Увійти'}
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
          Ключ — це значення API_AUTH_SECRET з налаштувань скрипта таблиці.
          Зберігається лише на цьому пристрої.
        </p>
      </form>
    </div>
  );
}
