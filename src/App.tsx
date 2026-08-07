// ================================================================
//  src/App.tsx — ERP Металообробка
//  Мобільний: вкладки + повноекранні сторінки.
//  Десктоп (lg+): бічна рейка · список · деталі — як у настільній CRM.
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { Bell, Menu, RefreshCw, FlaskConical } from 'lucide-react';
import { api, hasToken, setToken, getEnv } from './api';
import { Order, OrderDetail, AppTab, DashboardData, Lists } from './types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import TokenGate from './components/TokenGate';
import NavRail, { TABS } from './components/NavRail';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import SearchPage from './pages/SearchPage';
import OrderPage from './pages/OrderPage';
import ChatPage from './pages/ChatPage';
import LogisticsPage from './pages/LogisticsPage';
import PartPage from './pages/PartPage';
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
    setDetail({
      ...detail,
      items: detail.items.map(i => (i.row === row ? { ...i, [field]: value } : i)),
    });
    try {
      await api.updateRow(row, { [field]: value });
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти', true);
      openOrder(detail.header.headerRow, true);
    }
  }

  function logout() {
    setToken('');
    setAuthed(false);
    setOrders([]);
    setDashboard(null);
    setDetail(null);
  }

  if (!authed) return <TokenGate onSuccess={() => setAuthed(true)} />;

  const title = TABS.find(t => t.key === tab)?.label ?? 'ERP';
  const subtitle = tab === 'dashboard' && dashboard
    ? `${dashboard.counts.activeOrders} в роботі · ${dashboard.counts.orders} всього`
    : updatedAt ? `Оновлено ${updatedAt}` : 'ERP Металообробка';

  const listPane = (
    tab === 'dashboard' ? (
      <DashboardPage data={dashboard} loading={loading}
        onRefresh={() => loadDashboard(true)} onOpenOrder={o => openOrder(o.headerRow)} />
    ) : tab === 'orders' ? (
      <OrdersPage orders={orders} updatedAt={updatedAt} loading={loading}
        onRefresh={() => loadOrders(true)} onOpen={o => openOrder(o.headerRow)}
        activeRow={detail?.header.headerRow} />
    ) : tab === 'search' ? (
      <SearchPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} />
    ) : tab === 'logistics' ? (
      <LogisticsPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} />
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
      onToast={showToast}
    />
  );

  return (
    <div className="h-[100dvh] flex bg-[var(--bg)]">
      {/* Десктоп: бічна рейка */}
      <NavRail desktop tab={tab} onTab={t => { setTab(t); setDetail(null); }} onMenu={() => setShowMenu(true)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Шапка */}
        {(!detail || window.innerWidth >= 1024) && (
          <header className="flex-shrink-0 bg-white border-b hairline px-2 lg:px-4 h-[52px] flex items-center gap-2">
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
            <button onClick={() => { loadDashboard(true); loadOrders(true); }}
              className="hidden lg:block p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Оновити">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowNotifs(true)}
              className="p-2 press rounded-xl" style={{ color: 'var(--ink-2)' }} aria-label="Події">
              <Bell size={18} />
            </button>
          </header>
        )}

        <div className="flex-1 min-h-0 flex">
          {/* Список: на десктопі — ліва колонка, на мобільному — весь екран */}
          <div className={`${detail ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 flex-1 lg:flex-none lg:w-[380px] lg:border-r lg:hairline lg:bg-white`}>
            {listPane}
          </div>

          {/* Деталі */}
          {detail ? (
            <div className="flex-1 min-w-0 flex flex-col">{detailPane}</div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center text-center px-8">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-white border hairline flex items-center justify-center mx-auto mb-3 text-[22px]">
                  📋
                </div>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                  Виберіть замовлення зі списку
                </p>
                <p className="text-[12px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  Позиції відкриються таблицею з редагуванням на місці
                </p>
              </div>
            </div>
          )}
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
          onSoon={label => { setShowMenu(false); showToast(`«${label}» — поки виконується в таблиці`); }}
          onLogout={() => { setShowMenu(false); logout(); }}
          onEnvChange={() => { setShowMenu(false); setAuthed(hasToken()); setDetail(null); }}
          onToast={showToast}
        />
      )}

      {showNotifs && <NotificationsSheet onClose={() => setShowNotifs(false)} onToast={showToast} />}

      {/* Деталь за QR-кодом — поверх усього */}
      {partId && (
        <PartPage
          partId={partId}
          onClose={closePart}
          onOpenOrder={hr => { closePart(); setTab('orders'); openOrder(hr); }}
          onToast={showToast}
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
