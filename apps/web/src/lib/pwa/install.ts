/** Install-prompt state (beforeinstallprompt + iOS detection). */
import { writable } from 'svelte/store';

export type InstallState = 'unsupported' | 'installed' | 'promptable' | 'ios';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let ioWatched = false;

export const installState = writable<InstallState>('unsupported');
export const installDismissed = writable<boolean>(false);

const DISMISS_KEY = 'pos.pwa.installDismissed';

/** Init from a user gesture (button click) — browsers require it. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null;
  installState.set('installed');
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'dismissed') installState.set('promptable');
    return outcome;
  } catch {
    installState.set('promptable');
    return 'unavailable';
  }
}

export function dismissInstall(): void {
  installDismissed.set(true);
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** Track installed state (app launched from home screen). */
function checkInstalled(): void {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    installState.set('installed');
  }
}

/** Wire browser events. Call once from the root layout onMount. */
export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  checkInstalled();
  try {
    installDismissed.set(localStorage.getItem(DISMISS_KEY) === '1');
  } catch {
    /* private mode */
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    installState.set('promptable');
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    installState.set('installed');
  });

  // iOS Safari: no beforeinstallprompt — surface manual instructions instead.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !ioWatched) {
    ioWatched = true;
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) installState.set('ios');
  }
}
