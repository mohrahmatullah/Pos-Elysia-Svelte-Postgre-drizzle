/** Cart store (PRD 24 — local UI state, persisted to guard against reload). */
import { writable, derived } from 'svelte/store';

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  price: number; // display price in IDR
  quantity: number;
  /** Resolved per-line discount in Rp (from the product's discount config). */
  discount: number;
  /** Product discount config (source of `discount`, recomputed on qty change). */
  discount_type: 'PERCENT' | 'NOMINAL';
  discount_value: number;
  stock: number;
}

const STORAGE_KEY = 'pos.cart';

function load(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export const cart = writable<CartLine[]>(load());

cart.subscribe((lines) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
});

export const cartCount = derived(cart, (lines) => lines.reduce((a, l) => a + l.quantity, 0));

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
}

export const orderDiscount = writable<number>(0);

/** Order discount mode: NOMINAL = Rp amount in `orderDiscount`, PERCENT = % of subtotal. */
export const orderDiscountType = writable<'PERCENT' | 'NOMINAL'>('NOMINAL');
/** Percent value used when orderDiscountType is PERCENT. */
export const orderDiscountPercent = writable<number>(0);

/** Client-side mirror of PRD 29 for UX only; server recalculates authoritatively. */
export const totals = derived<[typeof cart, typeof orderDiscount, typeof orderDiscountType, typeof orderDiscountPercent], CartTotals>(
  [cart, orderDiscount, orderDiscountType, orderDiscountPercent],
  ([$cart, $discount, $dtype, $dpercent]) => {
    const subtotal = $cart.reduce((a, l) => a + l.price * l.quantity - l.discount, 0);
    // Defensive against number-input edge values (null when cleared, NaN, negative):
    // display and payment must never go NaN or negative.
    const discountRp =
      $dtype === 'PERCENT'
        ? Math.round((subtotal * Math.min(Number.isFinite($dpercent) ? Math.max(0, $dpercent) : 0, 100)) / 100)
        : Math.min(Math.max(0, Number.isFinite($discount) ? $discount : 0), subtotal);
    const discount = Math.min(discountRp, subtotal);
    const taxable = subtotal - discount;
    const tax = Math.round(taxable * 0.11);
    return { subtotal, discount, tax, grandTotal: taxable + tax };
  },
);

/** Recomputes a line's per-line discount from the product's discount config.
 * PERCENT = % of unit price × qty; NOMINAL = flat Rp per unit × qty. */
export function lineDiscountCents(price: number, quantity: number, type: 'PERCENT' | 'NOMINAL', value: number): number {
  if (!value || value <= 0) return 0;
  const gross = price * quantity;
  return Math.min(Math.round(type === 'PERCENT' ? (gross * Math.min(value, 100)) / 100 : value * quantity), gross);
}

export function addToCart(product: {
  id: string;
  name: string;
  sku: string;
  selling_price: string;
  stock: number;
  discount_type?: 'PERCENT' | 'NOMINAL';
  discount_value?: string;
}): void {
  cart.update((lines) => {
    const existing = lines.find((l) => l.product_id === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stock) return lines;
      existing.quantity += 1;
      existing.discount = lineDiscountCents(
        existing.price,
        existing.quantity,
        existing.discount_type,
        existing.discount_value,
      );
      return lines;
    }
    if (product.stock <= 0) return lines;
    const price = Number.parseFloat(product.selling_price);
    const dtype = product.discount_type ?? 'NOMINAL';
    const dval = Number.parseFloat(product.discount_value ?? '0') || 0;
    return [
      ...lines,
      {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        price,
        quantity: 1,
        discount_type: dtype,
        discount_value: dval,
        discount: lineDiscountCents(price, 1, dtype, dval),
        stock: product.stock,
      },
    ];
  });
}

export function setQuantity(productId: string, quantity: number): void {
  cart.update((lines) =>
    quantity <= 0
      ? lines.filter((l) => l.product_id !== productId)
      : lines.map((l) => {
          if (l.product_id !== productId) return l;
          const quantity2 = Math.min(quantity, l.stock);
          return {
            ...l,
            quantity: quantity2,
            discount: lineDiscountCents(l.price, quantity2, l.discount_type, l.discount_value),
          };
        }),
  );
}

export function removeLine(productId: string): void {
  cart.update((lines) => lines.filter((l) => l.product_id !== productId));
}

export function clearCart(): void {
  cart.set([]);
  orderDiscount.set(0);
  orderDiscountPercent.set(0);
}
