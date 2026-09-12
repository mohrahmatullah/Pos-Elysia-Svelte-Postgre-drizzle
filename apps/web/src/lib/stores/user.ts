import { writable } from 'svelte/store';
import { getUser, loadSession, type SessionUser } from '$lib/api';

/**
 * Current session user. Single source of truth for the UI.
 * MUST be updated at every session change point:
 *  - login() / logout() in $lib/auth
 *  - navigation hydration in (app)/+layout.svelte ($effect)
 *  - cross-tab `storage` events (below)
 */
export const user = writable<SessionUser | null>(null);

export const setUser = (u: SessionUser | null): void => {
  user.set(u);
};

/** Re-reads persisted session into the store (used on boot and cross-tab sync). */
export const hydrateUser = (): SessionUser | null => {
  loadSession();
  const u = getUser();
  user.set(u);
  return u;
};

// Keep multiple tabs in sync: another tab logging in/out updates this tab's UI too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'pos.auth' || e.key === null) {
      hydrateUser();
    }
  });
}
