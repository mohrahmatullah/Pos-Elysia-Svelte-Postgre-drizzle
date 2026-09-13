<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, formatIDR, formatDateTime } from '$lib/api';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';
  import { permissions } from '$lib/permissions';

  interface Customer {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  }
  interface CustomerDetail extends Customer {
    total_transactions: number;
    total_spent: string;
    history: { id: string; invoice_number: string; grand_total: string; status: string; created_at: string }[];
  }

  let customers = $state<Customer[]>([]);
  let search = $state('');
  let loading = $state(true);
  let showModal = $state(false);
  let editing = $state<Customer | null>(null);
  let form = $state({ name: '', phone: '', email: '', address: '', notes: '' });
  let saving = $state(false);
  let detail = $state<CustomerDetail | null>(null);

  const canCreate = $derived($permissions.permissions.has('customer.create'));
  const canUpdate = $derived($permissions.permissions.has('customer.update'));

  async function load() {
    loading = true;
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await get<Customer[]>(`/customers${params}`);
      customers = res.data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function openCreate() {
    editing = null;
    form = { name: '', phone: '', email: '', address: '', notes: '' };
    showModal = true;
  }

  function openEdit(c: Customer) {
    editing = c;
    form = { name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '' };
    showModal = true;
  }

  async function save() {
    saving = true;
    try {
      if (editing) {
        await patch(`/customers/${editing.id}`, form);
        toastSuccess('Pelanggan diperbarui');
      } else {
        await post('/customers', form);
        toastSuccess('Pelanggan dibuat');
      }
      showModal = false;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function viewHistory(c: Customer) {
    try {
      const res = await get<CustomerDetail>(`/customers/${c.id}`);
      detail = res.data;
    } catch (e) {
      toastError((e as Error).message);
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Customers</h1>
    {#if canCreate}
      <button class="primary" onclick={openCreate}><Icon icon="mdi:plus" width="16" height="16" /> Tambah Pelanggan</button>
    {/if}
  </div>

  <div class="toolbar">
    <input placeholder="Cari nama / telepon / email…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
    <button onclick={load} title="Cari" aria-label="Cari"><Icon icon="mdi:magnify" width="15" height="15" /> Cari</button>
  </div>

  {#if loading}
    <SkeletonTable rows={6} cols={5} />
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Transaksi</th><th></th></tr></thead>
        <tbody>
          {#each customers as c (c.id)}
            <tr>
              <td><strong>{c.name}</strong></td>
              <td class="mono">{c.phone ?? '—'}</td>
              <td class="muted">{c.email ?? '—'}</td>
              <td><button class="link" onclick={() => viewHistory(c)}>Riwayat</button></td>
              <td style="display:flex;gap:.4rem">
                {#if canUpdate}<button class="act" title="Edit pelanggan" aria-label="Edit" onclick={() => openEdit(c)}><Icon icon="mdi:pencil" width="15" height="15" /></button>{/if}
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="muted" style="text-align:center;padding:2rem">Belum ada pelanggan.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showModal}
  <div class="overlay">
    <div class="modal card">
      <h2>{editing ? 'Edit Pelanggan' : 'Pelanggan Baru'}</h2>
      <label for="c-name">Nama *</label>
      <input id="c-name" bind:value={form.name} />
      <label for="c-phone">Telepon</label>
      <input id="c-phone" bind:value={form.phone} />
      <label for="c-email">Email</label>
      <input id="c-email" type="email" bind:value={form.email} />
      <label for="c-addr">Alamat</label>
      <textarea id="c-addr" rows="2" bind:value={form.address}></textarea>
      <label for="c-notes">Catatan</label>
      <textarea id="c-notes" rows="2" bind:value={form.notes}></textarea>
      <div class="actions">
        <button onclick={() => (showModal = false)}>Batal</button>
        <button class="primary" onclick={save} disabled={saving || !form.name.trim()}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if detail}
  <div class="overlay">
    <div class="modal card">
      <h2>{detail.name}</h2>
      <p class="muted">
        {detail.total_transactions} transaksi · Total belanja {formatIDR(detail.total_spent)}
      </p>
      {#if detail.history.length === 0}
        <p class="muted">Belum ada transaksi.</p>
      {:else}
        <table>
          <thead><tr><th>Invoice</th><th>Tanggal</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {#each detail.history as h (h.id)}
              <tr>
                <td class="mono">{h.invoice_number}</td>
                <td class="muted">{formatDateTime(h.created_at)}</td>
                <td>{formatIDR(h.grand_total)}</td>
                <td class="muted">{h.status}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <div class="actions">
        <button onclick={() => (detail = null)}>Tutup</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal { width: min(520px, 100%); }
  .modal h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    text-decoration: underline;
  }
</style>
