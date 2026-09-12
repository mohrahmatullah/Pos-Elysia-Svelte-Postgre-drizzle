export type MovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'DAMAGE'
  | 'STOCK_OPNAME';

export const MOVEMENT_TYPES: MovementType[] = [
  'INITIAL',
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'STOCK_OPNAME',
];

export const IN_MOVEMENTS: MovementType[] = ['INITIAL', 'PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN'];
export const OUT_MOVEMENTS: MovementType[] = ['SALE', 'ADJUSTMENT_OUT', 'DAMAGE', 'STOCK_OPNAME'];

export const movementSign = (t: MovementType): 1 | -1 => (IN_MOVEMENTS.includes(t) ? 1 : -1);

export type ReferenceType = 'SALE' | 'SALE_RETURN' | 'ADJUSTMENT' | 'INITIAL';

export interface StockMovement {
  id: string;
  store_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity_in: number;
  quantity_out: number;
  reference_type: ReferenceType;
  reference_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}
