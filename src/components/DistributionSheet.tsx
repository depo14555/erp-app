// ================================================================
//  src/components/DistributionSheet.tsx — 📂 Розподіл КД, як у таблиці:
//  виконавець → операція → файли. Групу можна розгорнути й переглянути
//  всі креслення прямо у вікні (рендер PDF), вибрати кого розподіляти
//  (всіх / окремих виконавців / окремі операції), формат наряду і чи
//  відправляти позиції у таблиці виконавців.
// ================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, FolderTree, Loader2, ExternalLink, ChevronDown, ChevronRight,
  FileText, Eye, User, Wrench, AlertTriangle, CheckSquare, Square,
} from 'lucide-react';
import { api } from '../api';
import {
  OrderDetail, DistributionData, DistributionGroup, DistributionItem,
  DistributeMode, DistributeResult,
} from '../types';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onDone: () => void;
}

type Phase = 'load' | 'pick' | 'work' | 'done';

const MODES: Array<{ key: DistributeMode; label: string; hint: string }> = [
  { key: 'full', label: '📦 Всі', hint: 'копіювати КД усім виконавцям картки' },
  { key: 'select_exec', label: '👤 По виконавцях', hint: 'лише вибрані виконавці' },
  { key: 'select_op', label: '🔧 По операціях', hint: 'лише вибрані операції' },
  { key: 'update_qty', label: '⚡ Тільки к-сть', hint: 'оновити наряди без копіювання файлів' },
];

function keyOf(g: DistributionGroup): string {
  return g.executor + '||' + g.operation;
}

