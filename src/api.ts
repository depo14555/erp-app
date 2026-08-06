// ================================================================
//  src/api.ts — зв'язок з таблицею-хабом (Apps Script Web App)
//
//  Хаб приймає POST { token, action: 'erp.*', ... } і відповідає
//  { status:'success', data } / { status:'error', message }.
//  Токен = API_AUTH_SECRET зі Script Properties хаба; зберігається
//  в localStorage (вводиться один раз при першому вході).
// ================================================================

import {
  OrdersResponse, OrderDetail, ChatThread, ChatMessage,
} from './types';

const WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxuGYsq8E6zJc-Kh9pUEuiN4Qg_VH0ZkfGcP13DN-m0YVOp2B82xMiJ_ooGOq61xWok/exec';

const REQUEST_TIMEOUT = 30000;
const RETRY_DELAY = 1500;
const CACHE_TTL = 5 * 60 * 1000;

const TOKEN_KEY = 'erp-api-token';
const CACHE_PREFIX = 'erp-cache:';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t.trim());
}
export function hasToken(): boolean {
  return getToken().length > 0;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Читання можна безпечно повторити; мутації — ні (щоб не задвоїти запис). */
function isReadAction(action: string): boolean {
  return !/^erp\.(set|chatSend)/.test(action);
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as T;
  } catch { return null; }
}
function cacheSet(key: string, data: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* сховище переповнене — не критично */ }
}
/** Останній відомий стан (навіть протухлий) — для офлайну. */
function cacheGetStale<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw).data as T;
  } catch { return null; }
}

async function fetchOnce(payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ ...payload, token: getToken() }),
      mode: 'cors',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Мережа: ${res.statusText}`);
    const json = await res.json();
    if (json.status === 'success') return json.data;
    if (json.error === 'Unauthorized') throw new Error('Невірний ключ доступу');
    throw new Error(json.message || json.error || 'Невідома помилка');
  } finally {
    clearTimeout(timer);
  }
}

async function post(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const payload = { action, ...params };
  try {
    return await fetchOnce(payload);
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    if (isReadAction(action) && (isAbort || !navigator.onLine || /Мережа|Failed to fetch/.test(err?.message || ''))) {
      await wait(RETRY_DELAY);
      return fetchOnce(payload);
    }
    throw err;
  }
}

export const api = {
  /** Список замовлень + довідники статусів (кешується на 5 хв). */
  async getOrders(force = false): Promise<OrdersResponse> {
    if (!force) {
      const cached = cacheGet<OrdersResponse>('orders');
      if (cached) return cached;
    }
    try {
      const data = await post('erp.orders');
      cacheSet('orders', data);
      return data;
    } catch (err) {
      const stale = cacheGetStale<OrdersResponse>('orders');
      if (stale) return stale;
      throw err;
    }
  },

  /** Позиції замовлення. */
  async getOrder(headerRow: number, force = false): Promise<OrderDetail> {
    const key = `order:${headerRow}`;
    if (!force) {
      const cached = cacheGet<OrderDetail>(key);
      if (cached) return cached;
    }
    try {
      const data = await post('erp.order', { headerRow });
      cacheSet(key, data);
      return data;
    } catch (err) {
      const stale = cacheGetStale<OrderDetail>(key);
      if (stale) return stale;
      throw err;
    }
  },

  setOrderStatus(headerRow: number, status: string): Promise<{ ok: boolean }> {
    return post('erp.setOrderStatus', { headerRow, status });
  },

  setRowStatus(row: number, status: string): Promise<{ ok: boolean }> {
    return post('erp.setRowStatus', { row, status });
  },

  async getChatThreads(): Promise<ChatThread[]> {
    const data = await post('erp.chatThreads');
    return data.threads || [];
  },

  async getChatMessages(executor: string): Promise<ChatMessage[]> {
    const data = await post('erp.chatMessages', { executor });
    return data.messages || [];
  },

  chatSend(executor: string, message: string): Promise<{ ok: boolean; delivered: boolean }> {
    return post('erp.chatSend', { executor, message });
  },

  /** Перевірка ключа при першому вході. */
  async checkToken(): Promise<boolean> {
    await post('erp.orders');
    return true;
  },
};
