// ================================================================
//  src/lib/ai.ts — спільний шар ШІ-розбору креслень.
//
//  Один прохід на файл дає все одразу: штамп, ТМЦ і склад збірки.
//  Тому покупні, кількості в комплекті, матеріал і вага — це не
//  чотири аналізи, а чотири погляди на один результат.
//
//  Що тут важливо:
//   • PDF іде як ДОКУМЕНТ, не картинка — модель читає векторний
//     текст креслення, а не піксельну кашу з мініатюри;
//   • відповідь обмежена жорсткою JSON-схемою на рівні API;
//   • системний промпт кешується (дешевше і швидше на другому файлі),
//     тому перший запит іде САМ — паралельні не бачать чужий кеш,
//     поки він ще пишеться;
//   • уже розібране береться з аркуша «Розбір» і не оплачується вдруге.
// ================================================================

import { api, getToken } from '../api';

/** У проді Worker роздає і додаток, і /api/ai; у dev — ходимо на прод-Worker. */
const AI_URL =
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'https://erp-app1.onischuk-zt.workers.dev/api/ai'
    : '/api/ai';

const MODEL = 'claude-opus-5';
/** Ціна моделі за мільйон токенів — щоб показувати вартість чесно. */
const PRICE_IN = 5, PRICE_OUT = 25;

/** Позиція специфікації складального креслення. */
export interface SpecItem {
  pos: string;
  /** Децимальник або позначення стандарту (ГОСТ/ДСТУ/DIN). */
  code: string;
  name: string;
  qty: string;
  material: string;
  /** Рядок без децимальника, але зі стандартом — покупне. */
  purchased: boolean;
  page: number;
  /** Дослівний текст рядка специфікації — щоб було що перевірити. */
  sourceText: string;
  confidence: 'high' | 'medium' | 'low';
  /** Номер рядка в аркуші «Розбір_склад» — для журналу виправлень. */
  row?: number;
  /** Ваша правка, якщо вже була. */
  corrected?: string;
}

export interface ParsedDrawing {
  fileId: string;
  name: string;
  size: number;
  type: 'assembly' | 'part' | 'spec';
  designation: string;
  itemName: string;
  material: string;
  thickness: string;
  diameter: string;
  profile: string;
  mass: string;
  format: string;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  items: SpecItem[];
  /** Взято з аркуша, а не з моделі — коштувало $0. */
  fromCache: boolean;
  cost: number;
  error?: string;
}

export interface ParseProgress {
  done: number;
  total: number;
  name: string;
  cost: number;
  cached: number;
}

const SYSTEM = `Ти технолог-нормувальник на підприємстві металообробки. Читаєш машинобудівні креслення (ЄСКД) і витягуєш дані ДОСЛІВНО, нічого не додумуючи.

Правила:
1. Штамп (основний напис) — джерело істини для децимальника, найменування, матеріалу, маси, формату аркуша.
2. Якщо поля на кресленні немає — порожній рядок. НЕ вгадуй і не підставляй типове значення.
3. Числа переписуй так, як на кресленні: кома лишається комою, дріб лишається дробом.
4. У evidence наведи дослівний фрагмент, з якого взято матеріал.
5. confidence: high — прочитано чітко; medium — видно погано або є неоднозначність; low — здогад, треба перевірити людині.
6. Тип документа: assembly — складальне креслення зі специфікацією; part — креслення однієї деталі; spec — окрема специфікація.
7. Для assembly і spec заповни items — УСІ рядки специфікації по порядку. Для part залиш items порожнім.
8. Позиція БЕЗ децимальника, але зі стандартом (ГОСТ, ДСТУ, DIN, ISO) або явно кріпильна (болт, гайка, шайба, гвинт, шпилька, заклепка, підшипник, шплінт, штифт) — це ПОКУПНЕ: purchased=true. Виготовлювані деталі з децимальником — purchased=false.
9. У рядку специфікації розділяй так: name — що це за виріб словами (Гайка, Болт, Шайба, Кронштейн); code — позначення поруч із ним (децимальник, ГОСТ/ДСТУ/DIN/ISO або типорозмір на кшталт M6x30). «Гайка M6x30 D10» → name «Гайка», code «M6x30 D10». Ніколи не клади слово-назву виробу в code.
10. У sourceText наводь рядок специфікації дослівно, як він надрукований, разом з номером позиції та кількістю.
11. page — номер сторінки PDF, де ти цей рядок побачив (нумерація з 1).`;

const SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['assembly', 'part', 'spec'] },
    designation: { type: 'string' },
    itemName: { type: 'string' },
    material: { type: 'string' },
    thickness: { type: 'string' },
    diameter: { type: 'string' },
    profile: { type: 'string' },
    mass: { type: 'string' },
    format: { type: 'string' },
    evidence: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pos: { type: 'string' },
          code: { type: 'string' },
          name: { type: 'string' },
          qty: { type: 'string' },
          material: { type: 'string' },
          purchased: { type: 'boolean' },
          page: { type: 'integer' },
          sourceText: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['pos', 'code', 'name', 'qty', 'material', 'purchased', 'page', 'sourceText', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['type', 'designation', 'itemName', 'material', 'thickness', 'diameter',
             'profile', 'mass', 'format', 'evidence', 'confidence', 'items'],
  additionalProperties: false,
};

/** ID файлу Диска з посилання в картці. */
export function driveIdFromUrl(url: string): string {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

/**
 * Підпис збірки — один на всю систему: і в колонці «Збірка» картки,
 * і в аркуші «Покупні». Інакше покупні не приліпляться до своєї групи.
 * Назва зрозуміліша за шифр, тому вона перша.
 */
export function assemblyLabel(p: { itemName?: string; designation?: string; name?: string }): string {
  return String(p.itemName || p.designation || String(p.name || '').replace(/\.pdf$/i, '')).trim();
}

/**
 * Децимальний номер із назви: ТБМД.000000.059 | IB.Mil.2360.01.00.00.003-04 | 000800.012.
 * Порт extractDecimal_ із хаба — зіставлення має працювати однаково з обох боків.
 */
export function extractDecimal(s: string): string {
  const re = /((?:[A-Za-zА-ЯІЇЄҐа-яіїєґ]{1,12}\.){0,3}(?:\d{2,6}[.\-]){1,7}\d{2,6}(?:-\d{1,3})?)/g;
  let best = '', m: RegExpExecArray | null;
  while ((m = re.exec(String(s || ''))) !== null) if (m[1].length > best.length) best = m[1];
  return best.replace(/^[._\-\s]+|[._\s]+$/g, '');
}

/**
 * ЧИСЛОВЕ ЯДРО децимальника: літерний шифр відкидається, бо той самий номер
 * буває з префіксом і без (IB.Mil.2360.01.00.00.003 ↔ 2360.01.00.00.003).
 */
export function decimalCore(s: string): string {
  return extractDecimal(s).replace(/^(?:[A-Za-zА-ЯІЇЄҐа-яіїєґ]{1,12}[.\-])+/, '').replace(/\s+/g, '');
}

/** Назва без розширення і розділових — запасний ключ, коли децимальника немає. */
export function normName(s: string): string {
  return String(s || '').replace(/\.[A-Za-z0-9]{2,5}$/, '').toLowerCase()
    .replace(/[^0-9a-zа-яіїєґё]+/g, '');
}

async function callAI(base64: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(AI_URL, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-erp-token': getToken() },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,          // міркування рахуються РАЗОМ з відповіддю
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Розбери це креслення за правилами.' },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data?.error?.message || data?.error || `ШІ: ${res.status}`);
  // Модель може відмовитись — тоді контенту немає, і читати його не можна
  if (data.stop_reason === 'refusal') throw new Error('Запит відхилено перевіркою безпеки');
  if (data.stop_reason === 'max_tokens') throw new Error('Відповідь не помістилась — креслення надто велике');
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return { parsed: JSON.parse(text), usage: data.usage };
}

/** Рядок кеша з аркуша «Розбір» → наш обʼєкт. */
function fromCacheRow(r: any, items: any[]): ParsedDrawing {
  return {
    fileId: String(r['3'] || ''), name: String(r['2'] || ''), size: Number(r['4'] || 0),
    type: (String(r['5'] || 'part') as ParsedDrawing['type']),
    designation: String(r['6'] || ''), itemName: String(r['7'] || ''),
    material: String(r['8'] || ''), thickness: String(r['9'] || ''),
    diameter: String(r['10'] || ''), profile: String(r['11'] || ''),
    mass: String(r['12'] || ''), format: String(r['13'] || ''),
    confidence: (String(r['14'] || 'medium') as ParsedDrawing['confidence']),
    evidence: String(r['15'] || ''),
    items: (items || []).map(it => ({
      row: it.row,
      pos: String(it['3'] || ''), code: String(it['4'] || ''), name: String(it['5'] || ''),
      qty: String(it['6'] || ''), material: String(it['7'] || ''),
      purchased: String(it['8'] || '').trim() === 'так',
      page: Number(it['9'] || 0), sourceText: String(it['10'] || ''),
      confidence: (String(it['11'] || 'medium') as SpecItem['confidence']),
      corrected: String(it['12'] || ''),
    })),
    fromCache: true, cost: 0,
  };
}

export interface ParseInput { fileId: string; name: string; size: number }

/**
 * Розбір списку креслень. Що вже є в аркуші «Розбір» — не оплачується.
 * Перший новий файл іде сам (прогріває кеш системного промпту),
 * решта — пулом по `concurrency`.
 *
 * ОДНЕ КРЕСЛЕННЯ — ОДИН РЕЗУЛЬТАТ. Той самий файл стоїть у картці
 * кількома рядками (маршрут: лазер → гнуття), тому в списку він
 * приходить кілька разів. Якби ми віддали його стільки ж разів,
 * склад збірки й покупні порахувались би подвійно — саме так
 * колись подвоїлась вага в ТМЦ.
 */
export async function parseDrawings(
  order: string,
  input: ParseInput[],
  opts: { onProgress?: (p: ParseProgress) => void; concurrency?: number; signal?: AbortSignal } = {}
): Promise<ParsedDrawing[]> {
  const { onProgress, concurrency = 6, signal } = opts;
  const seen = new Set<string>();
  const files = input.filter(f => {
    if (!f.fileId || seen.has(f.fileId)) return false;
    seen.add(f.fileId);
    return true;
  });
  const out = new Map<string, ParsedDrawing>();
  let cost = 0, done = 0, cached = 0;
  const tick = (name: string) => onProgress?.({ done, total: files.length, name, cost, cached });

  // 1. що вже розібрано
  try {
    const c = await api.aiParseGet(files.map(f => ({ fileId: f.fileId, size: f.size })));
    (c.rows || []).forEach((r: any) => {
      const id = String(r['3'] || '');
      out.set(id, fromCacheRow(r, (c.items || {})[id] || []));
      done++; cached++;
    });
  } catch { /* кеш недоступний — просто розберемо все наново */ }
  tick('');

  const todo = files.filter(f => !out.has(f.fileId));
  if (!todo.length) return files.map(f => out.get(f.fileId)!).filter(Boolean);

  const results: ParsedDrawing[] = [];
  const runOne = async (f: ParseInput) => {
    tick(f.name);
    try {
      const fd = await api.fileData(f.fileId);
      const { parsed, usage } = await callAI(fd.base64, signal);
      const c = usage.input_tokens / 1e6 * PRICE_IN + usage.output_tokens / 1e6 * PRICE_OUT;
      cost += c;
      const rec: ParsedDrawing = {
        fileId: f.fileId, name: f.name, size: f.size, ...parsed,
        fromCache: false, cost: Math.round(c * 100000) / 100000,
      };
      results.push(rec);
      out.set(f.fileId, rec);
    } catch (e: any) {
      out.set(f.fileId, {
        fileId: f.fileId, name: f.name, size: f.size, type: 'part',
        designation: '', itemName: '', material: '', thickness: '', diameter: '',
        profile: '', mass: '', format: '', evidence: '', confidence: 'low',
        items: [], fromCache: false, cost: 0, error: e?.message || 'не вдалося розібрати',
      });
    }
    done++;
    tick(f.name);
  };

  // 2. перший — сам, щоб решта читала вже прогрітий кеш промпту
  await runOne(todo[0]);

  // 3. решта — пулом
  const queue = todo.slice(1);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      if (signal?.aborted) return;
      await runOne(queue[cursor++]);
    }
  }));

  // 4. зберігаємо — наступного разу це вже кеш
  if (results.length) {
    try {
      await api.aiParseSave(results.map(r => ({
        fileId: r.fileId, order, name: r.name, size: r.size, type: r.type,
        designation: r.designation, itemName: r.itemName, material: r.material,
        thickness: r.thickness, diameter: r.diameter, profile: r.profile,
        mass: r.mass, format: r.format, confidence: r.confidence, evidence: r.evidence,
        model: MODEL, tokensIn: 0, tokensOut: 0, cost: r.cost, items: r.items,
      })));
    } catch { /* не зберегли — результат усе одно показуємо */ }
  }
  return files.map(f => out.get(f.fileId)!).filter(Boolean);
}
