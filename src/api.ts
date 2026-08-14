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
  DashboardData, NotificationItem, SearchRow, Lists,
  PartData, LogisticsData, FileData, ExecRowsData, ExecSendResult, ExecRow,
  TechFilesData, TechLaunchItem, TechLaunchResult, MailListData, SavePdfResult,
  FolderFile, BillingData, CommerceContext, CommerceResult, DocType, CreateOrderResult,
  BillingOverview, DistributionData, DistributeParams, DistributeResult, CalcData,
  NestItemsData, NestPrice, ContractorsData, KanbanBoardData, CalcOverview, StaffData,
  PriceData,
} from './types';

/** Середовища: робоча таблиця і тестова копія (щоб не псувати реальні дані). */
export const ENVS = {
  prod: {
    label: 'Робоча таблиця',
    url: 'https://script.google.com/macros/s/AKfycbxuGYsq8E6zJc-Kh9pUEuiN4Qg_VH0ZkfGcP13DN-m0YVOp2B82xMiJ_ooGOq61xWok/exec',
  },
  test: {
    label: 'Тестова копія',
    url: 'https://script.google.com/macros/s/AKfycbyVbeLHISP7xQVUlxPBPIp1J9u-fz63oO3kzPk6iO3_qfrKaXR9trWcQ_QN2tUgjgQ7yg/exec',
  },
} as const;

export type EnvKey = keyof typeof ENVS;

const REQUEST_TIMEOUT = 30000;
const LONG_TIMEOUT = 240000; // важкі операції: тех.запуск, пошта, відправка, збереження PDF
const RETRY_DELAY = 1500;
const CACHE_TTL = 5 * 60 * 1000;

/** Скільки чекати на відповідь — залежить від дії. */
function timeoutFor(action: string): number {
  return /^erp\.(techLaunch|mailProcess|execSend|savePdf|bulkUpdate|groupCard|fillAssembly|fileData|techFiles|distribut|nest|calcOverview|contractors|billingOverview|staffPhoto|prices)/.test(action)
    ? LONG_TIMEOUT
    : REQUEST_TIMEOUT;
}

const ENV_KEY = 'erp-env';
const CACHE_PREFIX = 'erp-cache:';

export function getEnv(): EnvKey {
  const v = localStorage.getItem(ENV_KEY);
  return v === 'test' ? 'test' : 'prod';
}
export function setEnv(env: EnvKey): void {
  localStorage.setItem(ENV_KEY, env);
  clearCache();
}
function webAppUrl(): string {
  return ENVS[getEnv()].url;
}

