<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { hydrateUser, user } from '$lib/stores/user';
  import { toasts } from '$lib/stores/toast';
  import { logout } from '$lib/auth';
  import { permissions, loadPermissions } from '$lib/permissions';
  import { menuItems, loadMenus, clearMenus } from '$lib/menu';
  import { Icon, isIconifyName } from '$lib/icons';

  let { children } = $props();

  // Re-sync the store with the persisted session on every navigation.
  // Fixes stale identity (e.g. sidebar showing previous account after re-login).
  $effect(() => {
    page.url.pathname;
    hydrateUser();
    // Refresh permissions + dynamic menus from backend after every navigation.
    void loadPermissions().then(loadMenus);
  });

  // Logouts must also clear menus.
  $effect(() => {
    if (!$user) clearMenus();
  });

  const nav = $derived($menuItems);

  /** Render helper: Iconify component for icon names, plain text otherwise (emoji). */
  const hasIcon = (icon: string | null): boolean => Boolean(icon && icon.trim());

  /** Groups with an active child (or an active own href) start expanded. */
  const isExpanded = (groupId: string): boolean => {
    const group = nav.find((g) => g.id === groupId);
    if (!group) return false;
    if (group.href && isActive(group.href)) return true;
    return group.children.some((c) => isActive(c.href));
  };

  function isActive(href: string): boolean {
    return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
  }
</script>

<div class="shell">
  <aside>
    <div class="brand">🛒 POS</div>
    <nav>
      {#each nav as group (group.id)}
        {#if group.href}
          <!-- Standalone link item (may still nest children beneath it) -->
          <a href={group.href} class:active={isActive(group.href)}>
            {#if hasIcon(group.icon)}
              {#if isIconifyName(group.icon)}<Icon icon={group.icon} width="18" height="18" />{:else}<span>{group.icon}</span>{/if}
            {/if}
            <span>{group.label}</span>
          </a>
          {#if group.children.length > 0}
            <div class="sub">
              {#each group.children as child (child.id)}
                <a href={child.href} class:active={isActive(child.href)}>
                  {#if hasIcon(child.icon)}
                    {#if isIconifyName(child.icon)}<Icon icon={child.icon} width="16" height="16" />{:else}<span>{child.icon}</span>{/if}
                  {/if}
                  <span>{child.label}</span>
                </a>
              {/each}
            </div>
          {/if}
        {:else}
          <!-- Group header: collapsible section, visible only with >=1 permitted child -->
          <details open={isExpanded(group.id)} class="group">
            <summary>
              {#if hasIcon(group.icon)}
                {#if isIconifyName(group.icon)}<Icon icon={group.icon} width="18" height="18" />{:else}<span>{group.icon}</span>{/if}
              {/if}
              <span>{group.label}</span>
            </summary>
            <div class="sub">
              {#each group.children as child (child.id)}
                <a href={child.href} class:active={isActive(child.href)}>
                  {#if hasIcon(child.icon)}
                    {#if isIconifyName(child.icon)}<Icon icon={child.icon} width="16" height="16" />{:else}<span>{child.icon}</span>{/if}
                  {/if}
                  <span>{child.label}</span>
                </a>
              {/each}
            </div>
          </details>
        {/if}
      {/each}
    </nav>
    <div class="user-box">
      <div class="muted small">{$user?.name ?? ''}</div>
      <div class="muted small">{$user?.email ?? ''}</div>
      <div class="role-badge">{$permissions.role ?? ''}</div>
      <button
        class="ghost"
        onclick={async () => {
          await logout();
          goto('/login');
        }}>Logout</button
      >
    </div>
  </aside>
  <main>
    {@render children?.()}
  </main>
</div>

{#each $toasts as t (t.id)}
  <div class="toast {t.kind}">{t.message}</div>
{/each}

<style>
  .shell {
    display: grid;
    grid-template-columns: 210px 1fr;
    min-height: 100vh;
  }
  aside {
    background: var(--bg-soft);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 1rem 0.8rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .brand {
    font-weight: 700;
    font-size: 1.15rem;
    padding: 0.4rem 0.6rem 1rem;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  nav a {
    color: var(--text-dim);
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    font-size: 0.92rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  nav a :global(svg),
  details.group summary :global(svg) {
    flex-shrink: 0;
  }
  nav a:hover {
    color: var(--text);
    background: var(--bg-card);
  }
  nav a.active {
    color: #fff;
    background: var(--accent-strong);
  }
  details.group summary {
    color: var(--text-dim);
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    font-size: 0.92rem;
    cursor: pointer;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  details.group summary::-webkit-details-marker {
    display: none;
  }
  details.group summary::after {
    content: '▸';
    margin-left: auto;
    transition: transform 0.15s ease;
    font-size: 0.75rem;
  }
  details.group[open] summary::after {
    transform: rotate(90deg);
  }
  details.group summary:hover {
    color: var(--text);
    background: var(--bg-card);
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 0.9rem;
    border-left: 2px solid var(--border);
    margin: 2px 0 6px 0.9rem;
  }
  .sub a {
    font-size: 0.86rem;
    padding: 0.4rem 0.6rem;
  }
  .user-box {
    border-top: 1px solid var(--border);
    padding-top: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .role-badge {
    font-size: 0.72rem;
    text-transform: uppercase;
    color: var(--accent);
    letter-spacing: 0.06em;
  }
  .ghost {
    background: transparent;
  }
  main {
    overflow: auto;
  }
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
  }
  .toast.success { background: var(--green); }
  .toast.error { background: var(--red); }
  .toast.info { background: var(--accent-strong); }
</style>
