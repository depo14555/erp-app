// ================================================================
//  src/components/CreateOrderSheet.tsx — ➕ нове замовлення прямо
//  з додатка: клієнт (з Контактів), статус, термін, файли КД —
//  вкладення летять у створену папку на Диску (ZIP до 8МБ
//  розпаковуються), картка з'являється в таблиці як від пошти.
// ================================================================

import { useEffect, useRef, useState } from 'react';
import { X, PlusCircle, Loader2, Paperclip, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { Lists, CreateOrderResult, statusStyle } from '../types';

interface Props {
  lists: Lists | null;
  orderStatusList: string[];
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onCreated: (headerRow: number) => void; // відкрити нову картку
}

type Phase = 'form' | 'work' | 'done';
const MAX_FILE = 25 * 1024 * 1024;

export default function CreateOrderSheet({ lists, orderStatusList, onClose, onToast, onCreated }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState('Нова');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [result, setResult] = useState<CreateOrderResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clientsId = 'create-order-clients';

  useEffect(() => {
    if (!orderStatusList.includes('Нова') && orderStatusList.length) setStatus(orderStatusList[0]);
  }, [orderStatusList]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) { onToast(`«${f.name}» більше 25 МБ — покладіть на Диск вручну`, true); continue; }
      if (!next.some(e => e.name === f.name && e.size === f.size)) next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function create() {
    setPhase('work');
    setProgress({ done: 0, total: files.length, label: 'Створюю картку і папку…' });
    try {
      const dl = deadline ? deadline.split('-').reverse().join('.') : '';
      const res = await api.createOrder({ clientName: client.trim(), status, deadline: dl, note: note.trim() });

      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress({ done: i, total: files.length, label: f.name });
        try {
          const base64 = await toBase64(f);
          await api.uploadOrderFile(res.headerRow, f.name, base64, f.type || 'application/octet-stream');
        } catch {
          failed.push(f.name);
        }
      }
      setProgress({ done: files.length, total: files.length, label: '' });
      if (failed.length) onToast(`Не завантажились: ${failed.join(', ')}`, true);
      setResult(res);
      setPhase('done');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося створити замовлення', true);
      setPhase('form');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className="relative w-full lg:w-[520px] max-h-[94dvh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <PlusCircle size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Нове замовлення</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              картка в таблиці + папка на Диску, файли — одразу в неї
            </p>
          </div>
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'form' && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider pb-1" style={{ color: 'var(--ink-3)' }}>Клієнт</p>
                <input value={client} onChange={e => setClient(e.target.value)} list={clientsId}
                  placeholder="Почніть вводити — підкаже з Контактів"
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[13px] font-semibold" />
                <datalist id={clientsId}>
                  {(lists?.clients || []).map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider pb-1" style={{ color: 'var(--ink-3)' }}>Статус</p>
                  <div className="relative">
                    <select value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 rounded-xl text-[12.5px] font-bold outline-none focus:ring-2 focus:ring-blue-400"
                      style={{ background: statusStyle(status).bg, color: statusStyle(status).fg }}>
                      {(orderStatusList.length ? orderStatusList : ['Нова']).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: statusStyle(status).fg }}>▼</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider pb-1" style={{ color: 'var(--ink-3)' }}>Термін</p>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12.5px]" />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider pb-1" style={{ color: 'var(--ink-3)' }}>Примітка</p>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="необов'язково"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12.5px]" />
              </div>

              {/* Файли */}
              <div>
                <div className="flex items-center pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
                    Файли КД · {files.length}
                  </p>
                  <button onClick={() => fileRef.current?.click()}
                    className="ml-auto flex items-center gap-1 text-[11.5px] font-bold press rounded-lg px-1.5 py-0.5" style={{ color: 'var(--accent)' }}>
                    <Paperclip size={12} /> Додати файли
                  </button>
                </div>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
                {files.length === 0 ? (
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full py-6 rounded-2xl border-2 border-dashed border-gray-200 text-[12px] press hover:border-blue-300"
                    style={{ color: 'var(--ink-3)' }}>
                    📎 Креслення, DXF, ZIP — усе полетить у папку замовлення<br />
                    <span className="text-[10.5px]">(ZIP до 8 МБ розпакується сам)</span>
                  </button>
                ) : (
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200/60">
                        <span className="flex-1 text-[11.5px] font-semibold truncate">{f.name}</span>
                        <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
                          {(f.size / 1024 / 1024).toFixed(1)} МБ
                        </span>
                        <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                          className="p-1 rounded-lg press text-red-400" aria-label="Прибрати">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={create}
                className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press"
                style={{ background: 'var(--accent)' }}>
                ➕ Створити замовлення{files.length ? ` · ${files.length} файл.` : ''}
              </button>
            </div>
          </>
        )}

        {phase === 'work' && (
          <div className="p-8 flex flex-col items-center gap-3">
            <Loader2 size={26} className="animate-spin text-[var(--accent)]" />
            <p className="text-[13px] font-bold tabular-nums">
              {progress.total ? `${progress.done} / ${progress.total} файлів` : 'Створюю…'}
            </p>
            {progress.total > 0 && (
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round(100 * progress.done / Math.max(1, progress.total))}%`, background: 'var(--accent)' }} />
              </div>
            )}
            <p className="text-[11.5px] truncate max-w-full" style={{ color: 'var(--ink-3)' }}>{progress.label}</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Замовлення {result.orderNum} створено</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                Шифр {result.projectId} · файли в папці · далі — Специфікація або Тех.запуск
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onCreated(result.headerRow)}
                className="flex-1 py-2.5 rounded-2xl font-bold text-[13px] text-white press"
                style={{ background: 'var(--accent)' }}>
                Відкрити замовлення
              </button>
              {result.folderUrl && (
                <a href={result.folderUrl} target="_blank" rel="noreferrer"
                  className="px-4 py-2.5 rounded-2xl font-bold text-[13px] press border inline-flex items-center gap-1.5"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                  <ExternalLink size={14} /> Папка
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function toBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}