export default function DistributionSheet({ detail, onClose, onToast, onDone }: Props) {
  const [data, setData] = useState<DistributionData | null>(null);
  const [phase, setPhase] = useState<Phase>('load');
  const [mode, setMode] = useState<DistributeMode>('full');
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [docFormat, setDocFormat] = useState<'excel' | 'doc'>('excel');
  const [sendToExecutor, setSendToExecutor] = useState(true);
  const [open, setOpen] = useState('');
  const [result, setResult] = useState<DistributeResult | null>(null);

  // ── Перегляд креслення ──
  const [preview, setPreview] = useState<DistributionItem | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [mobileView, setMobileView] = useState(false);
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    api.distribution(detail.header.headerRow)
      .then(d => {
        setData(d);
        setPhase('pick');
        if (d.groups.length) setOpen(keyOf(d.groups[0]));
      })
      .catch(e => { onToast(e?.message || 'Не вдалося зібрати дані розподілу', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Перемкнули режим — за замовчуванням вибрано все
  useEffect(() => {
    if (!data) return;
    if (mode === 'select_exec') setTargets(new Set(data.executors));
    else if (mode === 'select_op') setTargets(new Set(data.operations));
    else setTargets(new Set());
  }, [mode, data]);

  const targetList = mode === 'select_exec' ? (data?.executors || [])
    : mode === 'select_op' ? (data?.operations || []) : [];

  function inScope(g: DistributionGroup): boolean {
    if (mode === 'select_exec') return targets.has(g.executor);
    if (mode === 'select_op') return targets.has(g.operation);
    return true;
  }

  const scope = useMemo(() => {
    const gs = (data?.groups || []).filter(inScope);
    return {
      groups: gs.length,
      items: gs.reduce((s, g) => s + g.items.length, 0),
      files: gs.reduce((s, g) => s + g.files, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mode, targets]);

  async function loadPreview(it: DistributionItem) {
    if (!it.fileId || !/\.pdf$/i.test(it.name)) {
      if (it.url) window.open(it.url, '_blank');
      return;
    }
    setPreview(it);
    setPreviewError('');
    const cached = cacheRef.current.get(it.fileId);
    if (cached) { setPages(cached); return; }
    setPages(null);
    setPreviewLoading(true);
    try {
      const fd = await api.fileData(it.fileId);
      const { renderDocument } = await import('../lib/photoPdf');
      const rendered = await renderDocument(fd.base64, fd.mime);
      const urls = rendered.map(p => p.canvas.toDataURL('image/jpeg', 0.8));
      cacheRef.current.set(it.fileId, urls);
      setPages(urls);
    } catch (e: any) {
      setPreviewError(e?.message || 'Не вдалося відкрити креслення');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function run() {
    if (!data || !scope.groups) return;
    setPhase('work');
    try {
      const res = await api.distribute(detail.header.headerRow, {
        mode, targets: [...targets], docFormat, sendToExecutor,
      });
      setResult(res);
      setPhase('done');
      onDone();
    } catch (e: any) {
      onToast(e?.message || 'Розподіл не вдався', true);
      setPhase('pick');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className={`relative w-full ${phase === 'pick' ? 'lg:w-[1180px]' : 'lg:w-[640px]'} max-h-[94dvh] lg:max-h-[90vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden`}>

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <FolderTree size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Розподіл КД</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {data ? ` · груп: ${data.groups.length} · позицій: ${data.groups.reduce((s, g) => s + g.items.length, 0)}` : ''}
            </p>
          </div>
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-violet-600" />
            <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>Читаю позиції картки…</p>
          </div>
        )}

        {phase === 'pick' && data && (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(380px,480px)_1fr]">
            {/* ЛІВА КОЛОНКА */}
            <div className="flex flex-col min-h-0">
              {/* Режим */}
              <div className="flex-shrink-0 px-4 pt-2.5 flex flex-wrap gap-1.5">
                {MODES.map(m => (
                  <button key={m.key} onClick={() => setMode(m.key)} title={m.hint}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                    style={mode === m.key
                      ? { background: 'var(--ink)', color: '#fff' }
                      : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Вибір виконавців / операцій */}
              {targetList.length > 0 && (
                <div className="flex-shrink-0 px-4 pt-2 flex flex-wrap gap-1">
                  {targetList.map(t => {
                    const on = targets.has(t);
                    return (
                      <button key={t}
                        onClick={() => setTargets(prev => {
                          const next = new Set(prev);
                          if (next.has(t)) next.delete(t); else next.add(t);
                          return next;
                        })}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors max-w-[190px]"
                        style={on ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: '#F9FAFB', color: 'var(--ink-3)' }}>
                        {on ? <CheckSquare size={12} /> : <Square size={12} />}
                        <span className="truncate">{t}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Групи */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2.5 space-y-1">
                {data.groups.map(g => {
                  const k = keyOf(g);
                  const isOpen = open === k;
                  const active = inScope(g);
                  return (
                    <div key={k} className={`rounded-2xl ring-1 transition-colors ${active ? 'ring-violet-200 bg-violet-50/40' : 'ring-gray-200/70 bg-white opacity-55'}`}>
                      <button onClick={() => setOpen(isOpen ? '' : k)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-left press">
                        <User size={14} className="flex-shrink-0 text-violet-600" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12.5px] font-bold truncate">{g.executor}</span>
                          <span className="block text-[10.5px] truncate" style={{ color: 'var(--ink-3)' }}>
                            <Wrench size={9} className="inline -mt-0.5" /> {g.operation} · {g.items.length} поз. · {g.files} файлів · {g.qty} шт
                          </span>
                        </span>
                        {isOpen ? <ChevronDown size={14} className="text-gray-300 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                      </button>

                      {isOpen && (
                        <div className="px-2 pb-2 space-y-0.5">
                          {g.items.map(it => {
                            const isPdf = /\.pdf$/i.test(it.name);
                            const on = preview?.row === it.row;
                            return (
                              <button key={it.row} onClick={() => loadPreview(it)}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-left press hover:bg-white"
                                style={on ? { background: '#fff', boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}>
                                <FileText size={12} className="flex-shrink-0" style={{ color: isPdf ? '#0D47A1' : 'var(--ink-3)' }} />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[11.5px] truncate">{it.name}</span>
                                  {(it.material || it.thickness) && (
                                    <span className="block text-[10px]" style={{ color: 'var(--ink-3)' }}>
                                      {[it.material, it.thickness && `S${it.thickness}`].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
                                  {it.qty} шт
                                </span>
                                {isPdf ? (
                                  <span onClick={e => { e.stopPropagation(); loadPreview(it); setMobileView(true); }}
                                    className="lg:hidden p-1 rounded-lg press flex-shrink-0 text-[var(--accent)]" aria-label="Переглянути">
                                    <Eye size={13} />
                                  </span>
                                ) : it.url ? (
                                  <a href={it.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                    className="p-1 rounded-lg press flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-label="Відкрити файл">
                                    <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-amber-600 flex-shrink-0">без файлу</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!data.groups.length && (
                  <p className="text-center text-[12.5px] py-8" style={{ color: 'var(--ink-3)' }}>
                    Розподіляти нічого: у позиціях мають бути операція, виконавець і кількість
                  </p>
                )}

                {data.noExec.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] leading-relaxed flex gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Поза розподілом {data.noExec.length} поз. — не заповнені виконавець / операція / кількість:
                      {' '}{data.noExec.slice(0, 3).map(i => i.name).join('; ')}{data.noExec.length > 3 ? '…' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Налаштування + запуск */}
              <div className="flex-shrink-0 p-3 border-t hairline space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Наряд:</span>
                  {([['excel', '📊 Специфікація'], ['doc', '📝 Google Doc']] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setDocFormat(v)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                      style={docFormat === v ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                      {label}
                    </button>
                  ))}
                  <button onClick={() => setSendToExecutor(v => !v)}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                    style={sendToExecutor ? { background: '#ECFDF5', color: '#059669' } : { background: '#F3F4F6', color: 'var(--ink-3)' }}>
                    {sendToExecutor ? <CheckSquare size={12} /> : <Square size={12} />} Відправити виконавцям
                  </button>
                </div>
                <button onClick={run} disabled={!scope.groups}
                  className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40"
                  style={{ background: '#7C3AED' }}>
                  📂 Розподілити · {scope.groups} груп ({scope.items} поз., {scope.files} файлів)
                </button>
                <p className="text-[10.5px] text-center" style={{ color: 'var(--ink-3)' }}>
                  Папки Виконавець → Операція на Диску · колонка «Виконавець» стане посиланням на папку
                </p>
              </div>
            </div>

            {/* ПРАВА КОЛОНКА (десктоп): перегляд креслення */}
            <div className="hidden lg:flex flex-col min-h-0 border-l hairline bg-gray-50">
              <div className="flex-shrink-0 px-3 py-2 border-b hairline bg-white flex items-center gap-2">
                <Eye size={14} className="text-[var(--accent)] flex-shrink-0" />
                <p className="flex-1 text-[12px] font-semibold truncate">
                  {preview ? preview.name : 'Клікніть по файлу — креслення з\'явиться тут'}
                </p>
                {preview?.url && (
                  <a href={preview.url} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg press flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-label="Відкрити на Диску">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col items-center gap-3">
                {previewLoading && (
                  <div className="flex flex-col items-center gap-2 mt-16">
                    <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                    <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>Відкриваю креслення…</p>
                  </div>
                )}
                {previewError && <p className="text-[12px] text-red-600 mt-16">{previewError}</p>}
                {!previewLoading && !previewError && pages?.map((src, i) => (
                  <img key={i} src={src} alt={`стор. ${i + 1}`} className="max-w-full shadow-md rounded-sm bg-white" />
                ))}
                {!preview && !previewLoading && (
                  <div className="text-center mt-20" style={{ color: 'var(--ink-3)' }}>
                    <FolderTree size={34} className="mx-auto mb-2 opacity-30" />
                    <p className="text-[12.5px]">Розгорніть операцію ліворуч —<br />тут можна переглянути всі її креслення</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'work' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-violet-600" />
            <p className="text-[13px] font-bold">Копіюю КД і формую наряди…</p>
            <p className="text-[11.5px] text-center" style={{ color: 'var(--ink-3)' }}>
              Великі замовлення можуть зайняти хвилину-дві — не закривайте вікно
            </p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3 overflow-y-auto">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Розподілено: {result.folders.length} папок</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                Скопійовано файлів: {result.filesCount}
                {result.sent ? ` · відправлено виконавцям: ${result.sent} поз.` : ''}
              </p>
            </div>
            {result.warning && (
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11.5px]">{result.warning}</div>
            )}
            <div className="space-y-1">
              {result.folders.map(f => (
                <a key={f.executor + f.operation} href={f.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl ring-1 ring-gray-200/70 press hover:bg-gray-50">
                  <FolderTree size={14} className="text-violet-600 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-semibold truncate">{f.executor} → {f.operation}</span>
                    <span className="block text-[10.5px]" style={{ color: 'var(--ink-3)' }}>{f.items} поз. · {f.files} файлів</span>
                  </span>
                  <ExternalLink size={13} style={{ color: 'var(--ink-3)' }} />
                </a>
              ))}
            </div>
            {result.mainFolderUrl && (
              <a href={result.mainFolderUrl} target="_blank" rel="noreferrer"
                className="block text-center text-[12px] font-bold py-2 rounded-2xl press" style={{ color: 'var(--accent)' }}>
                Відкрити спільну папку розподілу ↗
              </a>
            )}
            <button onClick={onClose} className="w-full py-2.5 rounded-2xl font-bold text-[13px] text-white press" style={{ background: 'var(--accent)' }}>
              Готово
            </button>
          </div>
        )}
      </div>

      {/* Мобільний повноекранний перегляд */}
      {mobileView && preview && (
        <div className="lg:hidden fixed inset-0 z-[90] bg-gray-900 flex flex-col animate-fade-in">
          <div className="flex-shrink-0 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2 flex items-center gap-2 text-white">
            <p className="flex-1 text-[12.5px] font-semibold truncate">{preview.name}</p>
            <button onClick={() => setMobileView(false)} className="p-2 rounded-xl press text-white/90" aria-label="Закрити перегляд">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col items-center gap-2">
            {previewLoading && <Loader2 size={26} className="animate-spin text-white mt-20" />}
            {previewError && <p className="text-[12.5px] text-red-300 mt-20">{previewError}</p>}
            {pages?.map((src, i) => (
              <img key={i} src={src} alt={`стор. ${i + 1}`} className="max-w-full rounded-sm bg-white" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
