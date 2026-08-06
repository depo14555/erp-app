// ================================================================
//  src/App.tsx — ERP Металообробка (мобільний додаток)
//  Вкладки: Огляд · Замовлення · Пошук · Чат.
//  Дані з таблиці-хаба через Apps Script Web App (дії erp.*).
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, ClipboardList, Search, MessageSquare, Bell, Menu } from 'lucide-react';
import { api, hasToken, setToken } from './api';
import { Order, OrderDetail, AppTab, DashboardData } from './types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import TokenGate from './components/TokenGate';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import SearchPage from './pages/SearchPage';
import OrderPage from './pages/OrderPage';
import ChatPage from './pages/ChatPage';
import NotificationsSheet from './components/NotificationsSheet';
import SideMenu from './components/SideMenu';
import Toast from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';

const TABS = [
  { key: 'dashboard' as AppTab, label: 'Огляд', Icon: LayoutDashboard },
  { key: 'orders' as AppTab, label: 'Замовлення', Icon: ClipboardList },
  { key: 'search' as AppTab, label: 'Пошук', Icon: Search },
  { key: 'chat' as AppTab, label: 'Чат', Icon: MessageSquare },
];

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState<AppTab>('dashboard');

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStatusList, setOrderStatusList] = useState<string[]>([]);
  const [rowStatusList, setRowStatusList] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const isOnline = useOnlineStatus();
  const showToast = useCallback((msg: string, err?: boolean) => setToast({ msg, err }), []);

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
    setDetail({ ...detail, header: { ...detail.header, status } });   // оптимістично
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

  function logout() {
    setToken('');
    setAuthed(false);
    setOrders([]);
    setDashboard(null);
    setDetail(null);
  }

  if (!authed) return <TokenGate onSuccess={() => setAuthed(true)} />;

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      {!detail && (
        <header className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-blue-600 px-2 pt-2 pb-2.5 text-white">
          <div className="flex items-center gap-1">
            <button onClick={() => setShowMenu(true)}
              className="p-2 text-white/90 active:scale-90 transition-transform" aria-label="Меню">
              <Menu size={21} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-bold truncate leading-tight">
                {TABS.find(t => t.key === tab)?.label ?? 'ERP'}
              </h1>
              <p className="text-[10.5px] text-white/70 truncate">
                {tab === 'dashboard' && dashboard
                  ? `${dashboard.counts.activeOrders} в роботі · ${dashboard.counts.orders} всього`
                  : 'ERP Металообробка'}
              </p>
            </div>
            <button onClick={() => setShowNotifs(true)}
              className="p-2 text-white/90 active:scale-90 transition-transform" aria-label="Події">
              <Bell size={19} />
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 min-h-0">
        {detail ? (
          <OrderPage
            detail={detail}
            orderStatusList={orderStatusList}
            rowStatusList={rowStatusList}
            loading={loading}
            onBack={() => setDetail(null)}
            onRefresh={() => openOrder(detail.header.headerRow, true)}
            onSetOrderStatus={setOrderStatus}
            onSetRowStatus={setRowStatus}
          />
        ) : tab === 'dashboard' ? (
          <DashboardPage
            data={dashboard}
            loading={loading}
            onRefresh={() => loadDashboard(true)}
            onOpenOrder={o => openOrder(o.headerRow)}
          />
        ) : tab === 'orders' ? (
          <OrdersPage
            orders={orders}
            updatedAt={updatedAt}
            loading={loading}
            onRefresh={() => loadOrders(true)}
            onOpen={o => openOrder(o.headerRow)}
          />
        ) : tab === 'search' ? (
          <SearchPage onOpenOrder={hr => openOrder(hr)} onToast={showToast} />
        ) : (
          <ChatPage onToast={showToast} />
        )}
      </main>

      <OfflineBanner isOnline={isOnline} pendingCount={0} />

      {!detail && (
        <nav className="flex-shrink-0 bg-white/95 backdrop-blur border-t border-gray-200/70 flex px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {TABS.map(({ key, label, Icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl transition-colors"
                style={on ? { background: '#EEF2FF' } : undefined}
              >
                <Icon size={19} strokeWidth={on ? 2.6 : 2}
                  className={on ? 'text-indigo-600' : 'text-gray-400'} />
                <span className={`text-[10px] font-bold ${on ? 'text-indigo-700' : 'text-gray-400'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {showMenu && (
        <SideMenu
          onClose={() => setShowMenu(false)}
          onNavigate={t => { setTab(t); setDetail(null); setShowMenu(false); }}
          onSoon={label => { setShowMenu(false); showToast(`«${label}» — поки виконується в таблиці`); }}
          onLogout={() => { setShowMenu(false); logout(); }}
        />
      )}

      {showNotifs && (
        <NotificationsSheet onClose={() => setShowNotifs(false)} onToast={showToast} />
      )}
      {toast && <Toast message={toast.msg} isError={toast.err} onClose={() => setToast(null)} />}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
