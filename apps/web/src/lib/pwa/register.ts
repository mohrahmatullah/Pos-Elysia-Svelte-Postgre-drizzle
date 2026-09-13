/** Service-worker registration + update flow (client only). */

export const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** Register /sw.js (production builds only — dev SW just gets in the way). */
export async function registerServiceWorker(): Promise<void> {
  if (!swSupported || !import.meta.env.PROD) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Auto-activate a waiting worker so users get updates on the next visit.
    reg.waiting?.postMessage('SKIP_WAITING');
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', (e) => {
        const sw = e.target as ServiceWorker;
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          sw.postMessage('SKIP_WAITING');
        }
      });
    });
  } catch {
    // SW registration is an enhancement — never block the app.
  }
}

/** Post-install cleanup (called after first app launch). */
export async function unregisterStaleWorkers(): Promise<void> {
  if (!swSupported) return;
  // no-op placeholder for future cleanup needs
}
