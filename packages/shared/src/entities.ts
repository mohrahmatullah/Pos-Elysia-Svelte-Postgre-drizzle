export type RoleName = 'owner' | 'manager' | 'cashier';
export type UserStatus = 'active' | 'inactive';
export type ActiveStatus = 'active' | 'inactive';

export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  currency: string;
  timezone: string;
}

export interface Role {
  id: string;
  name: RoleName;
}

export interface User {
  id: string;
  store_id: string;
  role_id: string;
  name: string;
  email: string;
  status: UserStatus;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  cost_price: string;
  selling_price: string;
  minimum_stock: number;
  tax_rate: string;
  active: boolean;
}

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}
