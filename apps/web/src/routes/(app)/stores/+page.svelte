<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, del, formatIDR } from '$lib/api';
  import { permissions } from '$lib/permissions';
  import { currentStoreId } from '$lib/stores/multiStore';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';

  interface StoreRow {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    invoice_prefix: string;
    tax_rate: string;
    active: boolean;
    created_at: string;
  }

  let stores = $state<StoreRow[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editing = $state<StoreRow | null>(null);
  let saving = $state(false);
  let deactivating = $state<string | null>(null);

  // Form fields
  let name = $state('');
  let address = $state('');
  let phone = $state('');
  let invoicePrefix = $state('INV');
  let taxRate = $state('11.00');

  const canCreate = $derived($permissions.permissions.has('store.create'));
  const canUpdate = $derived($permissions.permissions.has('store.update'));
  const canDelete = $derived($permissions.permissions.has('store.delete'));
  const showActions = $derived(canUpdate || canDelete);

  async function load() {
    loading = true;
    try {
      const { data } = await get<StoreRow[]>('/stores');
      stores = data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = null;
    name = '';
    address = '';
    phone = '';
    invoicePrefix = 'INV';
    taxRate = '11.00';
    showForm = true;
  }

  function openEdit(s: StoreRow) {
    editing = s;
    name = s.name;
    address = s.address ?? '';
    phone = s.phone ?? '';
    invoicePrefix = s.invoice_prefix;
    taxRate = s.tax_rate;
    showForm = true;
  }

  async function save() {
    if (saving || !name.trim()) return;
    saving = true;
    try {
      if (editing) {
        await patch(`/stores/${editing.id}`, {
          name: name.trim(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          invoice_prefix: invoicePrefix.trim() || 'INV',
          tax_rate: taxRate,
        });
        toastSuccess('Toko diperbarui');
      } else {
        await post('/stores', {
          name: name.trim(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          invoice_prefix: invoicePrefix.trim() || 'INV',
          tax_rate: taxRate,
        });
        toastSuccess('Toko dibuat');
      }
      showForm = false;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function toggleActive(s: StoreRow) {
    if (deactivating) return;
    deactivating = s.id;
    try {
      if (s.active) {
        await del(`/stores/${s.id}`);
        toastSuccess('Toko dinonaktifkan');
      } else {
        await patch(`/stores/${s.id}`, { active: true });
        toastSuccess('Toko diaktifkan');
      }
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      deactivating = null;
    }
  }

  onMount(load);
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>Toko</h1>
      <p class="muted">Kelola seluruh toko — data tiap toko terpisah (produk, stok, penjualan).</p>
    </div>
    {#if canCreate}
      <button class="primary" onclick={openCreate}>
        <Icon icon="mdi:plus" width="17" height="17" /> Toko Baru
      </button>
    {/if}
  </div>

  {#if loading}
    <SkeletonTable rows={4} cols={5} />
  {:else}
    <div class="card table-card">
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Alamat</th>
            <th>Telepon</th>
            <th>Prefix</th>
            <th>Status</th>
            {#if showActions}<th class="right">Aksi</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each stores as s (s.id)}
            <tr class:same-store={s.id === $currentStoreId} class:inactive={!s.active}>
              <td>
                <div class="store-name">
                  {s.name}
                  {#if s.id === $currentStoreId}
                    <span class="chip-active"><Icon icon="mdi:check-decagram" width="13" height="13" /> aktif</span>
                  {/if}
                </div>
              </td>
              <td class="muted">{s.address ?? '—'}</td>
              <td class="muted">{s.phone ?? '—'}</td>
              <td class="mono">{s.invoice_prefix}</td>
              <td>
                <span class="chip" class:on={s.active}>{s.active ? 'Aktif' : 'Nonaktif'}</span>
              </td>
              {#if showActions}
                <td class="right actions-cell">
                  {#if canUpdate}
                    <button class="small" onclick={() => openEdit(s)} disabled={deactivating === s.id}>Edit</button>
                  {/if}
                  {#if canDelete || canUpdate}
                    <button
                      class="small"
                      class:danger={s.active}
                      onclick={() => toggleActive(s)}
                      disabled={deactivating === s.id || s.id === $currentStoreId}
                      title={s.id === $currentStoreId ? 'Toko aktif di sesi ini' : ''}
                    >
                      {deactivating === s.id ? '…' : s.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showForm}
  <div class="overlay" role="dialog">
    <div class="modal card">
      <h2>{editing ? 'Edit Toko' : 'Toko Baru'}</h2>
      <label for="s-name">Nama Toko</label>
      <input id="s-name" bind:value={name} placeholder="cth: Toko Cabang Bekasi" />
      <label for="s-addr">Alamat</label>
      <input id="s-addr" bind:value={address} placeholder="Alamat lengkap" />
      <label for="s-phone">Telepon</label>
      <input id="s-phone" bind:value={phone} placeholder="cth: 021-555-0123" />
      <div class="two-col">
        <div>
          <label for="s-prefix">Prefix Invoice</label>
          <input id="s-prefix" bind:value={invoicePrefix} placeholder="INV" />
        </div>
        <div>
          <label for="s-tax">Pajak (%)</label>
          <input id="s-tax" type="number" step="0.01" min="0" max="100" bind:value={taxRate} />
        </div>
      </div>
      <div class="actions">
        <button onclick={() => (showForm = false)}>Batal</button>
        <button class="primary" onclick={save} disabled={saving || !name.trim()}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page {
    padding: 1.4rem;
  }
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  h1 {
    margin: 0 0 0.2rem;
    font-size: 1.3rem;
  }
  .table-card {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid var(--border);
  }
  th.right,
  td.right {
    text-align: right;
  }
  tbody tr:hover {
    background: var(--bg-soft);
  }
  tr.inactive td {
    opacity: 0.55;
  }
  .store-name {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
  }
  .chip-active {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--green);
    border: 1px solid var(--green);
    border-radius: 999px;
    padding: 0.05rem 0.45rem;
  }
  .chip {
    font-size: 0.72rem;
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .chip.on {
    color: var(--green);
    border-color: var(--green);
  }
  .actions-cell {
    white-space: nowrap;
  }
  .actions-cell button {
    margin-left: 0.35rem;
  }
  .small {
    font-size: 0.78rem;
    padding: 0.25rem 0.55rem;
  }
  .modal {
    width: min(440px, 100%);
  }
  .modal h2 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  @media (max-width: 720px) {
    .page-header {
      flex-direction: column;
    }
  }
</style>
