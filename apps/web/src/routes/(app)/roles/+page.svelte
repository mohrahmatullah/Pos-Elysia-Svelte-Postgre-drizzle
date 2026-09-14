<script lang="ts">
  /** Role & Permission management (PRD 25).
   * Left: dynamic role list (create / rename / delete; owner protected).
   * Right: permission checkboxes grouped by resource + Select All.
   * Delete cascades to role_permissions on the backend; users must be reassigned first.
   */
  import { onMount } from 'svelte';
  import { get, post, put, patch, del } from '$lib/api';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';
  import { Icon, isIconifyName } from '$lib/icons';

  interface MenuRow {
    id: string;
    label: string;
    icon: string | null;
    href: string | null;
    parent_id: string | null;
    permission_code: string | null;
  }

  /** Node of the permission tree that mirrors the sidebar structure. */
  interface MenuNode {
    id: string;
    label: string;
    icon: string | null;
    href: string | null;
    permission_code: string | null;
    children: MenuNode[];
    /** Permission codes rendered at this node (its resource's full code list). */
    codes: string[];
    /** True when its resource was already rendered at the parent (e.g. Reports under Laporan). */
    inherited: boolean;
  }

  interface RoleRow {
    id: string;
    name: string;
    users_count?: number;
    permissions_count?: number;
  }

  let roles = $state<RoleRow[]>([]);
  let selectedRoleId = $state<string | null>(null);
  let selectedRoleName = $state('');
  let selectedCodes = $state<Set<string>>(new Set());
  let initialCodes = $state<Set<string>>(new Set());
  let loadingRoles = $state(true);
  let loadingPerms = $state(false);
  let saving = $state(false);

  // Create modal state
  let showCreate = $state(false);
  let newName = $state('');
  let cloneFrom = $state('');
  let creating = $state(false);

  // Rename modal state
  let showRename = $state(false);
  let renameValue = $state('');

  // Catalog from the backend (single source for grouping and labels)
  let resources = $state<Record<string, string[]>>({});
  let labels = $state<Record<string, string>>({});
  let resourceOrder = $state<string[]>([]);
  /** Active sidebar menus from the backend (source for the permission tree). */
  let menusList = $state<MenuRow[]>([]);
  /** Tree mirroring the sidebar: Master Data -> Products -> product.* codes. */
  let menuTree = $state<MenuNode[]>([]);
  /** Catalog resources not tied to any menu (e.g. Category when no menu uses it). */
  let extraGroups = $state<{ key: string; title: string; codes: string[] }[]>([]);

  const RESOURCE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    product: 'Product',
    category: 'Category',
    inventory: 'Inventory',
    sales: 'Sales',
    customer: 'Customer',
    settings: 'Settings',
    user: 'User',
    role: 'Roles',
    menu: 'Menus (Sidebar)',
    report: 'Reports',
    audit: 'Audit Log',
  };

  const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  /** Full code list for a menu's permission: its resource group, or the code itself. */
  function codesForCode(code: string): string[] {
    const res = code.split('.')[0];
    const list = resources[res];
    return list && list.length > 0 ? list : [code];
  }

  /** Build the sidebar-mirrored tree + collect resources not covered by any menu. */
  function rebuildTree(): void {
    const byId = new Map<string, MenuNode>();
    for (const m of menusList) {
      byId.set(m.id, {
        id: m.id,
        label: m.label,
        icon: m.icon,
        href: m.href,
        permission_code: m.permission_code,
        children: [],
        codes: [],
        inherited: false,
      });
    }
    const roots: MenuNode[] = [];
    for (const m of menusList) {
      const node = byId.get(m.id);
      if (!node) continue;
      const parent = m.parent_id ? byId.get(m.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const rendered = new Set<string>();
    // Pass 1: page nodes (with href) or childless nodes claim their resource first,
    // so codes render at the actual page (Products), not its group header.
    const claim = (node: MenuNode): void => {
      if (node.permission_code) {
        const res = node.permission_code.split('.')[0];
        if (rendered.has(res)) {
          node.inherited = true;
        } else if (node.href || node.children.length === 0) {
          node.codes = codesForCode(node.permission_code);
          rendered.add(res);
        }
      }
      node.children.forEach(claim);
    };
    roots.forEach(claim);
    // Pass 2: any remaining unclaimed resource renders at its node (e.g. a
    // permission-less-link group whose children use other resources).
    const claimLeftover = (node: MenuNode): void => {
      if (node.permission_code && !node.inherited && node.codes.length === 0) {
        const res = node.permission_code.split('.')[0];
        if (!rendered.has(res)) {
          node.codes = codesForCode(node.permission_code);
          rendered.add(res);
        }
      }
      node.children.forEach(claimLeftover);
    };
    roots.forEach(claimLeftover);

    menuTree = roots;
    extraGroups = resourceOrder
      .filter((r) => !rendered.has(r))
      .map((r) => ({ key: r, title: RESOURCE_TITLES[r] ?? titleCase(r), codes: resources[r] ?? [] }));
  }

  const isOwner = $derived(selectedRoleName === 'owner');
  // The permission matrix is saved via PUT /permissions/role/:roleId, which the
  // backend gates with user.manage — so editing must require exactly that.
  const canEditPerms = $derived(!isOwner && !saving && !loadingPerms && $permissions.permissions.has('user.manage'));
  const dirty = $derived(
    selectedCodes.size !== initialCodes.size || [...selectedCodes].some((c) => !initialCodes.has(c)),
  );

  async function loadRoles(keepSelection = true) {
    const res = await get<RoleRow[]>('/roles');
    roles = res.data;
    if (!keepSelection || !selectedRoleId) {
      if (roles.length > 0) await selectRole(roles[0].id);
    } else if (!roles.some((r) => r.id === selectedRoleId)) {
      // selected role was deleted
      if (roles.length > 0) await selectRole(roles[0].id);
      else {
        selectedRoleId = null;
        selectedRoleName = '';
      }
    }
  }

  onMount(async () => {
    try {
      const [catalogRes] = await Promise.all([
        get<{ resources: Record<string, string[]>; labels: Record<string, string>; menus?: MenuRow[] }>('/permissions'),
        loadRoles(false).catch((e) => toastError((e as Error).message)),
      ]);
      resources = catalogRes.data.resources;
      labels = catalogRes.data.labels;
      menusList = catalogRes.data.menus ?? [];
      resourceOrder = Object.keys(catalogRes.data.resources);
      rebuildTree();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loadingRoles = false;
    }
  });

  async function selectRole(id: string) {
    if (dirty) {
      const proceed = confirm('Perubahan permission belum disimpan. Tetap pindah role?');
      if (!proceed) return;
    }
    selectedRoleId = id;
    loadingPerms = true;
    try {
      const res = await get<{ role: RoleRow; codes: string[] }>(`/permissions/role/${id}`);
      selectedRoleName = res.data.role.name;
      selectedCodes = new Set(res.data.codes);
      initialCodes = new Set(res.data.codes);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loadingPerms = false;
    }
  }

  async function createRole() {
    const name = newName.trim();
    if (!name) return;
    creating = true;
    try {
      const res = await post<{ id: string; name: string }>('/roles', {
        name,
        ...(cloneFrom ? { clone_from_role_id: cloneFrom } : {}),
      });
      toastSuccess(`Role "${res.data.name}" dibuat`);
      showCreate = false;
      newName = '';
      cloneFrom = '';
      await loadRoles();
      await selectRole(res.data.id);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      creating = false;
    }
  }

  function openRename(role: RoleRow) {
    showRename = true;
    renameValue = role.name;
  }

  async function renameRole() {
    if (!selectedRoleId) return;
    const name = renameValue.trim();
    if (!name || name === selectedRoleName) {
      showRename = false;
      return;
    }
    try {
      const res = await patch<{ id: string; name: string }>(`/roles/${selectedRoleId}`, { name });
      toastSuccess(`Role diubah menjadi "${res.data.name}"`);
      showRename = false;
      selectedRoleName = res.data.name;
      await loadRoles();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function deleteRole() {
    if (!selectedRoleId || !selectedRoleName) return;
    if (!confirm(`Hapus role "${selectedRoleName}" beserta seluruh permission-nya?`)) return;
    try {
      await del(`/roles/${selectedRoleId}`);
      toastSuccess(`Role "${selectedRoleName}" dihapus`);
      selectedRoleId = null;
      selectedRoleName = '';
      selectedCodes = new Set();
      initialCodes = new Set();
      await loadRoles(false);
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  function toggle(code: string, checked: boolean) {
    if (!canEditPerms) return;
    const next = new Set(selectedCodes);
    if (checked) next.add(code);
    else next.delete(code);
    selectedCodes = next;
  }

  /** Select/unselect a whole code list (menu node, sub-menu, or extra resource). */
  function toggleCodes(codes: string[], checked: boolean) {
    if (!canEditPerms) return;
    const next = new Set(selectedCodes);
    for (const code of codes) {
      if (checked) next.add(code);
      else next.delete(code);
    }
    selectedCodes = next;
  }

  function isAllSelected(codes: string[]): boolean {
    return codes.length > 0 && codes.every((c) => selectedCodes.has(c));
  }

  async function save() {
    if (!selectedRoleId || !canEditPerms) return;
    saving = true;
    try {
      const res = await put<{ role: RoleRow; codes: string[] }>(`/permissions/role/${selectedRoleId}`, {
        codes: [...selectedCodes],
      });
      initialCodes = new Set(res.data.codes);
      toastSuccess(`Permission untuk ${selectedRoleName} tersimpan`);
      await loadRoles();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Role &amp; Permission</h1>
    <div style="display:flex;gap:.5rem">
      {#if selectedRoleId && canEditPerms}
        <button onclick={save} disabled={!dirty}><Icon icon="mdi:content-save-outline" width="15" height="15" /> {saving ? 'Menyimpan…' : 'Simpan Permission'}</button>
      {/if}
      {#if selectedRoleId && $permissions.permissions.has('role.delete')}
        <button class="danger" onclick={deleteRole}><Icon icon="mdi:trash-can-outline" width="15" height="15" /> Hapus Role</button>
      {/if}
      {#if $permissions.permissions.has('role.create')}
        <button class="primary" onclick={() => (showCreate = true)}><Icon icon="mdi:plus" width="16" height="16" /> Role Baru</button>
      {/if}
    </div>
  </div>

  <div class="layout">
    <!-- Left: dynamic role list -->
    <div class="card roles" style="padding:0">
      {#if loadingRoles}
        <div class="space-y-2 p-3" aria-busy="true">
          {#each Array(3) as _, i (i)}
            <Skeleton height="2.4rem" radius="0.5rem" />
          {/each}
        </div>
      {:else}
        {#each roles as role (role.id)}
          <div class="role-item" class:active={role.id === selectedRoleId}>
            <button class="role-select" onclick={() => selectRole(role.id)} title="Pilih role">
              <span class="badge {role.name === 'owner' ? 'green' : role.name === 'manager' ? 'amber' : 'gray'}">
                {role.name}
              </span>
              <span class="muted small">{role.permissions_count ?? 0} perm · {role.users_count ?? 0} user</span>
              {#if role.id === selectedRoleId && dirty}<span class="dirty-dot">•</span>{/if}
            </button>
            {#if role.name !== 'owner' && $permissions.permissions.has('role.update')}
              <button class="icon" title="Rename role" aria-label="Rename role" onclick={() => openRename(role)}><Icon icon="mdi:pencil" width="15" height="15" /></button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Right: permission matrix -->
    <div class="perms">
      {#if !selectedRoleId}
        <p class="muted">Pilih role di kiri, atau buat role baru untuk mengatur permission.</p>
      {:else if loadingPerms}
        <div class="space-y-3" aria-busy="true">
          {#each Array(4) as _, i (i)}
            <Skeleton height="1.6rem" radius="0.4rem" />
          {/each}
        </div>
      {:else}
        <div class="card head-card">
          <div>
            <h2 style="margin:0;text-transform:capitalize">{selectedRoleName}</h2>
            <p class="muted small" style="margin:.2rem 0 0">
              {selectedCodes.size} dari {resourceOrder.reduce((n, r) => n + (resources[r]?.length ?? 0), 0)} permission aktif
            </p>
          </div>
          {#if !isOwner && ($permissions.permissions.has('role.update'))}
            <button onclick={() => openRename({ id: selectedRoleId!, name: selectedRoleName })}>Rename</button>
          {/if}
        </div>        {#if isOwner}
          <p class="muted note">
            <Icon icon="mdi:lock-outline" width="15" height="15" />
            Role <strong>owner</strong> otomatis mendapat semua permission (seed) dan tidak dapat diubah
            atau dihapus untuk mencegah terkunci dari sistem. Struktur di bawah mengikuti menu sidebar.
          </p>
        {:else}
          <p class="muted note">
            <Icon icon="mdi:information-outline" width="15" height="15" />
            Struktur mengikuti <strong>menu sidebar</strong>: grup → halaman → permission-nya.
            Centang <strong>Semua</strong> di level grup untuk mengaktifkan seluruh isinya sekaligus.
          </p>
        {/if}

        {#snippet nodePermRow(code: string)}
          <label class="perm-row" class:disabled={isOwner}>
            <input
              type="checkbox"
              checked={selectedCodes.has(code)}
              disabled={isOwner}
              onchange={(e) => toggle(code, e.currentTarget.checked)}
            />
            <div class="perm-main">
              <span class="mono code">{code}</span>
              <span class="muted small">{labels[code] ?? ''}</span>
            </div>
          </label>
        {/snippet}

        {#each menuTree as node (node.id)}
          {@render menuNode(node, 0)}
        {/each}

        {#snippet menuNode(node: MenuNode, depth: number)}
          <div class="card group node-{depth}">
            <div class="group-head">
              <div class="group-title">
                {#if node.icon && isIconifyName(node.icon)}
                  <Icon icon={node.icon} width="17" height="17" />
                {:else if node.icon}
                  <span>{node.icon}</span>
                {/if}
                <h3>{node.label}</h3>
                {#if node.href}<span class="muted small mono">{node.href}</span>{/if}
              </div>
              {#if node.codes.length > 0}
                <button
                  class="ghost"
                  disabled={isOwner}
                  onclick={() => toggleCodes(node.codes, !isAllSelected(node.codes))}
                >
                  {isAllSelected(node.codes) ? 'Unselect All' : 'Semua'}
                </button>
              {/if}
            </div>

            {#if node.codes.length > 0}
              <div class="code-list">
                {#each node.codes as code (code)}
                  {@render nodePermRow(code)}
                {/each}
              </div>
            {:else if node.inherited}
              <p class="muted small inherited-note">Permission-nya diatur pada menu induk di atas.</p>
            {/if}

            {#if node.children.length > 0}
              <div class="children">
                {#each node.children as child (child.id)}
                  {@render menuNode(child, Math.min(depth + 1, 2))}
                {/each}
              </div>
            {/if}
          </div>
        {/snippet}

        {#each extraGroups as extra (extra.key)}
          <div class="card group">
            <div class="group-head">
              <div class="group-title">
                <h3>{extra.title}</h3>
              </div>
              <button class="ghost" disabled={isOwner} onclick={() => toggleCodes(extra.codes, !isAllSelected(extra.codes))}>
                {isAllSelected(extra.codes) ? 'Unselect All' : 'Semua'}
              </button>
            </div>
            <div class="code-list">
              {#each extra.codes as code (code)}
                {@render nodePermRow(code)}
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<!-- Create role modal -->
{#if showCreate}
  <div class="overlay">
    <div class="modal card">
      <h2>Role Baru</h2>
      <label for="r-name">Nama role *</label>
      <input id="r-name" bind:value={newName} placeholder="contoh: staff-gudang" maxlength={50} />
      <label for="r-clone">Salin permission dari (opsional)</label>
      <select id="r-clone" bind:value={cloneFrom}>
        <option value="">— Tanpa permission (mulai kosong) —</option>
        {#each roles as role (role.id)}
          <option value={role.id}>{role.name} ({role.permissions_count ?? 0} permission)</option>
        {/each}
      </select>
      <div class="actions">
        <button onclick={() => (showCreate = false)}>Batal</button>
        <button class="primary" onclick={createRole} disabled={creating || !newName.trim()}>
          {creating ? 'Membuat…' : 'Buat Role'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Rename modal -->
{#if showRename}
  <div class="overlay">
    <div class="modal card">
      <h2>Rename Role</h2>
      <label for="r-rename">Nama baru *</label>
      <input id="r-rename" bind:value={renameValue} maxlength={50} />
      <div class="actions">
        <button onclick={() => (showRename = false)}>Batal</button>
        <button class="primary" onclick={renameRole} disabled={!renameValue.trim()}>Simpan</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1rem;
    align-items: start;
  }
  .roles {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .role-item {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--border);
  }
  .role-item:last-child {
    border-bottom: none;
  }
  .role-select {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    border: none;
    border-radius: 0;
    background: transparent;
    text-align: left;
    padding: 0.6rem 0.9rem;
    cursor: pointer;
  }
  .role-item:hover .role-select,
  .role-item:hover .icon {
    background: var(--bg-card);
  }
  .role-item.active .role-select,
  .role-item.active .icon {
    background: var(--accent-strong);
    color: #fff;
  }
  .role-item.active .muted {
    color: rgba(255, 255, 255, 0.75);
  }
  .icon {
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 0 0.7rem;
    cursor: pointer;
  }
  .dirty-dot {
    color: var(--amber, orange);
    font-weight: 700;
  }
  .perms {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .head-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 720px;
  }
  .group {
    max-width: 720px;
  }
  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
  }
  .group-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    min-width: 0;
  }
  .group-title :global(svg) {
    color: var(--accent);
    flex-shrink: 0;
  }
  .group-head h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  /* Depth nesting: group > page > (max) — mirrors the sidebar tree. */
  .node-1 {
    margin-left: 1.25rem;
    border-left: 3px solid rgba(79, 140, 255, 0.45);
  }
  .node-2 {
    margin-left: 2.5rem;
    border-left: 3px solid rgba(79, 140, 255, 0.25);
  }
  .children {
    margin-top: 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .code-list {
    display: flex;
    flex-direction: column;
  }
  .perm-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.7rem;
    padding: 0.4rem 0;
    border-bottom: 1px dashed var(--border);
    cursor: pointer;
  }
  .perm-row:last-child {
    border-bottom: none;
  }
  .perm-row.disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  .perm-row input {
    width: 16px;
    height: 16px;
  }
  .perm-main {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .code {
    font-size: 0.85rem;
  }
  .perm-main .small {
    font-size: 0.78rem;
  }
  .inherited-note {
    margin: 0.3rem 0 0;
    font-style: italic;
  }
  .note {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem 0.9rem;
    max-width: 720px;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .note :global(svg) { flex-shrink: 0; color: var(--accent, #2f6fe0); }
  button :global(svg) { flex-shrink: 0; }
  .modal {
    width: min(420px, 100%);
  }
  .modal h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
