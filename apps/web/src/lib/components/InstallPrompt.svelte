<script lang="ts">
  import { fly } from 'svelte/transition';
  import {
    installState,
    installDismissed,
    promptInstall,
    dismissInstall,
  } from '$lib/pwa/install';
  import { Icon } from '$lib/icons';

  /** Set by the root layout so the banner never covers auth/account pages. */
  let { enabled = true }: { enabled?: boolean } = $props();

  const state = $derived($installState);
  const dismissed = $derived($installDismissed);
  const visible = $derived(
    enabled && !dismissed && (state === 'promptable' || state === 'ios'),
  );
</script>

{#if visible}
  <div
    class="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-edge bg-surface-2/95 p-4 shadow-2xl backdrop-blur md:inset-x-auto md:right-5"
    transition:fly={{ y: 24, duration: 220 }}
    role="dialog"
    aria-label="Install aplikasi"
  >
    <div class="flex items-start gap-3">
      <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-strong text-white">
        <Icon icon="mdi:cart-outline" width="24" height="24" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="m-0 text-sm font-semibold text-ink">Install POS App</p>
        {#if state === 'ios'}
          <p class="mt-0.5 text-xs leading-relaxed text-dim">
            Di Safari: ketuk <span class="font-semibold text-ink">Bagikan</span> lalu pilih
            <span class="font-semibold text-ink">"Tambah ke Layar Utama"</span>.
          </p>
        {:else}
          <p class="mt-0.5 text-xs leading-relaxed text-dim">
            Akses lebih cepat & tetap bisa dibuka saat offline.
          </p>
        {/if}
        <div class="mt-2.5 flex gap-2">
          {#if state === 'promptable'}
            <button class="primary rounded-lg px-3 py-1.5 text-xs" onclick={() => void promptInstall()}>
              Install
            </button>
          {/if}
          <button
            class="rounded-lg border border-edge bg-transparent px-3 py-1.5 text-xs text-dim hover:text-ink"
            onclick={dismissInstall}
          >
            Nanti saja
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
