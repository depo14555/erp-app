// ================================================================
//  src/App.tsx — ERP Металообробка
//  Мобільний: вкладки + повноекранні сторінки.
//  Десктоп (lg+): бічна рейка · список · деталі — як у настільній CRM.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { Bell, Menu, RefreshCw, FlaskConical, ScanSearch, Inbox } from 'lucide-react';
import { api, hasToken, setToken, getEnv } from './api';
import { Order, OrderDetail, AppTab, Lists } from './types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import TokenGate from './components/TokenGate';
import NavRail, { TABS } from './components/NavRail';
import Sidebar from './components/Sidebar';
import OrdersPage from './pages/OrdersPage';
import CalcOverviewPage from './pages/CalcOverviewPage';
import ContractorsPage from './pages/ContractorsPage';
import StaffPage from './pages/StaffPage';
import SearchPage from './pages/SearchPage';
import OrderPage from './pages/OrderPage';
import ChatPage from './pages/ChatPage';
import LogisticsPage from './pages/LogisticsPage';
import MailPage from './pages/MailPage';
import PartPage from './pages/PartPage';
import BillingOverviewPage from './pages/BillingOverviewPage';
import ExecInvoicesPage from './pages/ExecInvoicesPage';
import { sharedCount } from './lib/shared';
import { watchVisualViewport } from './lib/visualViewport';
import PageSheet from './components/PageSheet';
import CreateOrderSheet from './components/CreateOrderSheet';
import NotificationsSheet from './components/NotificationsSheet';
import SideMenu from './components/SideMenu';
import Toast from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';
import LoadingBar from './components/LoadingBar';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  // Прийшли з «Поділитися» — це рахунок від виконавця, одразу в його розділ
  const [tab, setTab] = useState<AppTab>(() => (sharedCount() ? 'execinv' : 'orders'));
  // Згорнута бічна панель — вибір памʼятається між сеансами
  const [sideMini, setSideMini] = useState(() => localStorage.getItem('erp-side-mini') === '1');

  const [orders, setOrders] = useState<Order[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);   // спільні закріплені (projectId)
  const [orderStatusList, setOrderStatusList] = useState<string[]>([]);
  const [rowStatusList, setRowStatusList] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [lists, setLists] = useState<Lists | null>(null);

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');   // що саме зараз вантажиться
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [printTick, setPrintTick] = useState(0);       // сайдбар → відкрити друк у відкритому замовленні
  const [billingTick, setBillingTick] = useState(0);   // сайдбар → рахунки і оплати замовлення
  const [techTick, setTechTick] = useState(0);         // сайдбар → тех.запуск
  const [photoTick, setPhotoTick] = useState(0);       // сайдбар → фотошоп
  const [sendTick, setSendTick] = useState(0);         // сайдбар → відправити виконавцю
  const [distrTick, setDistrTick] = useState(0);       // сайдбар → розподіл КД
  const [calcTick, setCalcTick] = useState(0);         // сайдбар → прорахунок
  const [autoOpen, setAutoOpen] = useState<'calc' | null>(null);  // відкрити інструмент одразу
  const [nestTick, setNestTick] = useState(0);
  const [purchTick, setPurchTick] = useState(0);   // сайдбар → покупні
  const [asmTick, setAsmTick] = useState(0);       // сайдбар → склад збірок
  const [tmcTick, setTmcTick] = useState(0);       // сайдбар → ТМЦ і вага
  /** Інструменти замовлень поверх списку: пошук деталі / вхідна пошта. */
  const [overlay, setOverlay] = useState<'search' | 'mail' | null>(null);
  const [mailHidden, setMailHidden] = useState(false);   // пошта згорнута в плашку
  const [showCreate, setShowCreate] = useState(false); // ➕ нове замовлення
  const [logisticsTick, setLogisticsTick] = useState(0); // шапка → оновити логістику
  const [mailTick, setMailTick] = useState(0);           // шапка → оновити пошту
  const [overviewTick, setOverviewTick] = useState(0);   // шапка → оновити панель бухгалтерії
  const [dirTick, setDirTick] = useState(0);             // шапка → оновити довідники/пріоритет

  const isOnline = useOnlineStatus();
  const env = getEnv();
  const showToast = useCallback((msg: string, err?: boolean) => setToast({ msg, err }), []);

  // Екран збільшили пальцями — шторки мають лишатись на видимій частині
  useEffect(() => watchVisualViewport(), []);

  // QR-код з креслення веде на #p=<ID> — відкриваємо деталь поверх додатка
  const [partId, setPartId] = useState<string>(() => readPartHash());
  useEffect(() => {
    const onHash = () => setPartId(readPartHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const closePart = useCallback(() => {
    if (readPartHash()) history.replaceState(null, '', location.pathname + location.search);
    setPartId('');
  }, []);

  const loadOrders = useCallback(async (force = false) => {
    setLoadingLabel('Оновлюю список замовлень…');
    setLoading(true);
    try {
      const data = await api.getOrders(force);
      setOrders(data.orders || []);
      setPinned(data.pinned || []);
      setOrderStatusList(data.orderStatusList || []);
      setRowStatusList(data.rowStatusList || []);
      setUpdatedAt(data.updatedAt || '');
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося завантажити замовлення', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!authed) return;
    loadOrders();
    // Довідники несуть випадаючі списки (статус, операція, виконавець).
    // Мовчазна невдача колись коштувала дропдаунів у таблиці — тому ретраї.
    let stop = false;
    const pull = (left: number) => {
      api.getLists()
        .then(l => { if (!stop) setLists(l); })
        .catch(() => { if (!stop && left > 0) setTimeout(() => pull(left - 1), 4000); });
    };
    pull(3);
    return () => { stop = true; };
  }, [authed, loadOrders]);

  /** Рядок, на який треба стати після відкриття (з пошуку деталі або QR). */
  const [focusRow, setFocusRow] = useState<number | null>(null);

  const openOrder = useCallback(async (headerRow: number, force = false, label?: string, row?: number) => {
    setLoadingLabel(label || 'Відкриваю замовлення…');
    setLoading(true);
    setFocusRow(row ?? null);
    try {
      setDetail(await api.getOrder(headerRow, force));
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося відкрити замовлення', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  async function setOrderStatus(status: string) {
    if (!detail) return;
    const hr = detail.header.headerRow;
    setDetail({ ...detail, header: { ...detail.header, status } });
    setOrders(prev => prev.map(o => (o.headerRow === hr ? { ...o, status } : o)));
    try {
      await api.setOrderStatus(hr, status);
      showToast('Статус замовлення оновлено');
      loadOrders(true);
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти статус', true);
      openOrder(hr, true);
    }
  }


  /** З загального прорахунку — одразу у вікно прорахунку цього замовлення. */
  async function openOrderCalc(headerRow: number) {
    setTab('orders');
    setAutoOpen('calc');
    await openOrder(headerRow, false, 'Відкриваю прорахунок…');
  }

  /** Розділи, які ще в тестуванні. */
  function lockedTab(label: string) {
    showToast('🔒 ' + label + ' — розділ у тестуванні, буде доступний незабаром');
  }

  async function setRowStatus(row: number, status: string) {
    if (!detail) return;
    setDetail({
      ...detail,
      items: detail.items.map(i => (i.row === row ? { ...i, rowStatus: status } : i)),
    });
    try {
      await api.setRowStatus(row, status);
      showToast('Статус позиції оновлено');
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти статус', true);
    }
  }

  /** Інлайн-редагування будь-якого поля рядка (десктопна таблиця). */
  async function updateRow(row: number, field: string, value: string) {
    if (!detail) return;
    setDetail(d => d && ({
      ...d,
      items: d.items.map(i => (i.row === row ? { ...i, [field]: value } : i)),
    }));
    try {
      const res = await api.updateRow(row, { [field]: value });
      // Сума клієнту перерахована в таблиці — показуємо одразу, без оновлення
      if (res?.clientSum) {
        setDetail(d => d && ({
          ...d,
          items: d.items.map(i => (i.row === row ? { ...i, clientSum: res.clientSum as string } : i)),
        }));
      }
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти', true);
      openOrder(detail.header.headerRow, true);
    }
  }

  /** Масова зміна статусу вибраних рядків (панель дій у таблиці позицій). */
  async function bulkStatus(rows: number[], status: string) {
    if (!detail) return;
    const set = new Set(rows);
    setDetail({
      ...detail,
      items: detail.items.map(i => (set.has(i.row) ? { ...i, rowStatus: status } : i)),
    });
    try {
      await api.bulkUpdate(rows, { status });
    } catch (err) {
      openOrder(detail.header.headerRow, true);
      throw err;
    }
  }

  /** Закріпити/відкріпити замовлення для всіх (спільний пін у таблиці). */
  const togglePin = useCallback(async (projectId: string, on: boolean) => {
    setPinned(prev => on ? [projectId, ...prev.filter(p => p !== projectId)] : prev.filter(p => p !== projectId));
    try {
      await api.pin(projectId, on);
      showToast(on ? '📌 Закріплено — буде зверху у всіх' : 'Відкріплено');
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти пін', true);
      loadOrders(true);
    }
  }, [showToast, loadOrders]);

  function logout() {
    setToken('');
    setAuthed(false);
    setOrders([]);
    setDetail(null);
  }

  /** Одна кнопка оновлення в шапці — оновлює те, що зараз на екрані. */
  function refreshCurrent() {
    if (overlay === 'mail') { setMailTick(t => t + 1); return; }
    if (detail) { openOrder(detail.header.headerRow, true); return; }
    if (tab === 'orders') loadOrders(true);
    else if (tab === 'logistics') setLogisticsTick(t => t + 1);
    else if (tab === 'mail') setMailTick(t => t + 1);
    else if (tab === 'billing') setOverviewTick(t => t + 1);
    else if (tab === 'contractors' || tab === 'calc' || tab === 'staff') setDirTick(t => t + 1);
    else loadOrders(true);
  }

  if (!authed) return <TokenGate onSuccess={() => setAuthed(true)} />;

  const title = tab === 'mail' ? 'Вхідні (пошта)'
    : tab === 'execinv' ? 'Рахунки виконавців'
    : tab === 'billing' ? 'Рахунки і оплати'
    : tab === 'contractors' ? 'Контрагенти'
    : tab === 'staff' ? 'Штат працівників'
    : tab === 'calc' ? 'Прорахунок'
    : (TABS.find(t => t.key === tab)?.label ?? 'ERP');
  const subtitle = tab === 'execinv'
    ? 'вільні рахунки · прив\'язка до позицій'
    : tab === 'mail'
    ? 'нові замовлення з Gmail'
    : tab === 'billing'
      ? 'виставлено · оплачено · треба виставити'
      : tab === 'staff'
        ? 'посада, ставка, контакти, графік'
      : tab === 'contractors'
        ? 'дані, таблиці, матриця операцій'
        : tab === 'calc'
          ? 'усі групи, суми і час по замовленнях'
          : updatedAt ? `Оновлено ${updatedAt}` : 'ERP Металообробка';

  const listPane = (
    tab === 'orders' ? (
      <OrdersPage orders={orders} updatedAt={updatedAt} loading={loading}
        onOpen={o => openOrder(o.headerRow)}
        onCreate={() => setShowCreate(true)}
        pinned={pinned} onTogglePin={togglePin}
        onSearch={() => setOverlay('search')} onMail={() => setOverlay('mail')}
        onToast={showToast}
        activeRow={detail?.header.headerRow} />
    ) : tab === 'calc' ? (
      <CalcOverviewPage orders={orders} onOpenOrder={hr => openOrderCalc(hr)} onToast={showToast} refreshSignal={dirTick} />
    ) : tab === 'contractors' ? (
      <ContractorsPage onToast={showToast} refreshSignal={dirTick} />
    ) : tab === 'staff' ? (
      <StaffPage onToast={showToast} refreshSignal={dirTick} />
    ) : tab === 'logistics' ? (
      <LogisticsPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} refreshSignal={logisticsTick} />
    ) : tab === 'billing' ? (
      <BillingOverviewPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} refreshSignal={overviewTick} />
    ) : tab === 'execinv' ? (
      <ExecInvoicesPage onToast={showToast} onOpenOrder={(hr, row) => openOrder(hr, false, undefined, row)} />
    ) : (
      <ChatPage onToast={showToast} />
    )
  );

  const detailPane = detail && (
    <OrderPage
      detail={detail}
      orderStatusList={orderStatusList}
      rowStatusList={rowStatusList}
      lists={lists}
      loading={loading}
      onBack={() => setDetail(null)}
      onRefresh={(label?: string) => openOrder(detail.header.headerRow, true, label)}
      onSetOrderStatus={setOrderStatus}
      onSetRowStatus={setRowStatus}
      onUpdateRow={updateRow}
      onBulkStatus={bulkStatus}
      onToast={showToast}
      printSignal={printTick}
      billingSignal={billingTick}
      techSignal={techTick}
      photoSignal={photoTick}
      sendSignal={sendTick}
      distrSignal={distrTick}
      calcSignal={calcTick}
      nestSignal={nestTick}
      purchSignal={purchTick}
      asmSignal={asmTick}
      tmcSignal={tmcTick}
      autoOpen={autoOpen}
      focusRow={focusRow}
      onFocused={() => setFocusRow(null)}
      onAutoOpened={() => setAutoOpen(null)}
    />
  );

  return (
    <div className="h-[100dvh] flex bg-[var(--bg)]">
      {/* Постійна бічна навігація (десктоп) — сучасна CRM */}
      <Sidebar
        tab={tab}
        env={env}
        onTab={t => { setTab(t); setDetail(null); }}
        onLocked={lockedTab}
        order={detail ? {
          label: detail.header.orderNum || detail.header.projectId,
          folderUrl: detail.header.folderUrl,
        } : null}
        onOrderTool={t => {
          if (t === 'billing') setBillingTick(v => v + 1);
          else if (t === 'tech') setTechTick(v => v + 1);
          else if (t === 'photo') setPhotoTick(v => v + 1);
          else if (t === 'send') setSendTick(v => v + 1);
          else if (t === 'print') setPrintTick(v => v + 1);
          else if (t === 'distr') setDistrTick(v => v + 1);
          else if (t === 'calc') setCalcTick(v => v + 1);
          else if (t === 'nest') setNestTick(v => v + 1);
          else if (t === 'purch') setPurchTick(v => v + 1);
          else if (t === 'asm') setAsmTick(v => v + 1);
          else if (t === 'tmc') setTmcTick(v => v + 1);
        }}
        onLogout={logout}
        onRefresh={refreshCurrent}
        onNotifications={() => setShowNotifs(true)}
        loading={loading}
        collapsed={sideMini}
        onToggleCollapsed={() => setSideMini(v => {
          localStorage.setItem('erp-side-mini', v ? '0' : '1');
          return !v;
        })}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/*
          На десктопі окремої шапки немає: де ти — видно з сайдбара, а що
          відкрито — зі штампа сторінки. Оновлення й події переїхали в низ
          сайдбара. На телефоні смужка лишається — там живе гамбургер.
        */}
        {!detail && (
          <header className="lg:hidden flex-shrink-0 bg-white border-b hairline px-2 h-[52px] flex items-center gap-2">
            <button onClick={() => setShowMenu(true)}
              className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Меню">
              <Menu size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-extrabold truncate leading-tight">{title}</h1>
              <p className="k-label truncate">{subtitle}</p>
            </div>
            {env === 'test' && (
              <span className="k-chip" style={{ color: 'var(--amber)', borderColor: 'var(--amber-line)', background: 'var(--amber-bg)' }}>
                <FlaskConical size={10} className="inline -mt-0.5 mr-0.5" /> тест
              </span>
            )}
            <button onClick={refreshCurrent}
              className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowNotifs(true)}
              className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Події">
              <Bell size={18} />
            </button>
          </header>
        )}

        {/* Вміст на всю ширину: замовлення відкривається замість списку */}
        <div className="flex-1 min-h-0 flex flex-col">
          {detail
            ? <div className="flex-1 min-h-0 min-w-0 flex flex-col">{detailPane}</div>
            : <div className="flex-1 min-h-0 min-w-0 flex flex-col">{listPane}</div>}
        </div>

        <OfflineBanner isOnline={isOnline} pendingCount={0} />

        {/* Мобільна нижня навігація */}
        {!detail && (
        <NavRail tab={tab} onTab={t => { setTab(t); setDetail(null); }}
          onLocked={lockedTab} onMenu={() => setShowMenu(true)} />
      )}
      </div>

      {showMenu && (
        <SideMenu
          env={env}
          tab={tab}
          onClose={() => setShowMenu(false)}
          onNavigate={t => { setTab(t); setDetail(null); setShowMenu(false); }}
          onLocked={l => { setShowMenu(false); lockedTab(l); }}
          onLogout={() => { setShowMenu(false); logout(); }}
          onToast={showToast}
        />
      )}

      {showNotifs && <NotificationsSheet onClose={() => setShowNotifs(false)} onToast={showToast} />}

      {/* Інструменти замовлень поверх списку — окремих пунктів меню не займають */}
      {overlay === 'search' && (
        <PageSheet title="Пошук деталі" subtitle="по всіх замовленнях"
          icon={<ScanSearch size={16} />} onClose={() => setOverlay(null)}>
          <SearchPage
            onOpenOrder={(hr, row) => { setOverlay(null); setTab('orders'); openOrder(hr, false, 'Відкриваю замовлення…', row); }}
            onToast={showToast} />
        </PageSheet>
      )}

      {/* Пошта живе, поки згорнута — обробка листів триває у фоні */}
      {overlay === 'mail' && (
        <div className={mailHidden ? 'hidden' : ''}>
          <PageSheet title="Вхідні (пошта)" subtitle="нові замовлення з Gmail"
            icon={<Inbox size={16} />}
            onMinimize={() => { setMailHidden(true); showToast('📨 Пошта згорнута — обробка триває'); }}
            onClose={() => { setOverlay(null); setMailHidden(false); }}>
            <MailPage onToast={showToast}
              onProcessed={() => { loadOrders(true); if (mailHidden) showToast('✅ Пошта оброблена — відкрийте вікно'); }}
              refreshSignal={mailTick} />
          </PageSheet>
        </div>
      )}

      {overlay === 'mail' && mailHidden && (
        <button onClick={() => setMailHidden(false)}
          className="fixed bottom-3 left-3 z-[78] flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-2xl shadow-lg press bg-white ring-1 ring-gray-200 hover:bg-gray-50"
          title="Повернути вікно">
          <span className="text-[14px] leading-none">📨</span>
          <span className="text-[12.5px] font-bold">Вхідні (пошта)</span>
        </button>
      )}

      {/* Деталь за QR-кодом — поверх усього */}
      {partId && (
        <PartPage
          partId={partId}
          onClose={closePart}
          onOpenOrder={(hr, row) => { closePart(); setTab('orders'); openOrder(hr, false, 'Відкриваю замовлення…', row); }}
          onToast={showToast}
        />
      )}

      {showCreate && (
        <CreateOrderSheet
          lists={lists}
          orderStatusList={orderStatusList}
          onClose={() => setShowCreate(false)}
          onToast={showToast}
          onCreated={hr => { setShowCreate(false); loadOrders(true); openOrder(hr); }}
        />
      )}

      {toast && <Toast message={toast.msg} isError={toast.err} onClose={() => setToast(null)} />}
      <LoadingBar active={loading} label={loadingLabel} />
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}

/** #p=<ID> з QR-коду на кресленні. */
function readPartHash(): string {
  const m = location.hash.match(/^#p=(.+)$/);
  return m ? decodeURIComponent(m[1]) : '';
}
