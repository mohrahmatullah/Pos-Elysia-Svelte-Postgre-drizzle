/** Cart store (PRD 24 — local UI state, persisted to guard against reload). */
import { writable, derived } from 'svelte/store';

export interface CartLine {
  product_id: string;
  name: string;
  sku: string;
  price: number; // display price in IDR
  quantity: number;
  discount: number;
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

/** Client-side mirror of PRD 29 for UX only; server recalculates authoritatively. */
export const totals = derived<[typeof cart, typeof orderDiscount], CartTotals>(
  [cart, orderDiscount],
  ([$cart, $discount]) => {
    const subtotal = $cart.reduce((a, l) => a + l.price * l.quantity - l.discount, 0);
    const discount = Math.min($discount, subtotal);
    const taxable = subtotal - discount;
    const tax = Math.round(taxable * 0.11);
    return { subtotal, discount, tax, grandTotal: taxable + tax };
  },
);

export function addToCart(product: { id: string; name: string; sku: string; selling_price: string; stock: number }): void {
  cart.update((lines) => {
    const existing = lines.find((l) => l.product_id === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stock) return lines;
      existing.quantity += 1;
      return lines;
    }
    if (product.stock <= 0) return lines;
    return [
      ...lines,
      {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        price: Number.parseFloat(product.selling_price),
        quantity: 1,
        discount: 0,
        stock: product.stock,
      },
    ];
  });
}

export function setQuantity(productId: string, quantity: number): void {
  cart.update((lines) =>
    quantity <= 0
      ? lines.filter((l) => l.product_id !== productId)
      : lines.map((l) => (l.product_id === productId ? { ...l, quantity: Math.min(quantity, l.stock) } : l)),
  );
}

export function removeLine(productId: string): void {
  cart.update((lines) => lines.filter((l) => l.product_id !== productId));
}

export function clearCart(): void {
  cart.set([]);
  orderDiscount.set(0);
}
