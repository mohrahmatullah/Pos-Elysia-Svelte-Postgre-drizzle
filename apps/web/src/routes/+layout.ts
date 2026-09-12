import { loadSession, getUser, type SessionUser } from '$lib/api';

export const ssr = false; // SPA mode; API is separate

export function load(): { user: SessionUser | null } {
  loadSession();
  return { user: getUser() };
}
