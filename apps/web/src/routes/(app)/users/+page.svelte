<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch } from '$lib/api';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';

  interface UserRow {
    id: string;
    name: string;
    email: string;
    status: string;
    role: string;
  }
  interface RoleOption {
    id: string;
    name: string;
  }

  let users = $state<UserRow[]>([]);
  let roleOptions = $state<RoleOption[]>([]);
  let loading = $state(true);
  let showModal = $state(false);
  let editing = $state<UserRow | null>(null);
  let form = $state({ name: '', email: '', password: '', role: 'cashier', status: 'active' });
  let saving = $state(false);

  // Granular gates: user.view (page), user.create (+ Tambah), user.update (Edit).
  const canCreate = $derived($permissions.permissions.has('user.create'));
  const canUpdate = $derived($permissions.permissions.has('user.update'));

  async function load() {
    loading = true;
    try {
      const [res, rolesRes] = await Promise.all([
        get<UserRow[]>('/users?limit=100'),
        get<RoleOption[]>('/roles'),
      ]);
      users = res.data;
      roleOptions = rolesRes.data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function openCreate() {
    editing = null;
    form = { name: '', email: '', password: '', role: 'cashier', status: 'active' };
    showModal = true;
  }

  function openEdit(u: UserRow) {
    editing = u;
    form = { name: u.name, email: u.email, password: '', role: u.role, status: u.status };
    showModal = true;
  }

  async function save() {
    saving = true;
    try {
      if (editing) {
        const patchBody: Record<string, unknown> = {
          name: form.name,
          role: form.role,
          status: form.status,
        };
        if (form.password) patchBody.password = form.password;
        await patch(`/users/${editing.id}`, patchBody);
        toastSuccess('User diperbarui');
      } else {
        await post('/users', form);
        toastSuccess('User dibuat');
      }
      showModal = false;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Users</h1>
    {#if canCreate}
      <button class="primary" onclick={openCreate}>+ Tambah User</button>
    {/if}
  </div>

  {#if loading}
    <SkeletonTable rows={5} cols={4} />
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {#each users as u (u.id)}
            <tr>
              <td><strong>{u.name}</strong></td>
              <td class="mono">{u.email}</td>
              <td><span class="badge {u.role === 'owner' ? 'green' : u.role === 'manager' ? 'amber' : 'gray'}">{u.role}</span></td>
              <td><span class="badge {u.status === 'active' ? 'green' : 'red'}">{u.status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td>
              <td>{#if canUpdate}<button onclick={() => openEdit(u)}>Edit</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showModal}
  <div class="overlay">
    <div class="modal card">
      <h2>{editing ? 'Edit User' : 'User Baru'}</h2>
      <label for="u-name">Nama *</label>
      <input id="u-name" bind:value={form.name} />
      <label for="u-email">Email *</label>
      <input id="u-email" type="email" bind:value={form.email} disabled={!!editing} />
      <label for="u-pass">Password {editing ? '(kosongkan jika tidak diubah)' : '*'}</label>
      <input id="u-pass" type="password" bind:value={form.password} />
      <label for="u-role">Role</label>
      <select id="u-role" bind:value={form.role}>
        {#each roleOptions as r (r.id)}
          <option value={r.name}>{r.name}</option>
        {/each}
      </select>
      {#if editing}
        <label for="u-status">Status</label>
        <select id="u-status" bind:value={form.status}>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      {/if}
      <div class="actions">
        <button onclick={() => (showModal = false)}>Batal</button>
        <button class="primary" onclick={save}
          disabled={saving || !form.name.trim() || !form.email.trim() || (!editing && form.password.length < 8)}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal { width: min(420px, 100%); }
  .modal h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
