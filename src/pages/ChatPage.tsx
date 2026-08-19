// ================================================================
//  src/pages/ChatPage.tsx
//  Чат із виконавцями: список тредів → переписка (бульбашки).
//  Дані ті самі, що у вкладці 💬 Пульта керування в таблиці.
// ================================================================

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Send, RefreshCw, MessageSquare, Loader2 } from 'lucide-react';
import { api } from '../api';
import { ChatThread, ChatMessage } from '../types';

interface Props {
  onToast: (msg: string, isError?: boolean) => void;
}

export default function ChatPage({ onToast }: Props) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    setLoading(true);
    try {
      setThreads(await api.getChatThreads());
    } catch (err: any) {
      onToast(err?.message || 'Не вдалося завантажити чати', true);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(executor: string) {
    setLoading(true);
    try {
      setMessages(await api.getChatMessages(executor));
    } catch (err: any) {
      onToast(err?.message || 'Не вдалося завантажити переписку', true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => { if (active) loadMessages(active); }, [active]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const msg = text.trim();
    if (!msg || !active) return;
    setSending(true);
    try {
      await api.chatSend(active, msg);
      setText('');
      await loadMessages(active);
      onToast('Надіслано');
    } catch (err: any) {
      onToast(err?.message || 'Не вдалося надіслати', true);
    } finally {
      setSending(false);
    }
  }

  // ── Список тредів ──
  if (!active) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
          <p className="text-[11px] text-gray-400">Виконавців: {threads.length}</p>
          <button onClick={loadThreads} className="p-2 text-blue-600" aria-label="Оновити">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {threads.length === 0 && !loading && (
            <p className="text-center text-gray-400 text-[13px] py-16">Чатів поки немає</p>
          )}
          {threads.map(t => (
            <button
              key={t.executor}
              onClick={() => setActive(t.executor)}
              className="w-full text-left bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[15px]">
                {t.executor.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-bold text-gray-900 truncate flex-1">{t.executor}</p>
                  {t.lastTime && <span className="text-[10px] text-gray-400 flex-shrink-0">{t.lastTime}</span>}
                </div>
                <p className="text-[12px] text-gray-500 truncate mt-0.5">{t.last || 'Немає повідомлень'}</p>
              </div>
              {t.unread > 0 && (
                <span className="flex-shrink-0 min-w-5 h-5 px-1.5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                  {t.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Переписка ──
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center gap-1 px-2 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => setActive(null)} className="p-1 text-blue-600" aria-label="Назад">
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px]">
          {active.charAt(0).toUpperCase()}
        </div>
        <h2 className="flex-1 text-[14px] font-bold text-gray-900 truncate ml-1">{active}</h2>
        <button onClick={() => loadMessages(active)} className="p-2 text-blue-600" aria-label="Оновити">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare size={30} className="mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">Повідомлень ще немає</p>
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.dbRow}
            className={`max-w-[85%] rounded-2xl px-3 py-2 ${
              m.out
                ? 'ml-auto bg-blue-600 text-white'
                : 'bg-white ring-1 ring-gray-200 text-gray-900'
            }`}
          >
            <p className={`text-[10.5px] mb-0.5 ${m.out ? 'text-blue-100' : 'text-gray-400'}`}>
              {m.author}
              {m.itemName && ` · ${m.itemName}`}
              {m.time && ` · ${m.time}`}
            </p>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.msg}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 p-2 bg-white border-t border-gray-200 flex items-end gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder="Повідомлення…"
          className="k-input flex-1 resize-none px-3 py-2.5 rounded-2xl outline-none text-[13px] max-h-28"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="w-11 h-11 flex-shrink-0 rounded-full bg-blue-600 disabled:bg-gray-300 text-white flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Надіслати"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
