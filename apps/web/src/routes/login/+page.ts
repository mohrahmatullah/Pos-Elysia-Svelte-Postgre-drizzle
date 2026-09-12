import { redirect } from '@sveltejs/kit';
import { loadSession, getUser } from '$lib/api';

export const ssr = false;

export function load() {
  loadSession();
  if (getUser()) {
    throw redirect(302, '/');
  }
}
