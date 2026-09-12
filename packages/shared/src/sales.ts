export type SaleStatus = 'completed' | 'cancelled' | 'partially_returned' | 'returned';
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'QRIS';

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'QRIS'];

export const SALE_STATUS: Record<SaleStatus, string> = {
  completed: 'completed',
  cancelled: 'cancelled',
  partially_returned: 'partially_returned',
  returned: 'returned',
};

export interface Sale {
  id: string;
  store_id: string;
  customer_id: string | null;
  cashier_id: string;
  invoice_number: string;
  status: SaleStatus;
  subtotal: string;
  discount: string;
  tax: string;
  grand_total: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  unit_price: string;
  quantity: number;
  discount: string;
  tax: string;
  subtotal: string;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: string;
  reference_number: string | null;
  paid_at: string;
}

export interface ReturnRef {
  id: string;
  sale_id: string;
  reason: string;
  refund_amount: string;
}
