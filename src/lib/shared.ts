// ================================================================
//  src/lib/shared.ts — файл, який «розшарили» в додаток.
//
//  Сервіс-воркер (public/share-target-sw.js) кладе його в Cache
//  Storage і перекидає нас на /?share=N. Тут ми його звідти дістаємо
//  й одразу прибираємо, щоб той самий рахунок не спливав удруге.
// ================================================================

const SHARE_CACHE = 'erp-shared-files';

export interface SharedFile {
  name: string;
  mime: string;
  base64: string;
  size: number;
}

/** Скільки файлів чекає — з адресного рядка, без звернення до кеша. */
export function sharedCount(): number {
  const n = parseInt(new URLSearchParams(location.search).get('share') || '', 10);
  return n > 0 ? n : 0;
}

/** Прибрати ?share= з адреси, щоб оновлення сторінки не відкривало форму знову. */
export function clearShareParam(): void {
  const u = new URL(location.href);
  u.searchParams.delete('share');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Забрати розшарені файли й одразу очистити кеш. */
export async function takeSharedFiles(): Promise<SharedFile[]> {
  if (!('caches' in window)) return [];
  const out: SharedFile[] = [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    for (const req of await cache.keys()) {
      if (!/\/shared\/\d+$/.test(new URL(req.url).pathname)) continue;
      const res = await cache.match(req);
      if (!res) continue;
      const buf = await res.arrayBuffer();
      out.push({
        name: decodeURIComponent(res.headers.get('x-file-name') || 'рахунок'),
        mime: res.headers.get('content-type') || 'application/octet-stream',
        base64: toBase64(buf),
        size: buf.byteLength,
      });
    }
    for (const req of await cache.keys()) await cache.delete(req);
  } catch { /* кеш недоступний — просто нічого не повертаємо */ }
  return out;
}

/** Файл із <input type="file"> у той самий вигляд. */
export function fileToShared(file: File): Promise<SharedFile> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    fr.onload = () => {
      const s = String(fr.result || '');
      resolve({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        base64: s.slice(s.indexOf(',') + 1),
        size: file.size,
      });
    };
    fr.readAsDataURL(file);
  });
}
