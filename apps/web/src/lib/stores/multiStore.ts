import { writable } from 'svelte/store';

/** Multi-store state: the stores the session user belongs to (sidebar switcher)
 * and which store the session is currently working in. Populated from /auth/me
 * (piggybacked by loadPermissions), updated by the switch flow in the sidebar. */
export interface UserStoreInfo {
  id: string;
  name: string;
  active: boolean;
}

export const userStores = writable<UserStoreInfo[]>([]);
export const currentStoreId = writable<string>('');

export function setStores(list: UserStoreInfo[], activeId: string): void {
  userStores.set(list);
  currentStoreId.set(activeId);
}

export function clearStores(): void {
  userStores.set([]);
  currentStoreId.set('');
}
