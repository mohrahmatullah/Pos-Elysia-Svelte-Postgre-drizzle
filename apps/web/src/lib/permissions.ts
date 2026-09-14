/** Permission store + helpers (PRD 25).
 *
 * The backend is the security boundary; this store only drives rendering
 * (sidebar items, visible buttons, disabled states).
 * Filled from POST /auth/login response and kept fresh via GET /auth/me.
 */
import { writable } from 'svelte/store';
import { get, post } from '$lib/api';
import { setStores, clearStores } from '$lib/stores/multiStore';

export interface PermissionState {
  permissions: ReadonlySet<string>;
  role: string;
  loaded: boolean;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Read via `$permissions` in components. */
export const permissions = writable<PermissionState>({
  permissions: EMPTY,
  role: '',
  loaded: false,
});

/** Imperative check usable outside reactive contexts. */
export function hasPermission(code: string): boolean {
  let ok = false;
  permissions.subscribe((s) => (ok = s.permissions.has(code)))();
  return ok;
}

export function setPermissions(perms: string[], role: string): void {
  permissions.set({ permissions: new Set(perms), role, loaded: true });
}

export function clearPermissions(): void {
  permissions.set({ permissions: EMPTY, role: '', loaded: false });
  clearStores();
}

/** Refresh the store from the backend (GET /auth/me). */
export async function loadPermissions(): Promise<void> {
  try {
    const { data } = await get<{ role: string; permissions: string[]; store_id?: string; stores?: { id: string; name: string; active: boolean }[] }>(
      '/auth/me',
    );
    setPermissions(data.permissions, data.role);
    if (data.store_id) {
      setStores(data.stores ?? [], data.store_id);
    } else {
      clearStores();
    }
  } catch {
    // keep current state; backend stays the security boundary anyway
  }
}

/** Apply the permission payload returned by POST /auth/login. */
export function applyLoginPermissions(payload: { role?: string; permissions?: string[] }): void {
  if (payload.permissions && payload.role) {
    setPermissions(payload.permissions, payload.role);
  }
}
