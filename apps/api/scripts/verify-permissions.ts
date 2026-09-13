/** E2E check of the dynamic permission system (API must already be running on :3001).
 * Verifies: login payload -> enforcement -> live re-grant via UI endpoint -> revoke.
 */
const BASE = 'http://localhost:3001/api/v1';

let failures = 0;
const check = (name: string, cond: boolean, extra = ''): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};

interface LoginResult {
  accessToken: string;
  role: string;
  permissions: string[];
  user: { id: string };
}

async function login(email: string): Promise<LoginResult> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Passw0rd!' }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(json)}`);
  return json.data;
}

async function call(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const owner = await login('owner@pos.local');
  const manager = await login('manager@pos.local');
  const cashier = await login('cashier@pos.local');

  check('owner login has 24 permissions', owner.permissions.length === 24, String(owner.permissions.length));
  check('manager login has 22 permissions', manager.permissions.length === 22, String(manager.permissions.length));
  check('cashier login has 11 permissions', cashier.permissions.length === 11, String(cashier.permissions.length));

  // Enforcement before any change
  const usersAsCashier = await call('GET', '/users?limit=1', cashier.accessToken);
  check('cashier GET /users -> 403', usersAsCashier.status === 403);
  const usersAsOwner = await call('GET', '/users?limit=1', owner.accessToken);
  check('owner GET /users -> 200', usersAsOwner.status === 200);

  // Permission-driven sales scoping (cashier has no sales.cancel -> own sales only)
  const ownSales = await call('GET', '/sales?limit=100', cashier.accessToken);
  const foreign = (ownSales.json.data ?? []).filter((s: any) => s.cashier_id !== cashier.user.id);
  check('cashier sees only own sales', ownSales.status === 200 && foreign.length === 0);
  const allSales = await call('GET', '/sales?limit=100', manager.accessToken);
  check('manager (has sales.cancel) sees all sales', allSales.status === 200);

  // Live re-grant through the Role & Permission UI endpoint
  const rolesRes = await call('GET', '/permissions/roles', owner.accessToken);
  const cashierRole = (rolesRes.json.data ?? []).find((r: any) => r.name === 'cashier');
  const current = await call('GET', `/permissions/role/${cashierRole.id}`, owner.accessToken);
  const originalCodes: string[] = current.json.data.codes;
  check('cashier role has 11 codes in DB', originalCodes.length === 11, String(originalCodes.length));

  const saved = await call('PUT', `/permissions/role/${cashierRole.id}`, owner.accessToken, {
    codes: [...originalCodes, 'user.manage'],
  });
  check('owner saves cashier set with user.manage', saved.status === 200);
  if (saved.status !== 200) console.log('   ', JSON.stringify(saved.json));

  const afterGrant = await call('GET', '/users?limit=1', cashier.accessToken);
  check('cashier GET /users -> 200 without re-login', afterGrant.status === 200);
  const me = await call('GET', '/auth/me', cashier.accessToken);
  check('/me reflects new set (12 perms)', (me.json.data?.permissions ?? []).length === 12);

  // Non-owner cannot edit permissions
  const denied = await call('PUT', `/permissions/role/${cashierRole.id}`, manager.accessToken, { codes: originalCodes });
  check('manager PUT permissions -> 403', denied.status === 403);

  // Restore original set
  const restore = await call('PUT', `/permissions/role/${cashierRole.id}`, owner.accessToken, { codes: originalCodes });
  check('restore cashier set', restore.status === 200);
  const afterRevoke = await call('GET', '/users?limit=1', cashier.accessToken);
  check('cashier GET /users -> 403 again', afterRevoke.status === 403);

  // Catalog for the UI matrix
  const catalog = await call('GET', '/permissions', owner.accessToken);
  check('catalog resources >= 10', Object.keys(catalog.json.data.resources ?? {}).length >= 10);
  check('catalog labels = 24', Object.keys(catalog.json.data.labels ?? {}).length === 24);

  console.log(failures === 0 ? '\nAll permission checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verification failed:', err);
  process.exit(1);
});
