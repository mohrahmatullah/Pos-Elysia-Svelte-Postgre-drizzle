/** Dynamic menu store — grouped sidebar from GET /menus/my (permission-filtered server-side).
 * Group headers (href null) render as non-clickable section titles; link items render
 * inside their group. The backend only returns groups with >=1 visible child.
 */
import { writable } from 'svelte/store';
import { get } from '$lib/api';

export interface MenuChild {
  id: string;
  label: string;
  href: string;
  icon: string | null;
}

export interface MenuGroup {
  id: string;
  label: string;
  icon: string | null;
  /** null = pure group header (not clickable); string = standalone link item. */
  href: string | null;
  children: MenuChild[];
}

export const menuItems = writable<MenuGroup[]>([]);
export const menuLoaded = writable<boolean>(false);

/** Refresh menus for the current user (call after login and on navigation). */
export async function loadMenus(): Promise<void> {
  try {
    const { data } = await get<MenuGroup[]>('/menus/my');
    menuItems.set(data);
    menuLoaded.set(true);
  } catch {
    // API unreachable — keep last known menus (rendering only, never a security boundary)
  }
}

export function clearMenus(): void {
  menuItems.set([]);
  menuLoaded.set(false);
}
