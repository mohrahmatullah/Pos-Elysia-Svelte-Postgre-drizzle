import { writable } from 'svelte/store';

/** UI theme — every role can switch it (topbar toggle). Stored per-user in
 * localStorage; when unset, falls back to the store's `default_theme`
 * (Store Settings → Tema Default Aplikasi). 'SYSTEM' follows the OS setting. */

export type ThemeChoice = 'DARK' | 'LIGHT' | 'SYSTEM';

const theme = writable<ThemeChoice>('DARK'); // resolved choice applied to <html>
const themePref = writable<ThemeChoice>('SYSTEM'); // the user's stored preference

const PREF_KEY = 'pos.theme';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

function readStoredPref(): ThemeChoice | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(PREF_KEY);
  return raw === 'DARK' || raw === 'LIGHT' || raw === 'SYSTEM' ? raw : null;
}

/** Apply a resolved theme to <html data-theme>. */
function apply(choice: Exclude<ThemeChoice, 'SYSTEM'>): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', choice.toLowerCase());
  // Keep the browser UI (scrollbars, form controls) in sync.
  document.documentElement.style.colorScheme = choice.toLowerCase();
}

function resolve(pref: ThemeChoice): Exclude<ThemeChoice, 'SYSTEM'> {
  if (pref === 'SYSTEM') return media?.matches ? 'LIGHT' : 'DARK';
  return pref;
}

/** Init from localStorage, else from the store default (Store Settings). */
export function initTheme(storeDefault: string | null | undefined): void {
  const pref = readStoredPref() ?? (storeDefault === 'LIGHT' || storeDefault === 'DARK' ? storeDefault : 'SYSTEM');
  themePref.set(pref);
  const resolved = resolve(pref);
  theme.set(resolved);
  apply(resolved);

  // Follow OS changes while on SYSTEM.
  media?.addEventListener('change', () => {
    let current: ThemeChoice = 'SYSTEM';
    const unsub = themePref.subscribe((v) => (current = v));
    unsub();
    if (current === 'SYSTEM') {
      const r = resolve('SYSTEM');
      theme.set(r);
      apply(r);
    }
  });
}

/** User switches theme (all roles). Persisted per-user in localStorage. */
export function setTheme(pref: ThemeChoice): void {
  themePref.set(pref);
  if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, pref);
  const resolved = resolve(pref);
  theme.set(resolved);
  apply(resolved);
}

export const currentTheme = { subscribe: theme.subscribe };
export const themePreference = { subscribe: themePref.subscribe };
