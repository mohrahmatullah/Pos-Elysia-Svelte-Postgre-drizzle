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

  const RESOURCE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    product: 'Product',
    category: 'Category',
    inventory: 'Inventory',
    sales: 'Sales',
    customer: 'Customer',
    settings: 'Settings',
    user: 'User',
    report: 'Reports',
    audit: 'Audit Log',
  };

  const isOwner = $derived(selectedRoleName === 'owner');
  const canEditPerms = $derived(!isOwner && !saving && !loadingPerms);
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
        get<{ resources: Record<string, string[]>; labels: Record<string, string> }>('/permissions'),
        loadRoles(false).catch((e) => toastError((e as Error).message)),
      ]);
      resources = catalogRes.data.resources;
      labels = catalogRes.data.labels;
      resourceOrder = Object.keys(catalogRes.data.resources);
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

  function toggleResource(resource: string, checked: boolean) {
    if (!canEditPerms) return;
    const next = new Set(selectedCodes);
    for (const code of resources[resource] ?? []) {
      if (checked) next.add(code);
      else next.delete(code);
    }
    selectedCodes = next;
  }

  function isResourceAll(resource: string): boolean {
    const codes = resources[resource] ?? [];
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
        <button onclick={save} disabled={!dirty}>{saving ? 'Menyimpan…' : 'Simpan Permission'}</button>
        <button class="danger" onclick={deleteRole}>Hapus Role</button>
      {/if}
      <button class="primary" onclick={() => (showCreate = true)}>+ Role Baru</button>
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
            {#if role.name !== 'owner'}
              <button class="icon" title="Rename role" onclick={() => openRename(role)}>✏️</button>
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
          {#if !isOwner}
            <button onclick={() => openRename({ id: selectedRoleId!, name: selectedRoleName })}>Rename</button>
          {/if}
        </div>
        {#if isOwner}
          <p class="muted note">
            🔒 Role <strong>owner</strong> otomatis mendapat semua permission (seed) dan tidak dapat diubah
            atau dihapus untuk mencegah terkunci dari sistem.
          </p>
        {/if}
        {#each resourceOrder as resource (resource)}
          <div class="card group">
            <div class="group-head">
              <h3>{RESOURCE_TITLES[resource] ?? resource}</h3>
              <button
                class="ghost"
                disabled={isOwner}
                onclick={() => toggleResource(resource, !isResourceAll(resource))}
              >
                {isResourceAll(resource) ? 'Unselect All' : 'Select All'}
              </button>
            </div>
            {#each resources[resource] as code (code)}
              <label class="perm-row" class:disabled={isOwner}>
                <input
                  type="checkbox"
                  checked={selectedCodes.has(code)}
                  disabled={isOwner}
                  onchange={(e) => toggle(code, e.currentTarget.checked)}
                />
                <span class="mono code">{code}</span>
                <span class="muted">{labels[code] ?? ''}</span>
              </label>
            {/each}
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
    margin-bottom: 0.4rem;
  }
  .group-head h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .perm-row {
    display: grid;
    grid-template-columns: auto minmax(140px, auto) 1fr;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0;
    cursor: pointer;
  }
  .perm-row.disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  .perm-row input {
    width: 16px;
    height: 16px;
  }
  .code {
    font-size: 0.85rem;
  }
  .note {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem 0.9rem;
    max-width: 720px;
  }
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
