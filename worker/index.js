// ================================================================
//  worker/index.js — Cloudflare Worker, який роздає зібраний PWA
//  і має один службовий маршрут /api/ai.
//
//  Навіщо: ключ Anthropic не можна класти в браузер — його побачив
//  би будь-хто через DevTools. Тому запит іде на цей Worker, він
//  перевіряє наш власний токен доступу (той самий, що й до таблиці-
//  хаба), підставляє ключ зі своїх секретів і пересилає в Anthropic.
//  Ключ живе тільки тут і в жодну відповідь не потрапляє.
//
//  Секрети (панель Cloudflare → Settings → Variables and Secrets):
//    ANTHROPIC_API_KEY — ключ Anthropic
//    ERP_API_TOKEN     — той самий токен, що в додатку (пропуск сюди)
// ================================================================

/** Дозволені моделі: щоб з нашим токеном не можна було замовити що завгодно. */
const ALLOWED_MODELS = new Set([
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
]);

/** Стеля на відповідь — рахує міркування РАЗОМ із текстом. */
const MAX_TOKENS_CAP = 32000;

/** Скільки чекати на Anthropic, перш ніж віддати зрозумілу помилку. */
const UPSTREAM_TIMEOUT_MS = 240000;

/** Порівняння токенів без ранньої відмови (щоб не зливати довжину збігу). */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Дозволяємо звертатись із локального dev-сервера; у проді це той самий origin. */
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const ok = /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
  if (!ok) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, x-erp-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(extra || {}) },
  });
}

async function proxyToAnthropic(request, env) {
  const cors = corsHeaders(request);

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Не налаштований ANTHROPIC_API_KEY у секретах Worker' }, 500, cors);
  }
  if (!env.ERP_API_TOKEN) {
    return json({ error: 'Не налаштований ERP_API_TOKEN у секретах Worker' }, 500, cors);
  }
  if (!sameToken(request.headers.get('x-erp-token') || '', env.ERP_API_TOKEN)) {
    return json({ error: 'Немає доступу' }, 401, cors);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Тіло запиту не є JSON' }, 400, cors);
  }

  if (!ALLOWED_MODELS.has(payload.model)) {
    return json({ error: `Модель «${payload.model}» не дозволена` }, 400, cors);
  }
  // Стеля витрат: клієнт може просити менше, але не більше.
  payload.max_tokens = Math.min(Number(payload.max_tokens) || 8000, MAX_TOKENS_CAP);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    // Тіло віддаємо потоком — довга відповідь не збирається в пам'яті Worker'а
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        ...cors,
      },
    });
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return json({ error: aborted ? 'Anthropic не відповів вчасно' : String(e) }, 504, cors);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== 'POST') {
        return json({ error: 'Тільки POST' }, 405, corsHeaders(request));
      }
      return proxyToAnthropic(request, env);
    }

    // Усе інше — як раніше: зібраний PWA зі статичних ассетів
    return env.ASSETS.fetch(request);
  },
};
