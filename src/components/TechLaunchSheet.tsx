// ================================================================
//  src/components/TechLaunchSheet.tsx — 🚀 Тех.запуск, як у таблиці:
//  файли з папки замовлення (PDF → DXF → STEP), кожному — операції
//  галочками, кількість, «Ліва і Права» (дзеркальні деталі пишуться
//  двома рядками), примітка. Одним натисканням рядки дописуються
//  в кінець картки; дублі (файл+операція) відсіюються.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X, Rocket, Loader2, ExternalLink, ChevronDown, ChevronRight,
  FileText, Ruler, Box, FlipHorizontal2,
} from 'lucide-react';
import { api } from '../api';
import { OrderDetail, TechFilesData, TechLaunchItem, TechLaunchResult } from '../types';

interface Props {
  detail: OrderDetail;
  onClose: () => void;
  onToast: (msg: string, err?: boolean) => void;
  onLaunched: () => void; // оновити замовлення
}

type Phase = 'load' | 'pick' | 'work' | 'done';

interface FileState {
  ops: Set<string>;
  qty: string;
  mirror: boolean;
  note: string;
}

const EXT_META: Record<string, { Icon: typeof FileText; color: string }> = {
  pdf: { Icon: FileText, color: '#0D47A1' },
  dxf: { Icon: Ruler, color: '#E65100' },
  dwg: { Icon: Ruler, color: '#E65100' },
  step: { Icon: Box, color: '#1B5E20' },
  stp: { Icon: Box, color: '#1B5E20' },
  igs: { Icon: Box, color: '#1B5E20' },
  iges: { Icon: Box, color: '#1B5E20' },
};

