<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { hydrateUser, user } from '$lib/stores/user';
  import { toasts } from '$lib/stores/toast';
  import { logout } from '$lib/auth';
  import { permissions, loadPermissions } from '$lib/permissions';
  import { MENU } from '$lib/menu';

  let { children } = $props();

  // Re-sync the store with the persisted session on every navigation.
  // Fixes stale identity (e.g. sidebar showing previous account after re-login).
  $effect(() => {
    page.url.pathname;
    hydrateUser();
    // Refresh permissions from backend after every navigation (UI cache only).
    void loadPermissions();
  });

  const nav = $derived.by(() => {
    const perms = $permissions.permissions;
    return MENU.filter((item) => perms.has(item.permission));
  });

  function isActive(href: string): boolean {
    return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
  }
</script>

<div class="shell">
  <aside>
    <div class="brand">🛒 POS</div>
    <nav>
      {#each nav as item (item.href)}
        <a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
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
  }
  nav a:hover {
    color: var(--text);
    background: var(--bg-card);
  }
  nav a.active {
    color: #fff;
    background: var(--accent-strong);
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
