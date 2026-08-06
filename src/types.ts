// ================================================================
//  src/types.ts — ERP Металообробка (мобільний додаток)
//  Типи даних мобільного API хаба (дії erp.*)
// ================================================================

export interface Order {
  headerRow: number;
  orderNum: string;
  client: string;
  status: string;
  date: string;
  projectId: string;
  total: number;
  done: number;
  deadline: string;
  note: string;
}

export interface OrdersResponse {
  orders: Order[];
  orderStatusList: string[];
  rowStatusList: string[];
  updatedAt: string;
}

export interface OrderItem {
  row: number;
  id: string;
  num: string;
  name: string;
  url: string;
  group: boolean;
  material: string;
  thickness: string;
  qty: string;
  assignedQty: string;
  op: string;
  executor: string;
  rowStatus: string;
  note: string;
  assembly: string;
  execPrice: string;
}

export interface OrderHeader {
  headerRow: number;
  projectId: string;
  orderNum: string;
  client: string;
  status: string;
  date: string;
  folderUrl: string;
}

export interface OrderDetail {
  header: OrderHeader;
  items: OrderItem[];
}

export interface ChatThread {
  executor: string;
  unread: number;
  last: string;
  lastTime: string;
}

export interface ChatMessage {
  dbRow: number;
  time: string;
  out: boolean;
  author: string;
  msg: string;
  projectId: string;
  rowId: string;
  cellRef: string;
  itemName: string;
}

export type AppTab = 'orders' | 'chat';

/** Кольори статусів — та сама палітра, що на аркуші «Головна» в таблиці. */
export function statusStyle(s: string): { bg: string; fg: string; solid: string } {
  const v = String(s || '');
  if (v.includes('Відвантаж')) return { bg: '#E0F2F1', fg: '#00695C', solid: '#00695C' };
  if (v.includes('Готово'))    return { bg: '#E8F5E9', fg: '#2E7D32', solid: '#2E7D32' };
  if (v.includes('Відправ'))   return { bg: '#EDE7F6', fg: '#4527A0', solid: '#4527A0' };
  if (v.includes('робот') || v.includes('Виконуєт')) return { bg: '#FFF3E0', fg: '#E65100', solid: '#EF6C00' };
  if (v.includes('Пауза'))     return { bg: '#FFF8E1', fg: '#B28704', solid: '#F9A825' };
  if (v.includes('Опрацюв'))   return { bg: '#F3E5F5', fg: '#6A1B9A', solid: '#6A1B9A' };
  if (v.includes('Скасован'))  return { bg: '#FFEBEE', fg: '#C62828', solid: '#C62828' };
  if (v.includes('Очікуван'))  return { bg: '#F5F5F5', fg: '#607D8B', solid: '#607D8B' };
  if (v.includes('Нов'))       return { bg: '#E8EAF6', fg: '#283593', solid: '#283593' };
  return { bg: '#ECEFF1', fg: '#37474F', solid: '#37474F' };
}

/** Тип файлу за розширенням — для підгруп у списку позицій. */
export function fileKind(name: string): 'pdf' | 'dxf' | '3d' | 'other' {
  const m = String(name || '').match(/\.([A-Za-z0-9]{2,5})$/);
  const ext = m ? m[1].toLowerCase() : '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'dxf' || ext === 'dwg') return 'dxf';
  if (['step', 'stp', 'igs', 'iges'].includes(ext)) return '3d';
  return 'other';
}
