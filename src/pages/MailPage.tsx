// ================================================================
//  src/pages/MailPage.tsx — 📨 Вхідні: листи з міткою
//  «Нове замовлення» в Gmail. Видно, що прийшло (від кого, тема,
//  вкладення, чи відомий клієнт), одна кнопка обробляє всі —
//  створюються картки замовлень, як «Перевірити пошту» в таблиці.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { Mail, Paperclip, User, Loader2, Inbox, Zap, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { MailListData } from '../types';

interface Props {
  onToast: (msg: string, err?: boolean) => void;
  onProcessed: () => void; // оновити список замовлень
  refreshSignal?: number;
}

export default function MailPage({ onToast, onProcessed, refreshSignal }: Props) {
  const [data, setData] = useState<MailListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.mailList());
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося перевірити пошту', true);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal) load(); }, [refreshSignal, load]);

  async function processAll() {
    if (!data?.threads.length) return;
    setWorking(true);
    try {
      const res = await api.mailProcess();
      onToast(`Створено замовлень: ${res.processed}${res.remaining ? ` · лишилось листів: ${res.remaining}` : ''}`);
      onProcessed();
      load();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося обробити пошту', true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 lg:px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <p className="text-[11.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>
          {loading ? 'Перевіряю пошту…'
            : data ? `Мітка «${data.labelName}» · листів: ${data.threads.length}` : ''}
        </p>
        <button onClick={processAll} disabled={working || !data?.threads.length}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold text-white press disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          {working ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          {working ? 'Обробляю…' : `Створити замовлення (${data?.threads.length ?? 0})`}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 lg:px-5 pb-5">
        {data?.labelMissing && (
          <div className="max-w-[560px] mx-auto mt-6 p-4 rounded-2xl bg-amber-50 text-amber-800 text-[12.5px] leading-relaxed flex gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>
              У Gmail немає мітки «{data.labelName}». Створіть її і призначайте
              листам із новими замовленнями — вони з'являться тут.
            </span>
          </div>
        )}

        {!loading && data && !data.labelMissing && data.threads.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--ink-3)' }}>
            <Inbox size={34} className="mx-auto mb-2 opacity-40" />
            <p className="text-[13.5px] font-semibold">Нових замовлень на пошті немає</p>
            <p className="text-[11.5px] mt-1">Листи з міткою «{data.labelName}» з'являться тут</p>
          </div>
        )}

        {!data && loading && (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}

        <div className="max-w-[760px] mx-auto space-y-2 mt-1">
          {data?.threads.map((t, i) => (
            <div key={i} className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
              <div className="flex items-start gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Mail size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[13.5px] truncate flex-1">{t.subject}</p>
                    <span className="text-[10.5px] flex-shrink-0" style={{ color: 'var(--ink-3)' }}>{t.date}</span>
                  </div>
                  <p className="text-[11.5px] truncate mt-0.5 flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                    <User size={11} className="flex-shrink-0" /> {t.from}
                  </p>
                  {t.snippet && (
                    <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--ink-3)' }}>{t.snippet}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {t.client
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                          клієнт: {t.client}
                        </span>
                      : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
                          невідомий відправник
                        </span>}
                    {t.attachments > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                        <Paperclip size={9} /> {t.attachments} вклад.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {data && data.threads.length > 0 && (
          <p className="max-w-[760px] mx-auto text-[10.5px] mt-3 px-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            «Створити замовлення» робить те саме, що «Перевірити пошту» в таблиці: вкладення
            (включно з ZIP) лягають у папку на Диску, створюється картка зі статусом «Нова».
            Відомі клієнти отримують мітку «Оброблено», невідомі — «Невідомий клієнт».
            Архіви понад 10МБ Gmail не віддає — їх треба класти на Диск вручну.
          </p>
        )}
      </div>
    </div>
  );
}
