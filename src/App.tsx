// ================================================================
//  src/App.tsx — ERP Металообробка (мобільний додаток)
//  Вкладки: Замовлення (список → картка) і Чат.
//  Дані з таблиці-хаба через Apps Script Web App (дії erp.*).
// ================================================================

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, MessageSquare, LogOut } from 'lucide-react';
import { api, hasToken, setToken } from './api';
import { Order, OrderDetail, AppTab } from './types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import TokenGate from './components/TokenGate';
import OrdersPage from './pages/OrdersPage';
import OrderPage from './pages/OrderPage';
import ChatPage from './pages/ChatPage';
import Toast from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState<AppTab>('orders');

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStatusList, setOrderStatusList] = useState<string[]>([]);
  const [rowStatusList, setRowStatusList] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => { if (authed) loadOrders(); }, [authed, loadOrders]);

  async function openOrder(o: Order, force = false) {
    setLoading(true);
    try {
      const d = await api.getOrder(o.headerRow, force);
      setDetail(d);
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося відкрити замовлення', true);
    } finally {
      setLoading(false);
    }
  }

  async function setOrderStatus(status: string) {
    if (!detail) return;
    const hr = detail.header.headerRow;
    setDetail({ ...detail, header: { ...detail.header, status } });     // оптимістично
    setOrders(prev => prev.map(o => (o.headerRow === hr ? { ...o, status } : o)));
    try {
      await api.setOrderStatus(hr, status);
      showToast('Статус замовлення оновлено');
      loadOrders(true);
    } catch (err: any) {
      showToast(err?.message || 'Не вдалося зберегти статус', true);
      openOrder({ headerRow: hr } as Order, true);
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
    setDetail(null);
  }

  if (!authed) return <TokenGate onSuccess={() => setAuthed(true)} />;

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-50">
      {/* Глобальна шапка */}
      {!detail && (
        <header className="flex-shrink-0 bg-white border-b border-gray-200 px-3 h-12 flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-[13px]">
            ⚙
          </span>
          <h1 className="flex-1 text-[15px] font-bold text-gray-900">ERP Металообробка</h1>
          <button onClick={logout} className="p-2 text-gray-400 active:text-gray-600" aria-label="Вийти">
            <LogOut size={17} />
          </button>
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
            onRefresh={() => openOrder({ headerRow: detail.header.headerRow } as Order, true)}
            onSetOrderStatus={setOrderStatus}
            onSetRowStatus={setRowStatus}
          />
        ) : tab === 'orders' ? (
          <OrdersPage
            orders={orders}
            updatedAt={updatedAt}
            loading={loading}
            onRefresh={() => loadOrders(true)}
            onOpen={o => openOrder(o)}
          />
        ) : (
          <ChatPage onToast={showToast} />
        )}
      </main>

      <OfflineBanner isOnline={isOnline} pendingCount={0} />

      {/* Нижня навігація */}
      {!detail && (
        <nav className="flex-shrink-0 bg-white border-t border-gray-200 flex">
          {([
            { key: 'orders' as AppTab, label: 'Замовлення', Icon: ClipboardList },
            { key: 'chat' as AppTab, label: 'Чат', Icon: MessageSquare },
          ]).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                tab === key ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <Icon size={20} strokeWidth={tab === key ? 2.5 : 2} />
              <span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </nav>
      )}

      {toast && <Toast message={toast.msg} isError={toast.err} onClose={() => setToast(null)} />}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
}
