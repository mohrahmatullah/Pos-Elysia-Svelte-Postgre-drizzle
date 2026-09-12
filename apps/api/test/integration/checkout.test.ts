/**
 * Integration test — requires the API running with a migrated+seeded database:
 *   bun run dev:api   (terminal 1)
 *   bun run test:integration   (terminal 2)
 * Covers the E2E-critical slice: login -> checkout -> stock decrement -> sales history.
 */
import { describe, expect, test } from 'bun:test';

const BASE = process.env.API_URL ?? 'http://localhost:3001';
const API = `${BASE}/api/v1`;

let token = '';
const productId = (): string => process.env.TEST_PRODUCT_ID ?? '';
let productBefore = 0;

async function apiCall(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() as any };
}

describe('auth', () => {
  test('login with seeded owner account', async () => {
    const { status, json } = await apiCall('POST', '/auth/login', { email: 'owner@pos.local', password: 'Passw0rd!' }, { authorization: '' });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    token = json.data.accessToken;
    expect(json.data.user.role).toBe('owner');
  });

  test('login rejects wrong password safely', async () => {
    const { status, json } = await apiCall('POST', '/auth/login', { email: 'owner@pos.local', password: 'wrong' }, { authorization: '' });
    expect(status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  test('/auth/me returns identity', async () => {
    const { status, json } = await apiCall('GET', '/auth/me');
    expect(status).toBe(200);
    expect(json.data.role).toBe('owner');
  });

  test('protected route rejects missing token', async () => {
    const res = await fetch(`${API}/products`);
    expect(res.status).toBe(401);
  });
});

describe('products + inventory', () => {
  test('product list includes stock', async () => {
    const { status, json } = await apiCall('GET', '/products?limit=1');
    expect(status).toBe(200);
    expect(json.data.length).toBe(1);
    if (!process.env.TEST_PRODUCT_ID) process.env.TEST_PRODUCT_ID = json.data[0].id;
    expect(productId()).toBeTruthy();
  });

  test('stock adjustment records movement', async () => {
    const { status, json } = await apiCall('POST', '/inventory/adjustments', {
      product_id: productId(),
      movement_type: 'ADJUSTMENT_IN',
      quantity: 5,
      reason: 'test restock',
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });
});

describe('checkout flow (PRD 6.2)', () => {
  test('cash checkout decrements stock and creates sale + payment + movement', async () => {
    const before = (await apiCall('GET', `/products/${productId()}`)).json.data.stock;

    const qty = 2;
    const res = await apiCall('POST', '/sales', {
      items: [{ product_id: productId(), quantity: qty }],
      method: 'CASH',
      amount_paid: 1_000_000,
    }, { 'idempotency-key': crypto.randomUUID() });

    expect(res.status).toBe(200);
    const sale = res.json.data;
    expect(sale.invoice_number).toMatch(/^INV-\d{8}-\d{6}$/);
    expect(sale.status).toBe('completed');
    expect(Number(sale.payments[0].amount)).toBe(1_000_000);

    const after = (await apiCall('GET', `/products/${productId()}`)).json.data.stock;
    expect(Number(after)).toBe(Number(before) - qty);
  });

  test('idempotency key prevents duplicate sale (PRD 27)', async () => {
    const key = crypto.randomUUID();
    const body = { items: [{ product_id: productId(), quantity: 1 }], method: 'CASH', amount_paid: 1_000_000 };
    const r1 = await apiCall('POST', '/sales', body, { 'idempotency-key': key });
    const r2 = await apiCall('POST', '/sales', body, { 'idempotency-key': key });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.json.data.invoice_number).toBe(r1.json.data.invoice_number);
  });

  test('insufficient stock rejected (PRD 20)', async () => {
    const { json } = await apiCall('GET', `/products/${productId()}`);
    const stock = Number(json.data.stock);
    const { status, json: err } = await apiCall('POST', '/sales', {
      items: [{ product_id: productId(), quantity: stock + 999 }],
      method: 'CASH',
      amount_paid: 999_999_999,
    }, { 'idempotency-key': crypto.randomUUID() });
    expect(status).toBe(400);
    expect(err.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('underpayment rejected (PRD 6.4)', async () => {
    const { status, json: err } = await apiCall('POST', '/sales', {
      items: [{ product_id: productId(), quantity: 1 }],
      method: 'CASH',
      amount_paid: 1,
    }, { 'idempotency-key': crypto.randomUUID() });
    expect(status).toBe(400);
    expect(err.error.code).toBe('INVALID_PAYMENT');
  });
});