/** Токен зберігається окремо для кожного середовища. */
function tokenKey(env: EnvKey = getEnv()): string {
  return env === 'test' ? 'erp-api-token-test' : 'erp-api-token';
}
export function getToken(): string {
  return localStorage.getItem(tokenKey()) || '';
}
export function setToken(t: string): void {
  localStorage.setItem(tokenKey(), t.trim());
}
export function hasToken(): boolean {
  return getToken().length > 0;
}
export function clearCache(): void {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Читання можна безпечно повторити; мутації — ні (щоб не задвоїти запис). */
function isReadAction(action: string): boolean {
  return !/^erp\.(set|chatSend|updateRow|bulkUpdate|execSend|addPhoto|fillAssembly|groupCard|techLaunch|mailProcess|savePdf|commerceCreate|createOrder|uploadOrderFile|addOperation|pin|distribute|calcSave|contractorSave|contractorAddOp|staffSave|staffAddSkill|staffPhoto|priceSave|boards)/.test(action);
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
  const timer = setTimeout(() => controller.abort(), timeoutFor(String(payload.action || '')));
  try {
    const res = await fetch(webAppUrl(), {
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

/** Обрив по таймауту → зрозуміле повідомлення замість "signal is aborted". */
function friendlyAbort(action: string): Error {
  return new Error(isReadAction(action)
    ? 'Таблиця довго не відповідає — спробуйте оновити ще раз'
    : 'Не дочекалися відповіді від таблиці. Операція, ймовірно, завершилась — оновіть замовлення і перевірте, перш ніж повторювати.');
}

async function post(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const payload = { action, ...params };
  try {
    return await fetchOnce(payload);
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    if (isReadAction(action) && (isAbort || !navigator.onLine || /Мережа|Failed to fetch/.test(err?.message || ''))) {
      await wait(RETRY_DELAY);
      try {
        return await fetchOnce(payload);
      } catch (err2: any) {
        throw err2?.name === 'AbortError' ? friendlyAbort(action) : err2;
      }
    }
    throw isAbort ? friendlyAbort(action) : err;
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

  /** Редагування полів рядка (десктопна таблиця). */
  updateRow(row: number, fields: Record<string, string>): Promise<{ ok: boolean; changed: string[]; clientSum?: string }> {
    return post('erp.updateRow', { row, fields });
  },

  /** Довідники для випадаючих списків (кеш 5 хв). */
  async getLists(force = false): Promise<Lists> {
    if (!force) {
      const cached = cacheGet<Lists>('lists');
      if (cached) return cached;
    }
    const data = await post('erp.lists');
    cacheSet('lists', data);
    return data;
  },

  /** Зведення для головного екрана. */
  async getDashboard(force = false): Promise<DashboardData> {
    if (!force) {
      const cached = cacheGet<DashboardData>('dashboard');
      if (cached) return cached;
    }
    try {
      const data = await post('erp.dashboard');
      cacheSet('dashboard', data);
      return data;
    } catch (err) {
      const stale = cacheGetStale<DashboardData>('dashboard');
      if (stale) return stale;
      throw err;
    }
  },

  /** Останні події від виконавців. */
  async getNotifications(): Promise<NotificationItem[]> {
    try {
      const data = await post('erp.notifications');
      cacheSet('notifications', data.items || []);
      return data.items || [];
    } catch (err) {
      const stale = cacheGetStale<NotificationItem[]>('notifications');
      if (stale) return stale;
      throw err;
    }
  },

  /** Глобальний пошук деталі по всіх замовленнях. */
  async search(q: string): Promise<SearchRow[]> {
    const data = await post('erp.search', { q });
    return data.rows || [];
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

  /** Вміст файлу Drive (base64) — для друку креслень на клієнті. */
  fileData(fileId: string): Promise<FileData> {
    return post('erp.fileData', { fileId });
  },

  /** Деталь за ID рядка — лендінг QR-коду з креслення. */
  byId(id: string): Promise<PartData> {
    return post('erp.byId', { id });
  },

  /** Фото з цеху: у папку замовлення + позначка в примітці рядка. */
  addPhoto(row: number, base64: string, mime: string, caption: string): Promise<{ ok: boolean; url: string }> {
    return post('erp.addPhoto', { row, base64, mime, caption });
  },

  /** Логістика: забрати від виконавців + готове до відвантаження. */
  async getLogistics(force = false): Promise<LogisticsData> {
    if (!force) {
      const cached = cacheGet<LogisticsData>('logistics');
      if (cached) return cached;
    }
    try {
      const data = await post('erp.logistics');
      cacheSet('logistics', data);
      return data;
    } catch (err) {
      const stale = cacheGetStale<LogisticsData>('logistics');
      if (stale) return stale;
      throw err;
    }
  },

  /** Рядки картки для відправки виконавцям + стан прив'язок. */
  execRows(headerRow: number): Promise<ExecRowsData> {
    return post('erp.execRows', { headerRow });
  },

  /** Відправка рядків у таблицю виконавця (як 📤 у таблиці). */
  execSend(executor: string, rows: ExecRow[], position: 'top' | 'bottom'): Promise<ExecSendResult> {
    return post('erp.execSend', { executor, rows, position });
  },

  /** Масове оновлення полів (наприклад статусу) для кількох рядків. */
  bulkUpdate(rows: number[], fields: Record<string, string>): Promise<{ updated: number }> {
    return post('erp.bulkUpdate', { rows, fields });
  },

  /** Тех.запуск: файли папки замовлення + список операцій + що вже в картці. */
  techFiles(headerRow: number): Promise<TechFilesData> {
    return post('erp.techFiles', { headerRow });
  },

  /** Тех.запуск: дописати рядки в картку (по рядку на операцію). */
  techLaunch(headerRow: number, items: TechLaunchItem[]): Promise<TechLaunchResult> {
    return post('erp.techLaunch', { headerRow, items });
  },

  /** Пошта: нові листи з міткою «Нове замовлення» (лише перегляд). */
  mailList(): Promise<MailListData> {
    return post('erp.mailList');
  },

  /** Пошта: обробка листів. Дрібний одиночний лист — одразу (done:true),
   *  більші/кілька — фоновий тригер на сервері, відповідь миттєва. */
  mailProcess(): Promise<{ started: boolean; queued: number; done?: boolean; processed?: number }> {
    return post('erp.mailProcess');
  },

  /** Фотошоп: зберегти оброблений PDF замість старого + оновити посилання. */
  savePdf(fileId: string, pdfBase64: string, newName: string, row?: number): Promise<SavePdfResult> {
    return post('erp.savePdf', { fileId, pdfBase64, newName, row });
  },

  /** Фотошоп: файли папки замовлення (PDF/JPG/PNG) з позначкою "оброблено". */
  folderFiles(headerRow: number): Promise<{ files: FolderFile[]; folderUrl: string }> {
    return post('erp.folderFiles', { headerRow });
  },

  /** Бухгалтерія: огляд рахунків/оплат по позиціях картки. */
  billing(headerRow: number): Promise<BillingData> {
    return post('erp.billing', { headerRow });
  },

  /** Дані для створення рахунку/видаткової/акта (клієнт, позиції, ціни). */
  commerceContext(headerRow: number, docType: DocType): Promise<CommerceContext> {
    return post('erp.commerceContext', { headerRow, docType });
  },

  /** Створення документа: копія шаблону Google Doc + запис №/посилання в картку. */
  commerceCreate(formData: Record<string, unknown>): Promise<CommerceResult> {
    return post('erp.commerceCreate', { formData });
  },

  /** Нове замовлення з додатка: картка + папка на Диску. */
  createOrder(data: { clientName: string; status: string; deadline?: string; note?: string }): Promise<CreateOrderResult> {
    return post('erp.createOrder', data);
  },

  /** Файл у папку замовлення (ZIP до 8МБ розпаковується). */
  uploadOrderFile(headerRow: number, name: string, base64: string, mime: string): Promise<{ saved: number; unzipped: number }> {
    return post('erp.uploadOrderFile', { headerRow, name, base64, mime });
  },

  /** Додати операцію до деталі — рядок-дубль одразу під нею (маршрут). */
  addOperation(row: number, op: string, extra?: { executor?: string; qty?: number; note?: string }): Promise<{ ok: boolean; row: number }> {
    return post('erp.addOperation', { row, op, ...extra });
  },

  /** Мітка доставки (спосіб + ТТН) вибраним рядкам — у примітку. */
  setDelivery(rows: number[], method: string, ttn?: string, note?: string): Promise<{ updated: number; tag: string }> {
    return post('erp.setDelivery', { rows, method, ttn, note });
  },

  /** Закріпити/відкріпити замовлення — для всіх користувачів. */
  pin(projectId: string, on: boolean): Promise<{ pinned: string[] }> {
    return post('erp.pin', { projectId, on });
  },

  /** Панель бухгалтерії: всі рахунки + що треба виставити + шаблони. */
  billingOverview(): Promise<BillingOverview> {
    return post('erp.billingOverview');
  },

  /** Контрагенти: довідник з аркуша «Контрагенти» + матриця операцій. */
  contractors(): Promise<ContractorsData> {
    return post('erp.contractors');
  },

  /** Контрагенти: зберегти рядок (row=0 — новий) і позначки операцій. */
  contractorSave(row: number, values: Record<string, string>, ops: Record<string, boolean>):
    Promise<{ ok: boolean; row: number; isNew: boolean }> {
    return post('erp.contractorSave', { row, values, ops });
  },

  /** Контрагенти: додати операцію в матрицю або прибрати помилково додану. */
  contractorAddOp(name: string, group: string, remove = false):
    Promise<{ ok: boolean; col?: number; removed?: boolean }> {
    return post('erp.contractorAddOp', { name, group, remove });
  },

  /** Прайси і потужності: усі або по одному контрагенту. */
  prices(contractor = ''): Promise<PriceData> {
    return post('erp.prices', { contractor });
  },

  /** Прайс: upsert по парі (контрагент, операція). */
  priceSave(contractor: string, operation: string, values: Record<string, string>, remove = false):
    Promise<{ ok: boolean; row?: number; isNew?: boolean; removed?: boolean }> {
    return post('erp.priceSave', { contractor, operation, values, remove });
  },

  /** Працівники: перелік з аркуша «Працівники» + матриця кваліфікації. */
  staff(): Promise<StaffData> {
    return post('erp.staff');
  },

  /** Працівник: зберегти рядок (row=0 — новий), оцінки операцій, або видалити. */
  staffSave(row: number, values: Record<string, string>, skills?: Record<string, number>, remove = false):
    Promise<{ ok: boolean; row?: number; isNew?: boolean; removed?: boolean }> {
    return post('erp.staffSave', { row, values, skills, remove });
  },

  /** Матриця кваліфікації: додати операцію або прибрати колонку. */
  staffAddSkill(name: string, remove = false):
    Promise<{ ok: boolean; col?: number; removed?: boolean }> {
    return post('erp.staffAddSkill', { name, remove });
  },

  /** Фото працівника: base64 → Диск, посилання в аркуш. */
  staffPhoto(row: number, base64: string, mime: string):
    Promise<{ ok: boolean; photoId: string; url: string }> {
    return post('erp.staffPhoto', { row, base64, mime });
  },

  /** Дошки канбану (спільні): без аргументу — читання, з масивом — запис. */
  boards(boards?: KanbanBoardData[]): Promise<{ boards: KanbanBoardData[] }> {
    return post('erp.boards', boards ? { boards } : {});
  },

  /** Прорахунок по всіх замовленнях: групи, суми, час. */
  calcOverview(): Promise<CalcOverview> {
    return post('erp.calcOverview');
  },

  /** Розкрій: позиції картки з DXF (файл + матеріал/товщина/кількості). */
  nestItems(headerRow: number): Promise<NestItemsData> {
    return post('erp.nestItems', { headerRow });
  },

  /** Розкрій: вміст DXF-файлів (пачками — Apps Script читає їх послідовно). */
  nestDxf(fileIds: string[]): Promise<{ files: Array<{ fileId: string; text?: string; error?: string }> }> {
    return post('erp.nestDxf', { fileIds });
  },

  nestPrices(): Promise<{ prices: Record<string, NestPrice> }> {
    return post('erp.nestPrices');
  },

  nestSavePrices(prices: Record<string, NestPrice>): Promise<{ ok: boolean }> {
    return post('erp.nestSavePrices', { prices });
  },

  /** Розкрій: зберегти розкладки (DXF) і текстовий звіт у папку замовлення. */
  nestSave(payload: { folderUrl: string; baseName: string; files: Array<{ name: string; content: string }>; report: string }):
    Promise<{ folderUrl: string; files: Array<{ name: string; url: string }> }> {
    return post('erp.nestSave', payload);
  },

  /** Розкрій: пакет для ProNest — DXF по товщинах + Перелік.csv. */
  nestPronest(payload: { folderUrl: string; baseName: string; groups: Array<{ key: string; items: any[] }> }):
    Promise<{ folderUrl: string; groups: Array<{ name: string; files: number }> }> {
    return post('erp.nestPronest', payload);
  },

  /** Прорахунок: збережені групи позицій і витрати по замовленню. */
  calcGet(headerRow: number): Promise<{ projectId: string; data: CalcData }> {
    return post('erp.calcGet', { headerRow });
  },

  calcSave(headerRow: number, data: CalcData): Promise<{ ok: boolean; updatedAt: string; bundles: number }> {
    return post('erp.calcSave', { headerRow, data });
  },

  /** Розподіл КД: що буде розподілено — виконавець → операція → файли. */
  distribution(headerRow: number): Promise<DistributionData> {
    return post('erp.distribution', { headerRow });
  },

  /** Розподіл КД: копіювання файлів у папки + наряди + (опційно) відправка. */
  distribute(headerRow: number, params: DistributeParams): Promise<DistributeResult> {
    return post('erp.distribute', { headerRow, ...params });
  },

  /** Перевірка ключа при першому вході. */
  async checkToken(): Promise<boolean> {
    await post('erp.orders');
    return true;
  },
};
