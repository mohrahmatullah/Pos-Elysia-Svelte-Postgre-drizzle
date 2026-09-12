/** Permission model (PRD 25 authorization matrix). */
export type Permission =
  | 'READ_DASHBOARD'
  | 'MANAGE_USERS'
  | 'SYSTEM_SETTINGS'
  | 'MANAGE_PRODUCT'
  | 'READ_PRODUCT'
  | 'MANAGE_CATEGORY'
  | 'STOCK_ADJUSTMENT'
  | 'READ_INVENTORY'
  | 'CREATE_SALE'
  | 'APPLY_DISCOUNT'
  | 'READ_SALE_OWN'
  | 'READ_SALE_ALL'
  | 'CANCEL_SALE'
  | 'CREATE_RETURN'
  | 'MANAGE_CUSTOMER'
  | 'READ_CUSTOMER'
  | 'VIEW_REPORTS'
  | 'VIEW_AUDIT_LOG';

const OWNER: Permission[] = [
  'READ_DASHBOARD',
  'MANAGE_USERS',
  'APPLY_DISCOUNT',
  'SYSTEM_SETTINGS',
  'MANAGE_PRODUCT',
  'READ_PRODUCT',
  'MANAGE_CATEGORY',
  'STOCK_ADJUSTMENT',
  'READ_INVENTORY',
  'CREATE_SALE',
  'READ_SALE_OWN',
  'READ_SALE_ALL',
  'CANCEL_SALE',
  'CREATE_RETURN',
  'MANAGE_CUSTOMER',
  'READ_CUSTOMER',
  'VIEW_REPORTS',
  'VIEW_AUDIT_LOG',
];

const MANAGER: Permission[] = [
  'READ_DASHBOARD',
  'MANAGE_PRODUCT',
  'APPLY_DISCOUNT',
  'READ_PRODUCT',
  'MANAGE_CATEGORY',
  'STOCK_ADJUSTMENT',
  'READ_INVENTORY',
  'CREATE_SALE',
  'READ_SALE_OWN',
  'READ_SALE_ALL',
  'CANCEL_SALE',
  'CREATE_RETURN',
  'MANAGE_CUSTOMER',
  'READ_CUSTOMER',
  'VIEW_REPORTS',
];

const CASHIER: Permission[] = [
  'READ_DASHBOARD',
  'READ_PRODUCT',
  'READ_INVENTORY',
  'CREATE_SALE',
  'READ_SALE_OWN',
  'MANAGE_CUSTOMER',
  'READ_CUSTOMER',
  'VIEW_REPORTS',
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: OWNER,
  manager: MANAGER,
  cashier: CASHIER,
};

export const hasPermission = (role: string, permission: Permission): boolean =>
  (ROLE_PERMISSIONS[role] ?? []).includes(permission);
