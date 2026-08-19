// ================================================================
//  src/pages/PartPage.tsx — деталь за QR-кодом (#p=<ID>).
//  Працівник у цеху сканує QR на кресленні й бачить: що це за
//  замовлення, характеристики деталі; може змінити статус,
//  додати фото (камера) та примітку.
// ================================================================

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, Camera, FileText, User, Loader2, StickyNote,
  ExternalLink, QrCode, FolderOpen, RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import { PartData, statusStyle } from '../types';
import StatusPicker from '../components/StatusPicker';

interface Props {
  partId: string;
  onClose: () => void;
  onOpenOrder: (headerRow: number, row?: number) => void;
  onToast: (msg: string, err?: boolean) => void;
}

export default function PartPage({ partId, onClose, onOpenOrder, onToast }: Props) {
  const [data, setData] = useState<PartData | null>(null);
  const [error, setError] = useState('');
  const [statusList, setStatusList] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setError('');
    try {
      setData(await api.byId(partId));
    } catch (e: any) {
      setError(e?.message || 'Деталь не знайдено');
    }
  };

  useEffect(() => { setData(null); load(); }, [partId]);
  useEffect(() => {
    api.getOrders().then(d => setStatusList(d.rowStatusList || [])).catch(() => {});
  }, []);

  async function setStatus(s: string) {
    if (!data) return;
    setPick(false);
    setBusy(true);
    try {
      await api.setRowStatus(data.item.row, s);
      setData({ ...data, item: { ...data.item, rowStatus: s } });
      onToast('Статус збережено');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setBusy(false);
    }
  }

  /** Фото з камери: стискаємо до 1600px і віддаємо на хаб. */
  async function onPhoto(file: File) {
    if (!data) return;
    setUploading(true);
    try {
      const base64 = await compressToBase64(file, 1600, 0.82);
      const res = await api.addPhoto(data.item.row, base64, 'image/jpeg', '');
      setData({
        ...data,
        item: { ...data.item, note: (data.item.note ? data.item.note + '\n' : '') + '📷 ' + res.url },
      });
      onToast('Фото додано до замовлення');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося надіслати фото', true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveNote() {
    if (!data || noteDraft === null) return;
    const value = noteDraft.trim();
    setBusy(true);
    try {
      await api.updateRow(data.item.row, { note: value });
      setData({ ...data, item: { ...data.item, note: value } });
      setNoteDraft(null);
      onToast('Примітку збережено');
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося зберегти', true);
    } finally {
      setBusy(false);
    }
  }

  const st = data ? statusStyle(data.item.rowStatus) : null;
  const ost = data ? statusStyle(data.header.status) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--bg)] flex flex-col animate-fade-in">
      {/* Шапка */}
      <header className="flex-shrink-0 bg-white border-b hairline px-2 h-[52px] flex items-center gap-1">
        <button onClick={onClose} className="p-1.5 press rounded-xl" style={{ color: 'var(--accent)' }} aria-label="Назад">
          <ChevronLeft size={24} strokeWidth={2.2} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold truncate leading-tight flex items-center gap-1.5">
            <QrCode size={15} className="text-[var(--accent)] flex-shrink-0" /> {partId}
          </h1>
          <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>Деталь за QR-кодом</p>
        </div>
        <button onClick={load} className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
          <RefreshCw size={17} className={!data && !error ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-8 text-center">
            <p className="text-[28px] mb-2">🤷</p>
            <p className="font-bold text-[15px]">{error}</p>
            <button onClick={load} className="mt-3 px-4 py-2 rounded-xl text-[13px] font-bold text-white press" style={{ background: 'var(--accent)' }}>
              Спробувати ще раз
            </button>
          </div>
        )}

        {!data && !error && (
          <div className="p-10 flex justify-center"><Loader2 size={26} className="animate-spin text-[var(--accent)]" /></div>
        )}

        {data && (
          <div className="max-w-[560px] mx-auto p-3 space-y-3">
            {/* Замовлення */}
            <button onClick={() => onOpenOrder(data.header.headerRow, data.item?.row)}
              className="w-full bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 text-left press">
              <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Замовлення</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-bold text-[16px] flex-1 truncate">{data.header.orderNum || data.header.projectId}</p>
                {ost && data.header.status && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: ost.bg, color: ost.fg }}>
                    {data.header.status}
                  </span>
                )}
              </div>
              {data.header.client && (
                <p className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
                  <User size={12} /> {data.header.client}
                </p>
              )}
            </button>

            {/* Деталь */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3">
              <div className="flex items-start gap-2">
                <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <FileText size={17} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[14px] break-words leading-snug">{data.item.name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{data.item.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-3">
                <Info label="Кількість" value={data.item.qty && `${data.item.qty} шт`} strong />
                <Info label="Операція" value={data.item.op} />
                <Info label="Матеріал" value={data.item.material} />
                <Info label="Товщина" value={data.item.thickness && `S${data.item.thickness}`} />
                <Info label="Виконавець" value={data.item.executor} />
                <Info label="Збірка" value={data.item.assembly} />
              </div>

              <div className="flex gap-2 mt-3">
                {data.item.url && (
                  <a href={data.item.url} target="_blank" rel="noreferrer"
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold press text-center inline-flex items-center justify-center gap-1.5 border"
                    style={{ color: 'var(--accent)', borderColor: 'var(--line)' }}>
                    <ExternalLink size={13} /> Креслення
                  </a>
                )}
                {data.header.folderUrl && (
                  <a href={data.header.folderUrl} target="_blank" rel="noreferrer"
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold press text-center inline-flex items-center justify-center gap-1.5 border"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
                    <FolderOpen size={13} /> Папка
                  </a>
                )}
              </div>
            </div>

            {/* Статус */}
            <button onClick={() => setPick(true)} disabled={busy}
              className="w-full p-3.5 rounded-2xl font-bold text-[15px] press flex items-center justify-center gap-2"
              style={{ background: st!.bg, color: st!.fg }}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : null}
              {data.item.rowStatus || 'Встановити статус'} ▾
            </button>

            {/* Фото + примітка */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="p-3.5 rounded-2xl bg-white ring-1 ring-gray-200/70 press flex flex-col items-center gap-1.5">
                {uploading
                  ? <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
                  : <Camera size={22} className="text-[var(--accent)]" />}
                <span className="text-[12.5px] font-bold">{uploading ? 'Надсилаю…' : 'Додати фото'}</span>
                <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>у папку замовлення</span>
              </button>
              <button onClick={() => setNoteDraft(noteDraft === null ? data.item.note : null)}
                className="p-3.5 rounded-2xl bg-white ring-1 ring-gray-200/70 press flex flex-col items-center gap-1.5">
                <StickyNote size={22} className="text-amber-500" />
                <span className="text-[12.5px] font-bold">Примітка</span>
                <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>{data.item.note ? 'редагувати' : 'додати'}</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => e.target.files?.[0] && onPhoto(e.target.files[0])} />

            {noteDraft !== null && (
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-3 space-y-2">
                <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={3} autoFocus
                  placeholder="Примітка до деталі…"
                  className="k-input w-full p-2.5 rounded-xl outline-none text-[13px]" />
                <div className="flex gap-2">
                  <button onClick={saveNote} disabled={busy}
                    className="flex-1 py-2 rounded-xl text-[12.5px] font-bold text-white press" style={{ background: 'var(--accent)' }}>
                    Зберегти
                  </button>
                  <button onClick={() => setNoteDraft(null)}
                    className="px-4 py-2 rounded-xl text-[12.5px] font-semibold press" style={{ color: 'var(--ink-3)' }}>
                    Скасувати
                  </button>
                </div>
              </div>
            )}

            {data.item.note && noteDraft === null && (
              <div className="bg-amber-50/70 rounded-2xl p-3">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-700">Примітка</p>
                <p className="text-[12.5px] mt-1 whitespace-pre-wrap break-words text-amber-900">{renderNote(data.item.note)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {pick && data && (
        <StatusPicker
          title="Статус позиції"
          subtitle={data.item.name}
          options={statusList}
          current={data.item.rowStatus}
          onPick={setStatus}
          onClose={() => setPick(false)}
        />
      )}
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  if (!value) return null;
  return (
    <div className="p-2 rounded-xl bg-gray-50">
      <p className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</p>
      <p className={`text-[12.5px] mt-0.5 break-words ${strong ? 'font-bold' : 'font-medium'}`}>{value}</p>
    </div>
  );
}

/** Прибираємо довгі Drive-посилання з тексту примітки (фото і так у папці). */
function renderNote(note: string): string {
  return note.replace(/https?:\/\/\S{30,}/g, '(посилання)');
}

/** Стискання фото: канвас до maxSide, JPEG quality → чистий base64. */
async function compressToBase64(file: File, maxSide: number, quality: number): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', quality);
  return out.substring(out.indexOf(',') + 1);
}
