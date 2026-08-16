// ================================================================
//  src/components/StampStrip.tsx — смуга підсумків у стилі ШТАМП.
//
//  Замість набору карток із власними відступами — одна рамка,
//  поділена пунктиром на клітинки: підпис моно з розрядкою, під ним
//  значення. Так підсумки на всіх екранах виглядають однаково,
//  і око знає, де їх шукати, ще до того як прочитає.
// ================================================================

export interface StampCell {
  /** Підпис — коротко, одним-двома словами. */
  k: string;
  /** Значення. Числа краще подавати вже відформатованими. */
  v: string;
  /** Другий рядок дрібним — уточнення, а не другорядне значення. */
  sub?: string;
  /** Виділити акцентом: нуль там, де має бути число; прострочення. */
  hot?: boolean;
  /** Клітинка-кнопка: фільтр, перехід. */
  onClick?: () => void;
  title?: string;
}

export default function StampStrip({ cells, className = '' }: { cells: StampCell[]; className?: string }) {
  if (!cells.length) return null;
  return (
    <div className={`grid rounded-[11px] overflow-hidden bg-white border ${className}`}
      style={{
        borderColor: 'var(--line-2)',
        gridTemplateColumns: `repeat(${Math.min(cells.length, 6)}, minmax(0, 1fr))`,
      }}>
      {cells.map((c, i) => {
        const Tag = (c.onClick ? 'button' : 'div') as 'button';
        return (
          <Tag key={`${c.k}:${i}`} onClick={c.onClick} title={c.title}
            className={`px-3 py-[7px] text-left ${c.onClick ? 'press hover:bg-[var(--bg)]' : ''}`}
            style={{ borderRight: (i + 1) % 6 && i < cells.length - 1 ? '1px dashed var(--line)' : undefined }}>
            <span className="k-label block truncate">{c.k}</span>
            <span className="k-value block text-[14px] truncate"
              style={c.hot ? { color: 'var(--accent)' } : undefined}>
              {c.v}
            </span>
            {c.sub && <span className="k-label block truncate normal-case tracking-normal">{c.sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
