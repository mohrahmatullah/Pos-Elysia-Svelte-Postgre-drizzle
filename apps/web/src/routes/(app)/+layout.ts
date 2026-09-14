import { redirect } from '@sveltejs/kit';
import { loadSession, getUser } from '$lib/api';
import { permissions, loadPermissions } from '$lib/permissions';
import { menuItems, loadMenus, type MenuGroup } from '$lib/menu';

export const ssr = false;

/** Channel route guard: these pages belong to one business type. The menus are
 * already scoped server-side, but a stale tab / typed URL must not show a broken
 * page — redirect to the first menu the user may actually see. */
const CHANNEL_ROUTES: Record<string, 'RETAIL' | 'RESTO'> = {
  '/pos': 'RETAIL',
  '/resto': 'RESTO',
  '/resto/tables': 'RESTO',
  '/kitchen': 'RESTO',
};

const readStore = <T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T => {
  let v!: T;
  store.subscribe((val) => (v = val))();
  return v;
};

export async function load({ url }) {
  loadSession();
  const user = getUser();
  if (!user) {
    throw redirect(302, '/login');
  }

  // Hard refresh: hydrate permissions + dynamic menus before guarding so we never
  // redirect a legitimately-authorized user on a cold start.
  if (!readStore(permissions).loaded) {
    await loadPermissions();
  }
  let menus: MenuGroup[] = readStore(menuItems);
  if (menus.length === 0) {
    await loadMenus();
    menus = readStore(menuItems);
  }

  // Guard: the visited path must be one of the user's allowed menu hrefs
  // (a group's own href or any of its children's). If /menus/my returned nothing
  // (API down), skip guarding — the backend still enforces every API call.
  if (menus.length > 0) {
    const path = url.pathname;
    const hrefs = menus.flatMap((g) => [g.href, ...g.children.map((c) => c.href)]).filter((h): h is string => Boolean(h));
    const allowed = hrefs.some((h) => h === path || (h !== '/' && path.startsWith(h + '/')));
    if (!allowed) {
      throw redirect(302, hrefs[0] ?? '/'); // first page the user may see
    }
  }

  // Channel guard by the ACTIVE STORE's business type (not the user's permissions):
  // a RESTO store never opens the retail POS, a RETAIL store never opens resto pages,
  // HYBRID gets both. Menus are hidden server-side; this covers typed URLs.
  const biz = readStore(permissions).businessType;
  const channel = CHANNEL_ROUTES[url.pathname];
  if (biz && channel && biz !== 'HYBRID' && biz !== channel) {
    const menusNow = readStore(menuItems);
    const fallback = menusNow.flatMap((g) => [g.href, ...g.children.map((c) => c.href)]).find((h): h is string => Boolean(h));
    throw redirect(302, fallback ?? '/');
  }

  return { user };
}
