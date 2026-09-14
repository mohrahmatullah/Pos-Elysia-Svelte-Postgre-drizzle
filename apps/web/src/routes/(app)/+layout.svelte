<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { hydrateUser, user } from '$lib/stores/user';
  import { toasts } from '$lib/stores/toast';
  import { logout } from '$lib/auth';
  import { permissions, loadPermissions } from '$lib/permissions';
  import { menuItems, loadMenus, clearMenus } from '$lib/menu';
  import SidebarNav from '$lib/components/SidebarNav.svelte';
  import { Icon } from '$lib/icons';
  import { currentTheme, themePreference, setTheme, initTheme, type ThemeChoice } from '$lib/stores/theme';

  let { children } = $props();

  // Re-sync the store with the persisted session on every navigation.
  $effect(() => {
    page.url.pathname;
    hydrateUser();
    void loadPermissions().then(loadMenus);
  });

  // Theme: init once with the store default (from /settings when the user can read
  // it), then every role can cycle DARK → LIGHT → SYSTEM from the topbar.
  let themeReady = $state(false);
  $effect(() => {
    if (themeReady) return;
    themeReady = true;
    (async () => {
      let storeDefault: string | null = null;
      try {
        const res = await fetch('/api/v1/settings', {
          headers: { authorization: `Bearer ${JSON.parse(localStorage.getItem('pos.auth') ?? '{}').accessToken ?? ''}` },
        });
        if (res.ok) storeDefault = ((await res.json()).data as { default_theme?: string }).default_theme ?? null;
      } catch {
        /* theme falls back to SYSTEM */
      }
      initTheme(storeDefault);
    })();
  });

  const CYCLE: ThemeChoice[] = ['DARK', 'LIGHT', 'SYSTEM'];
  const NEXT_ICON: Record<ThemeChoice, string> = {
    DARK: 'mdi:weather-night',
    LIGHT: 'mdi:weather-sunny',
    SYSTEM: 'mdi:theme-light-dark',
  };
  const themeLabel: Record<ThemeChoice, string> = {
    DARK: 'Gelap',
    LIGHT: 'Terang',
    SYSTEM: 'Sistem',
  };
  function cycleTheme() {
    let cur: ThemeChoice = 'SYSTEM';
    const unsub = themePreference.subscribe((v) => (cur = v));
    unsub();
    setTheme(CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]);
  }

  // Logouts must also clear menus.
  $effect(() => {
    if (!$user) clearMenus();
  });

  // Mobile drawer state
  let drawerOpen = $state(false);

  // Close the drawer whenever the route changes.
  $effect(() => {
    page.url.pathname;
    drawerOpen = false;
  });

  const roleBadge = $derived($permissions.role ?? '');
  const initials = $derived(
    ($user?.name ?? 'U')
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );

  let menuOpen = $state(false);

  async function doLogout() {
    menuOpen = false;
    await logout();
    goto('/login');
  }

  // Reuse the nav renderer inside the desktop sidebar and the mobile drawer.
  const closeDrawer = () => (drawerOpen = false);
</script>

<div class="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
  <!-- ===== Desktop sidebar ===== -->
  <aside
    class="sticky top-0 hidden h-dvh flex-col border-r border-edge bg-surface-1 px-3 py-4 md:flex"
  >
    <SidebarNav />
    <div class="mt-3 border-t border-edge pt-3">
      <button
        class="relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
        onclick={() => (menuOpen = !menuOpen)}
      >
        <span
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-strong text-sm font-bold text-white"
        >
          {initials}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-ink">{$user?.name ?? ''}</span>
          <span class="block truncate text-xs uppercase tracking-wider text-accent"
            >{roleBadge}</span
          >
        </span>
        <Icon
          icon="mdi:chevron-up"
          width="16"
          height="16"
          class={`mt-0.5 text-dim transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {#if menuOpen}
        <div
          class="mt-2 rounded-xl border border-edge bg-surface-2 p-2 shadow-lg"
          transition:fly={{ y: -6, duration: 160, easing: cubicOut }}
        >
          <p class="truncate px-2 pb-2 text-xs text-dim">{$user?.email ?? ''}</p>
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-bad transition-colors hover:bg-surface-1"
            onclick={doLogout}
          >
            <Icon icon="mdi:logout" width="16" height="16" /> Logout
          </button>
        </div>
      {/if}
    </div>
  </aside>

  <!-- ===== Mobile drawer backdrop ===== -->
  {#if drawerOpen}
    <div
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
      transition:fade={{ duration: 150 }}
      onclick={closeDrawer}
      aria-hidden="true"
    ></div>
  {/if}

  <!-- ===== Mobile drawer ===== -->
  {#if drawerOpen}
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-edge bg-surface-1 px-3 py-4 md:hidden"
      transition:fly={{ x: -280, duration: 220, easing: cubicOut }}
    >
      <SidebarNav onNavigate={closeDrawer} />
    </aside>
  {/if}

  <!-- ===== Main column ===== -->
  <div class="flex min-h-dvh flex-col">
    <!-- Topbar (mobile) -->
    <header
      class="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-surface-1/90 px-4 py-3 backdrop-blur md:hidden"
    >
      <button
        class="grid h-9 w-9 place-items-center rounded-lg border border-edge bg-surface-2"
        aria-label="Buka menu"
        onclick={() => (drawerOpen = true)}
      >
        <Icon icon="mdi:menu" width="20" height="20" />
      </button>
      <span class="flex-1 font-bold tracking-tight text-ink">POS</span>
      <button
        class="grid h-9 w-9 place-items-center rounded-lg border border-edge bg-surface-2"
        aria-label="Ganti tema"
        title={`Tema: ${themeLabel[$themePreference]}`}
        onclick={cycleTheme}
      >
        <Icon icon={NEXT_ICON[$themePreference]} width="18" height="18" />
      </button>
      <button
        class="grid h-9 w-9 place-items-center rounded-full bg-strong text-xs font-bold text-white"
        aria-label="Akun"
        onclick={doLogout}
      >
        {initials}
      </button>
    </header>

    <!-- Page content -->
    <main class="flex-1 overflow-x-hidden">
      {@render children?.()}
    </main>
  </div>
</div>

{#each $toasts as t (t.id)}
  <div class="toast {t.kind}">
    <Icon icon={t.kind === 'success' ? 'mdi:check-circle-outline' : t.kind === 'error' ? 'mdi:alert-circle-outline' : 'mdi:information-outline'} width="17" height="17" />
    <span>{t.message}</span>
  </div>
{/each}

<style>
  .toast {
    position: fixed;
    bottom: 1.2rem;
    right: 1.2rem;
    padding: 0.7rem 1.1rem;
    border-radius: var(--radius);
    color: #fff;
    font-size: 0.9rem;
    z-index: 100;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: min(360px, calc(100vw - 2.4rem));
  }
  .toast :global(svg) {
    flex-shrink: 0;
  }
  .toast.success {
    background: var(--green);
  }
  .toast.error {
    background: var(--red);
  }
  .toast.info {
    background: var(--accent-strong);
  }
</style>
