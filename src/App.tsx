// ================================================================
//  src/App.tsx — ERP Металообробка
//  Мобільний: вкладки + повноекранні сторінки.
//  Десктоп (lg+): бічна рейка · список · деталі — як у настільній CRM.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { Bell, Menu, RefreshCw, FlaskConical, ScanSearch, Inbox } from 'lucide-react';
import { api, hasToken, setToken, getEnv } from './api';
import { Order, OrderDetail, AppTab, DashboardData, Lists } from './types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import TokenGate from './components/TokenGate';
import NavRail, { TABS } from './components/NavRail';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import SearchPage from './pages/SearchPage';
import OrderPage from './pages/OrderPage';
import ChatPage from './pages/ChatPage';
import LogisticsPage from './pages/LogisticsPage';
import MailPage from './pages/MailPage';
import PartPage from './pages/PartPage';
import BillingOverviewPage from './pages/BillingOverviewPage';
import PageSheet from './components/PageSheet';
import CreateOrderSheet from './components/CreateOrderSheet';
import NotificationsSheet from './components/NotificationsSheet';
import SideMenu from './components/SideMenu';
import Toast from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState<AppTab>('dashboard');

  const [orders, setOrders] = useState<Order[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);   // спільні закріплені (projectId)
  const [orderStatusList, setOrderStatusList] = useState<string[]>([]);
  const [rowStatusList, setRowStatusList] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
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
  /** Інструменти замовлень поверх списку: пошук деталі / вхідна пошта. */
  const [overlay, setOverlay] = useState<'search' | 'mail' | null>(null);
  const [mailHidden, setMailHidden] = useState(false);   // пошта згорнута в плашку
  const [showCreate, setShowCreate] = useState(false); // ➕ нове замовлення
  const [logisticsTick, setLogisticsTick] = useState(0); // шапка → оновити логістику
  const [mailTick, setMailTick] = useState(0);           // шапка → оновити пошту
  const [overviewTick, setOverviewTick] = useState(0);   // шапка → оновити панель бухгалтерії

  const isOnline = useOnlineStatus();
  const env = getEnv();
  const showToast = useCallback((msg: string, err?: boolean) => setToast({ msg, err }), []);

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

  const loadDashboard = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setDashboard(await api.getDashboard(force));
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося завантажити зведення', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!authed) return;
    loadDashboard();
    loadOrders();
    api.getLists().then(setLists).catch(() => {/* списки не критичні */});
  }, [authed, loadDashboard, loadOrders]);

  const openOrder = useCallback(async (headerRow: number, force = false) => {
    setLoading(true);
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
      loadDashboard(true);
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти статус', true);
      openOrder(hr, true);
    }
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
    setDashboard(null);
    setDetail(null);
  }

  /** Одна кнопка оновлення в шапці — оновлює те, що зараз на екрані. */
  function refreshCurrent() {
    if (overlay === 'mail') { setMailTick(t => t + 1); return; }
    if (detail) { openOrder(detail.header.headerRow, true); return; }
    if (tab === 'dashboard') loadDashboard(true);
    else if (tab === 'orders') loadOrders(true);
    else if (tab === 'logistics') setLogisticsTick(t => t + 1);
    else if (tab === 'mail') setMailTick(t => t + 1);
    else if (tab === 'billing') setOverviewTick(t => t + 1);
    else { loadDashboard(true); loadOrders(true); }
  }

  if (!authed) return <TokenGate onSuccess={() => setAuthed(true)} />;

  const title = tab === 'mail' ? 'Вхідні (пошта)'
    : tab === 'billing' ? 'Рахунки і оплати'
    : (TABS.find(t => t.key === tab)?.label ?? 'ERP');
  const subtitle = tab === 'mail'
    ? 'нові замовлення з Gmail'
    : tab === 'billing'
      ? 'виставлено · оплачено · треба виставити'
      : tab === 'dashboard' && dashboard
        ? `${dashboard.counts.activeOrders} в роботі · ${dashboard.counts.orders} всього`
        : updatedAt ? `Оновлено ${updatedAt}` : 'ERP Металообробка';

  const listPane = (
    tab === 'dashboard' ? (
      <DashboardPage data={dashboard} loading={loading}
        onRefresh={() => loadDashboard(true)} onOpenOrder={o => openOrder(o.headerRow)} />
    ) : tab === 'orders' ? (
      <OrdersPage orders={orders} updatedAt={updatedAt} loading={loading}
        onRefresh={() => loadOrders(true)} onOpen={o => openOrder(o.headerRow)}
        onCreate={() => setShowCreate(true)}
        pinned={pinned} onTogglePin={togglePin}
        onSearch={() => setOverlay('search')} onMail={() => setOverlay('mail')}
        activeRow={detail?.header.headerRow} />
    ) : tab === 'logistics' ? (
      <LogisticsPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} refreshSignal={logisticsTick} />
    ) : tab === 'billing' ? (
      <BillingOverviewPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} refreshSignal={overviewTick} />
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
      onRefresh={() => openOrder(detail.header.headerRow, true)}
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
    />
  );

  return (
    <div className="h-[100dvh] flex bg-[var(--bg)]">
      {/* Постійна бічна навігація (десктоп) — сучасна CRM */}
      <Sidebar
        tab={tab}
        env={env}
        onTab={t => { setTab(t); setDetail(null); }}
        onPrint={() => {
          // Замовлення відкрите — одразу відкриваємо вікно друку для нього
          if (detail) { setPrintTick(t => t + 1); return; }
          setTab('orders');
          showToast('Виберіть замовлення — і друк відкриється у ньому (🖨️ у шапці)');
        }}
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
        }}
        onLogout={logout}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Шапка: на телефоні — гамбургер, на десктопі — заголовок розділу */}
        {(!detail || window.innerWidth >= 1024) && (
          <header className="flex-shrink-0 bg-white border-b hairline px-2 lg:px-5 h-[52px] lg:h-[56px] flex items-center gap-2">
            <button onClick={() => setShowMenu(true)}
              className="lg:hidden p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Меню">
              <Menu size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[16px] font-bold truncate leading-tight tracking-tight">{title}</h1>
              <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
            </div>
            {env === 'test' && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                <FlaskConical size={11} /> ТЕСТ
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
        {!detail && <NavRail tab={tab} onTab={t => { setTab(t); setDetail(null); }} onMenu={() => setShowMenu(true)} />}
      </div>

      {showMenu && (
        <SideMenu
          env={env}
          onClose={() => setShowMenu(false)}
          onNavigate={t => { setTab(t); setDetail(null); setShowMenu(false); }}
          onLogout={() => { setShowMenu(false); logout(); }}
          onToast={showToast}
        />
      )}

      {showNotifs && <NotificationsSheet onClose={() => setShowNotifs(false)} onToast={showToast} />}

      {/* Інструменти замовлень поверх списку — окремих пунктів меню не займають */}
      {overlay === 'search' && (
        <PageSheet title="Пошук деталі" subtitle="по всіх замовленнях"
          icon={<ScanSearch size={16} />} onClose={() => setOverlay(null)}>
          <SearchPage onOpenOrder={hr => { setOverlay(null); setTab('orders'); openOrder(hr); }} onToast={showToast} />
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
              onProcessed={() => { loadOrders(true); loadDashboard(true); if (mailHidden) showToast('✅ Пошта оброблена — відкрийте вікно'); }}
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
          onOpenOrder={hr => { closePart(); setTab('orders'); openOrder(hr); }}
          onToast={showToast}
        />
      )}

      {showCreate && (
        <CreateOrderSheet
          lists={lists}
          orderStatusList={orderStatusList}
          onClose={() => setShowCreate(false)}
          onToast={showToast}
          onCreated={hr => { setShowCreate(false); loadOrders(true); loadDashboard(true); openOrder(hr); }}
        />
      )}

      {toast && <Toast message={toast.msg} isError={toast.err} onClose={() => setToast(null)} />}
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
