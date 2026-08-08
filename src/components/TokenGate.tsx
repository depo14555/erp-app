// ================================================================
//  src/components/TokenGate.tsx
//  Перший вхід: ключ доступу (API_AUTH_SECRET хаба) вводиться
//  один раз і зберігається на пристрої.
// ================================================================

import { useState } from 'react';
import { Loader2, FlaskConical, Database } from 'lucide-react';
import { api, setToken, getEnv, setEnv, ENVS, EnvKey } from '../api';

interface Props {
  onSuccess: () => void;
}

export default function TokenGate({ onSuccess }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [env, setEnvState] = useState<EnvKey>(getEnv());

  function pickEnv(k: EnvKey) {
    setEnv(k);
    setEnvState(k);
    setError('');
  }

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
        <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-md shadow-blue-600/25 mx-auto mb-4 block" />
        <h1 className="text-[18px] font-bold text-gray-900 text-center">ERP Металообробка</h1>
        <p className="text-[13px] text-gray-500 text-center mt-1 mb-5">
          Введіть ключ доступу, щоб підключитися до вашої таблиці
        </p>

        {/* Вибір джерела даних */}
        <div className="flex gap-1.5 mb-3">
          {(Object.keys(ENVS) as EnvKey[]).map(k => {
            const on = env === k;
            const Icon = k === 'test' ? FlaskConical : Database;
            return (
              <button key={k} type="button" onClick={() => pickEnv(k)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-bold transition-colors"
                style={on
                  ? { background: k === 'test' ? '#FEF3C7' : '#EBF2FE', color: k === 'test' ? '#92400E' : '#1F6FEB' }
                  : { background: '#F5F6F8', color: '#9CA3AF' }}>
                <Icon size={13} /> {ENVS[k].label}
              </button>
            );
          })}
        </div>

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
