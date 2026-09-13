import { redirect } from '@sveltejs/kit';
import { loadSession, getUser } from '$lib/api';
import { permissions, loadPermissions } from '$lib/permissions';
import { MENU } from '$lib/menu';

export const ssr = false;

/** Page -> permission map. Mirrors $lib/menu; keeps deep links guarded, not just the sidebar. */
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/': 'dashboard.view',
  '/pos': 'sales.create',
  '/products': 'product.view',
  '/inventory': 'inventory.view',
  '/sales': 'sales.view',
  '/customers': 'customer.view',
  '/reports': 'report.view',
  '/users': 'user.manage',
  '/roles': 'user.manage',
  '/audit': 'audit.view',
  '/settings': 'settings.manage',
};

export async function load({ url }) {
  loadSession();
  const user = getUser();
  if (!user) {
    throw redirect(302, '/login');
  }

  // Hard refresh: the permission store starts empty. Fill it before guarding so we
  // never redirect a legitimately-authorized user on a cold start.
  const readState = (): { loaded: boolean; permissions: ReadonlySet<string> } => {
    let s: { loaded: boolean; permissions: ReadonlySet<string> } = { loaded: false, permissions: new Set() };
    permissions.subscribe((v) => (s = v))();
    return s;
  };
  if (!readState().loaded) {
    await loadPermissions();
  }
  const state = readState();

  // Exact-match guard for the dashboard; prefix-match for the rest.
  // Skipped when the store failed to load (API down): the backend still enforces
  // every API call, so this guard only affects rendering, never security.
  const path = url.pathname;
  const required = ROUTE_PERMISSIONS[path] ?? ROUTE_PERMISSIONS[`/${path.split('/')[1]}`];
  if (state.loaded && required && !state.permissions.has(required)) {
    // Land the user on the first page they are actually allowed to see.
    const fallback = MENU.find((m) => state.permissions.has(m.permission));
    throw redirect(302, fallback?.href ?? '/login');
  }

  return { user };
}