export default function TechLaunchSheet({ detail, onClose, onToast, onLaunched }: Props) {
  const [data, setData] = useState<TechFilesData | null>(null);
  const [phase, setPhase] = useState<Phase>('load');
  const [state, setState] = useState<Record<string, FileState>>({});
  const [open, setOpen] = useState<string>('');
  const [fExt, setFExt] = useState('');
  const [q, setQ] = useState('');
  const [result, setResult] = useState<TechLaunchResult | null>(null);

  useEffect(() => {
    api.techFiles(detail.header.headerRow)
      .then(d => { setData(d); setPhase('pick'); })
      .catch(e => { onToast(e?.message || 'Не вдалося прочитати папку', true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingSet = useMemo(() => {
    const s = new Set<string>();
    data?.existing.forEach(e => s.add((e.name + '|' + e.op).toLowerCase()));
    return s;
  }, [data]);
  const inTable = useMemo(() => {
    const s = new Set<string>();
    data?.existing.forEach(e => s.add(e.name.toLowerCase()));
    return s;
  }, [data]);

  const files = useMemo(() => (data?.files || []).filter(f => {
    if (fExt === 'pdf' && f.ext !== 'pdf') return false;
    if (fExt === 'dxf' && !['dxf', 'dwg'].includes(f.ext)) return false;
    if (fExt === '3d' && !['step', 'stp', 'igs', 'iges'].includes(f.ext)) return false;
    const query = q.trim().toLowerCase();
    return !query || f.name.toLowerCase().includes(query) || f.folderName.toLowerCase().includes(query);
  }), [data, fExt, q]);

  function fs(id: string): FileState {
    return state[id] || { ops: new Set(), qty: '', mirror: false, note: '' };
  }
  function patch(id: string, p: Partial<FileState>) {
    setState(prev => ({ ...prev, [id]: { ...fs(id), ...p } }));
  }
  function toggleOp(id: string, op: string) {
    const cur = fs(id);
    const ops = new Set(cur.ops);
    if (ops.has(op)) ops.delete(op); else ops.add(op);
    patch(id, { ops });
  }

  const planned = useMemo(() => {
    let rows = 0, filesCnt = 0;
    for (const f of data?.files || []) {
      const s = state[f.id];
      if (!s || !s.ops.size) continue;
      filesCnt++;
      rows += s.ops.size * (s.mirror ? 2 : 1);
    }
    return { rows, files: filesCnt };
  }, [state, data]);

  async function launch() {
    if (!data || !planned.rows) return;
    const items: TechLaunchItem[] = data.files
      .filter(f => state[f.id]?.ops.size)
      .map(f => {
        const s = state[f.id];
        return {
          fileId: f.id, name: f.name, folderName: f.folderName,
          ops: [...s.ops], qty: parseInt(s.qty, 10) > 0 ? parseInt(s.qty, 10) : undefined,
          mirror: s.mirror, note: s.note.trim() || undefined,
        };
      });
    setPhase('work');
    try {
      const res = await api.techLaunch(detail.header.headerRow, items);
      setResult(res);
      setPhase('done');
      onLaunched();
    } catch (e: any) {
      onToast(e?.message || 'Не вдалося запустити', true);
      setPhase('pick');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={phase === 'work' ? undefined : onClose} />
      <div className="relative w-full lg:w-[640px] max-h-[94dvh] lg:max-h-[88vh] bg-white rounded-t-3xl lg:rounded-3xl flex flex-col shadow-2xl animate-sheet-up overflow-hidden">

        {/* Шапка */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b hairline flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Rocket size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-tight">Тех.запуск</p>
            <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              {detail.header.orderNum || detail.header.projectId}
              {data ? ` · файлів у папці: ${data.files.length}` : ''}
            </p>
          </div>
          {phase !== 'work' && (
            <button onClick={onClose} className="p-2 rounded-xl press" style={{ color: 'var(--ink-3)' }} aria-label="Закрити">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'load' && (
          <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-[var(--accent)]" /></div>
        )}

        {phase === 'pick' && data && (
          <>
            {/* Фільтри файлів */}
            <div className="flex-shrink-0 px-4 pt-2.5 flex items-center gap-1.5">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук файлу…"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-gray-50 ring-1 ring-gray-200/80 focus:ring-2 focus:ring-blue-400 focus:bg-white outline-none text-[12px]" />
              {[['', 'Всі'], ['pdf', 'PDF'], ['dxf', 'DXF'], ['3d', '3D']].map(([v, label]) => (
                <button key={v} onClick={() => setFExt(v)}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors flex-shrink-0"
                  style={fExt === v ? { background: 'var(--ink)', color: '#fff' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Файли */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2.5 space-y-1">
              {files.map(f => {
                const s = fs(f.id);
                const isOpen = open === f.id;
                const meta = EXT_META[f.ext] || EXT_META.pdf;
                const already = inTable.has(f.name.toLowerCase());
                return (
                  <div key={f.id} className={`rounded-2xl ring-1 transition-colors ${s.ops.size ? 'ring-orange-200 bg-orange-50/40' : 'ring-gray-200/70 bg-white'}`}>
                    <button onClick={() => setOpen(isOpen ? '' : f.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left press">
                      <meta.Icon size={15} style={{ color: meta.color }} className="flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-semibold truncate">{f.name}</span>
                        <span className="block text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>
                          {f.folderName || '—'}
                          {already && <span className="text-emerald-600 font-bold"> · вже в таблиці</span>}
                        </span>
                      </span>
                      {s.ops.size > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700 flex-shrink-0">
                          {[...s.ops].join(' · ')}{s.mirror ? ' ×2' : ''}
                        </span>
                      )}
                      <a href={`https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg press flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-label="Відкрити файл">
                        <ExternalLink size={13} />
                      </a>
                      {isOpen ? <ChevronDown size={14} className="text-gray-300 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="px-2.5 pb-2.5 space-y-2">
                        {/* Операції */}
                        <div className="flex flex-wrap gap-1">
                          {data.ops.map(op => {
                            const on = s.ops.has(op);
                            const dup = existingSet.has((f.name + '|' + op).toLowerCase());
                            return (
                              <button key={op} onClick={() => toggleOp(f.id, op)}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                                style={on
                                  ? { background: 'var(--accent)', color: '#fff' }
                                  : dup
                                    ? { background: '#ECFDF5', color: '#059669' }
                                    : { background: '#F3F4F6', color: 'var(--ink-2)' }}
                                title={dup ? 'Ця операція вже є в картці — буде пропущена' : ''}>
                                {op}{dup ? ' ✓' : ''}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input value={s.qty} onChange={e => patch(f.id, { qty: e.target.value.replace(/\D/g, '') })}
                            placeholder="К-сть" inputMode="numeric"
                            className="w-[76px] px-2.5 py-1.5 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12px] tabular-nums" />
                          <button onClick={() => patch(f.id, { mirror: !s.mirror })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                            style={s.mirror ? { background: '#EDE7F6', color: '#4527A0' } : { background: '#F3F4F6', color: 'var(--ink-2)' }}>
                            <FlipHorizontal2 size={12} /> Ліва і Права
                          </button>
                          <input value={s.note} onChange={e => patch(f.id, { note: e.target.value })}
                            placeholder="Примітка…"
                            className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-xl bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400 outline-none text-[12px]" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!files.length && (
                <p className="text-center text-[12.5px] py-8" style={{ color: 'var(--ink-3)' }}>Нічого не знайдено</p>
              )}
            </div>

            {/* Кнопка запуску */}
            <div className="flex-shrink-0 p-3 border-t hairline pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={launch} disabled={!planned.rows}
                className="w-full py-3 rounded-2xl font-bold text-[14px] text-white press disabled:opacity-40"
                style={{ background: '#EA580C' }}>
                🚀 Запустити в таблицю · {planned.rows} рядків ({planned.files} файлів)
              </button>
              <p className="text-[10.5px] text-center mt-1.5" style={{ color: 'var(--ink-3)' }}>
                По рядку на кожну операцію · «Ліва і Права» — двома рядками · дублі відсіюються
              </p>
            </div>
          </>
        )}

        {phase === 'work' && (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-orange-600" />
            <p className="text-[13px] font-bold">Дописую рядки в картку…</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="p-6 space-y-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mx-auto text-[22px]">✅</div>
              <p className="font-bold text-[15px] mt-2">Створено {result.created} рядків</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                ID продовжили нумерацію картки, формули підсумків оновлено
              </p>
            </div>
            {result.skipped.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] leading-relaxed">
                Пропущено як дублі ({result.skipped.length}): {result.skipped.slice(0, 5).join('; ')}{result.skipped.length > 5 ? '…' : ''}
              </div>
            )}
            <button onClick={onClose} className="w-full py-2.5 rounded-2xl font-bold text-[13px] text-white press" style={{ background: 'var(--accent)' }}>
              Готово
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
