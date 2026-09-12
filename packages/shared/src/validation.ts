/**
 * Validation helpers shared between API and web.
 * Pure functions — no side effects — safe to reuse for UX checks in the UI.
 * The backend remains the enforcement boundary.
 */

export interface CartItemInput {
  product_id: string;
  quantity: number;
  discount?: number;
}

export interface CartInput {
  items: CartItemInput[];
  customer_id?: string | null;
  discount?: number;
}

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

export const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

export const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const isPhone = (v: string): boolean => /^[+]?[\d\s()-]{6,20}$/.test(v);

export function validateCart(cart: CartInput): string[] {
  const errors: string[] = [];
  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    errors.push('Cart must contain at least one item');
    return errors;
  }
  const seen = new Set<string>();
  for (const item of cart.items) {
    if (!isNonEmptyString(item.product_id)) {
      errors.push('Each item requires a product_id');
      continue;
    }
    if (seen.has(item.product_id)) {
      errors.push(`Duplicate product in cart: ${item.product_id}`);
    }
    seen.add(item.product_id);
    if (!isPositiveInt(item.quantity)) {
      errors.push(`Quantity must be a positive integer for ${item.product_id}`);
    }
    if (item.discount !== undefined && !isNonNegativeNumber(item.discount)) {
      errors.push(`Item discount cannot be negative for ${item.product_id}`);
    }
  }
  if (cart.discount !== undefined && !isNonNegativeNumber(cart.discount)) {
    errors.push('Order discount cannot be negative');
  }
  return errors;
}
