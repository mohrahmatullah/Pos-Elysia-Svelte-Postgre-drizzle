import { redirect } from '@sveltejs/kit';
import { loadSession, getUser } from '$lib/api';
import { permissions, loadPermissions } from '$lib/permissions';
import { menuItems, loadMenus, type MenuGroup } from '$lib/menu';

export const ssr = false;

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

  return { user };
}
