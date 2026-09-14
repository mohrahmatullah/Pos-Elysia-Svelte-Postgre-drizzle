<script lang="ts">
  import { page } from '$app/state';
  import { menuItems } from '$lib/menu';
  import { Icon, isIconifyName } from '$lib/icons';
  import { slide } from 'svelte/transition';
  import { post, getUser } from '$lib/api';
  import { userStores, currentStoreId } from '$lib/stores/multiStore';
  import { permissions, loadPermissions } from '$lib/permissions';
  import { toastSuccess, toastError } from '$lib/stores/toast';

  /** Called when a link is clicked (used to close the mobile drawer). */
  let { onNavigate }: { onNavigate?: () => void } = $props();

  // ----- Multi-store switcher -----
  // The dropdown needs BOTH membership (>1 store) and the `store.switch`
  // permission (owner by default). Users with multiple memberships but no
  // permission just see their current store as a badge.
  let switching = $state(false);
  const stores = $derived($userStores);
  const activeId = $derived($currentStoreId);
  const activeName = $derived(stores.find((s) => s.id === activeId)?.name ?? stores[0]?.name ?? '');
  const canSwitch = $derived($permissions.permissions.has('store.switch'));

  async function switchStore(storeId: string) {
    if (switching || storeId === activeId) return;
    switching = true;
    try {
      const { data } = await post<{ accessToken: string; store: { id: string; name: string } }>(
        '/auth/switch-store',
        { store_id: storeId },
      );
      // Persist the fresh access token (carries the new active store claim).
      const current = getUser();
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('pos.auth') : null;
      if (raw && current) {
        const parsed = JSON.parse(raw) as { accessToken: string; refreshToken: string; user: typeof current };
        parsed.accessToken = data.accessToken;
        parsed.user = { ...parsed.user, storeId };
        localStorage.setItem('pos.auth', JSON.stringify(parsed));
      }
      // Re-sync permissions (now scoped to the new store context) + reload data.
      await loadPermissions();
      toastSuccess(`Berpindah ke ${data.store.name}`);
      // Full reload so every page refetches with the new store scope.
      location.reload();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      switching = false;
    }
  }

  const nav = $derived($menuItems);

  const hasIcon = (icon: string | null): boolean => Boolean(icon && icon.trim());

  function isActive(href: string): boolean {
    return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
  }

  /** Groups with an active child (or an active own href) start expanded. */
  function isExpanded(groupId: string): boolean {
    const group = nav.find((g) => g.id === groupId);
    if (!group) return false;
    if (group.href && isActive(group.href)) return true;
    return group.children.some((c) => isActive(c.href));
  }
</script>

<nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Navigasi utama">
  <div class="flex items-center gap-2 px-2 pb-3 pt-1 text-lg font-bold tracking-tight text-ink">
    <span class="grid h-8 w-8 place-items-center rounded-lg bg-strong text-white">
      <Icon icon="mdi:cart-outline" width="18" height="18" />
    </span>
    POS
  </div>

  {#if stores.length > 1 && canSwitch}
    <!-- Multi-store switcher: 2+ memberships AND store.switch permission -->
    <div class="store-switcher" class:busy={switching}>
      <label for="store-select">
        <Icon icon="mdi:store-outline" width="14" height="14" />
        Toko aktif
      </label>
      <select
        id="store-select"
        value={activeId}
        disabled={switching}
        onchange={(e) => switchStore((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each stores as s (s.id)}
          <option value={s.id} disabled={!s.active}>{s.name}{s.active ? '' : ' (nonaktif)'}</option>
        {/each}
      </select>
    </div>
  {:else}
    <!-- Store name always visible for non-switching users (kasir, manager, ...) -->
    <div class="store-badge" title="Toko aktif">
      <Icon icon="mdi:store-outline" width="14" height="14" />
      <span>{activeName || 'Toko'}</span>
    </div>
  {/if}

  {#each nav as group (group.id)}
    {#if group.href}
      <!-- Standalone link item (may still nest children beneath it) -->
      <a
        href={group.href}
        class="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.92rem] text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        class:active={isActive(group.href)}
        onclick={onNavigate}
      >
        {#if hasIcon(group.icon)}
          {#if isIconifyName(group.icon)}
            <Icon icon={group.icon} width="18" height="18" />
          {:else}<span>{group.icon}</span>{/if}
        {/if}
        <span>{group.label}</span>
      </a>
      {#if group.children.length > 0}
        {#each group.children as child (child.id)}
          <a
            href={child.href}
            class="ml-5 flex items-center gap-2 rounded-lg border-l-2 border-edge py-1.5 pl-3 pr-2 text-[0.85rem] text-dim transition-colors duration-150 hover:text-ink"
            class:active={isActive(child.href)}
            onclick={onNavigate}
          >
            {#if hasIcon(child.icon)}
              {#if isIconifyName(child.icon)}
                <Icon icon={child.icon} width="15" height="15" />
              {:else}<span>{child.icon}</span>{/if}
            {/if}
            <span>{child.label}</span>
          </a>
        {/each}
      {/if}
    {:else}
      <!-- Group header: collapsible section, visible only with >=1 permitted child -->
      <details open={isExpanded(group.id)} class="group/sect">
        <summary
          class="flex cursor-pointer select-none list-none items-center gap-2.5 rounded-lg px-3 py-2 text-[0.92rem] text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        >
          {#if hasIcon(group.icon)}
            {#if isIconifyName(group.icon)}
              <Icon icon={group.icon} width="18" height="18" />
            {:else}<span>{group.icon}</span>{/if}
          {/if}
          <span>{group.label}</span>
          <Icon
            icon="mdi:chevron-right"
            width="14"
            height="14"
            class="ml-auto transition-transform duration-200 group-open/sect:rotate-90"
          />
        </summary>
        {#each group.children as child (child.id)}
          <a
            href={child.href}
            class="ml-5 flex items-center gap-2 rounded-lg border-l-2 border-edge py-1.5 pl-3 pr-2 text-[0.85rem] text-dim transition-colors duration-150 hover:text-ink"
            class:active={isActive(child.href)}
            onclick={onNavigate}
          >
            {#if hasIcon(child.icon)}
              {#if isIconifyName(child.icon)}
                <Icon icon={child.icon} width="15" height="15" />
              {:else}<span>{child.icon}</span>{/if}
            {/if}
            <span>{child.label}</span>
          </a>
        {/each}
      </details>
    {/if}
  {/each}
</nav>

<style>
  /* Active states rely on global tokens; keep component-specific tweaks here. */
  nav a.active {
    background: var(--accent-strong);
    color: #fff;
    border-left-color: transparent;
  }
  nav details summary::-webkit-details-marker {
    display: none;
  }

  .store-switcher {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0.25rem 0.75rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-soft);
    transition: opacity 150ms;
  }
  .store-switcher.busy {
    opacity: 0.55;
    pointer-events: none;
  }
  .store-switcher label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
  }
  .store-switcher select {
    width: 100%;
    font-size: 0.85rem;
    padding: 0.3rem 0.4rem;
  }
  .store-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0.25rem 0.75rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-soft);
    font-size: 0.8rem;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
  }
  .store-badge span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
