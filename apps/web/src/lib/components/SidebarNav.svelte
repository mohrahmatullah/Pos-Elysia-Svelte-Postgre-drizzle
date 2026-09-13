<script lang="ts">
  import { page } from '$app/state';
  import { menuItems } from '$lib/menu';
  import { Icon, isIconifyName } from '$lib/icons';
  import { slide } from 'svelte/transition';

  /** Called when a link is clicked (used to close the mobile drawer). */
  let { onNavigate }: { onNavigate?: () => void } = $props();

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
</style>
