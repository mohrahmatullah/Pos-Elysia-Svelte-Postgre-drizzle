<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, del, formatIDR } from '$lib/api';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';

  interface Product {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    unit: string;
    category_id: string | null;
    category_name: string | null;
    cost_price: string;
    selling_price: string;
    minimum_stock: number;
    tax_rate: string;
    active: boolean;
    stock: number;
  }
  interface Category {
    id: string;
    name: string;
  }

  interface FormState {
    id?: string;
    sku: string;
    barcode: string;
    name: string;
    category_id: string;
    unit: string;
    cost_price: number;
    selling_price: number;
    minimum_stock: number;
    initial_stock: number;
    active: boolean;
  }

  const emptyForm: FormState = {
    sku: '',
    barcode: '',
    name: '',
    category_id: '',
    unit: 'pcs',
    cost_price: 0,
    selling_price: 0,
    minimum_stock: 0,
    initial_stock: 0,
    active: true,
  };

  let products = $state<Product[]>([]);
  let categories = $state<Category[]>([]);
  let meta = $state<{ page: number; totalPages: number; total: number }>({ page: 1, totalPages: 1, total: 0 });
  let search = $state('');
  let categoryFilter = $state('');
  let statusFilter = $state('');
  let showModal = $state(false);
  let form = $state<FormState>({ ...emptyForm });
  let saving = $state(false);
  let loading = $state(true);

  const canCreate = $derived($permissions.permissions.has('product.create'));
  const canUpdate = $derived($permissions.permissions.has('product.update'));
  const canDelete = $derived($permissions.permissions.has('product.delete'));

  async function load(page = 1) {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category_id', categoryFilter);
      if (statusFilter) params.set('active', statusFilter);
      params.set('page', String(page));
      const res = await get<Product[]>(`/products?${params}`);
      products = res.data;
      meta = res.meta as typeof meta;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      const c = await get<Category[]>('/categories?limit=100');
      categories = c.data;
    } catch { /* non-fatal */ }
    await load();
  });

  function openCreate() {
    form = { ...emptyForm };
    showModal = true;
  }

  function openEdit(p: Product) {
    form = {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode ?? '',
      name: p.name,
      category_id: p.category_id ?? '',
      unit: p.unit,
      cost_price: Number.parseFloat(p.cost_price),
      selling_price: Number.parseFloat(p.selling_price),
      minimum_stock: p.minimum_stock,
      initial_stock: 0,
      active: p.active,
    };
    showModal = true;
  }

  async function save() {
    saving = true;
    try {
      const payload = {
        sku: form.sku,
        barcode: form.barcode || undefined,
        name: form.name,
        category_id: form.category_id || undefined,
        unit: form.unit,
        cost_price: form.cost_price,
        selling_price: form.selling_price,
        minimum_stock: form.minimum_stock,
      };
      if (form.id) {
        await patch(`/products/${form.id}`, { ...payload, active: form.active });
        toastSuccess('Produk diperbarui');
      } else {
        await post('/products', { ...payload, initial_stock: form.initial_stock || undefined });
        toastSuccess('Produk dibuat');
      }
      showModal = false;
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function deactivate(p: Product) {
    if (!confirm(`Nonaktifkan produk ${p.name}?`)) return;
    try {
      await del(`/products/${p.id}`);
      toastSuccess('Produk dinonaktifkan');
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Products</h1>
    {#if canCreate}
      <button class="primary" onclick={openCreate}>+ Tambah Produk</button>
    {/if}
  </div>

  <div class="toolbar">
    <input placeholder="Cari nama / SKU / barcode…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load(1)} />
    <select bind:value={categoryFilter} onchange={() => load(1)}>
      <option value="">Semua kategori</option>
      {#each categories as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
    <select bind:value={statusFilter} onchange={() => load(1)}>
      <option value="">Semua status</option>
      <option value="true">Aktif</option>
      <option value="false">Nonaktif</option>
    </select>
    <button onclick={() => load(1)}>Cari</button>
  </div>

  {#if loading}
    <p class="muted">Memuat…</p>
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead>
          <tr><th>SKU</th><th>Nama</th><th>Kategori</th><th>Harga Jual</th><th>Stok</th><th>Status</th>{#if canUpdate || canDelete}<th></th>{/if}</tr>
        </thead>
        <tbody>
          {#each products as p (p.id)}
            <tr>
              <td class="mono">{p.sku}</td>
              <td>{p.name}</td>
              <td class="muted">{p.category_name ?? '—'}</td>
              <td>{formatIDR(p.selling_price)}</td>
              <td><span class="badge {p.stock <= 0 ? 'red' : p.stock <= p.minimum_stock ? 'amber' : 'green'}">{p.stock}</span></td>
              <td><span class="badge {p.active ? 'green' : 'gray'}">{p.active ? 'Aktif' : 'Nonaktif'}</span></td>
              {#if canUpdate || canDelete}
                <td style="display:flex;gap:.4rem">
                  {#if canUpdate}<button onclick={() => openEdit(p)}>Edit</button>{/if}
                  {#if canDelete && p.active}
                    <button class="danger" onclick={() => deactivate(p)}>Nonaktifkan</button>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr><td colspan="7" class="muted" style="text-align:center;padding:2rem">Tidak ada produk.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <button disabled={meta.page <= 1} onclick={() => load(meta.page - 1)}>← Sebelumnya</button>
      <span class="muted">Halaman {meta.page} / {meta.totalPages} ({meta.total} produk)</span>
      <button disabled={meta.page >= meta.totalPages} onclick={() => load(meta.page + 1)}>Berikutnya →</button>
    </div>
  {/if}
</div>

{#if showModal}
  <div class="overlay">
    <div class="modal card">
      <h2>{form.id ? 'Edit Produk' : 'Produk Baru'}</h2>
      <label for="f-sku">SKU *</label>
      <input id="f-sku" bind:value={form.sku} disabled={!!form.id} placeholder="SKU-001" />
      <label for="f-name">Nama *</label>
      <input id="f-name" bind:value={form.name} />
      <label for="f-barcode">Barcode</label>
      <input id="f-barcode" bind:value={form.barcode} />
      <label for="f-cat">Kategori</label>
      <select id="f-cat" bind:value={form.category_id}>
        <option value="">—</option>
        {#each categories as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div>
          <label for="f-cost">Harga Modal</label>
          <input id="f-cost" type="number" min="0" bind:value={form.cost_price} />
        </div>
        <div>
          <label for="f-price">Harga Jual</label>
          <input id="f-price" type="number" min="0" bind:value={form.selling_price} />
        </div>
        <div>
          <label for="f-min">Stok Minimum</label>
          <input id="f-min" type="number" min="0" bind:value={form.minimum_stock} />
        </div>
        <div>
          <label for="f-unit">Unit</label>
          <input id="f-unit" bind:value={form.unit} />
        </div>
      </div>
      {#if !form.id}
        <label for="f-init">Stok Awal</label>
        <input id="f-init" type="number" min="0" bind:value={form.initial_stock} />
      {:else}
        <label for="f-active">Status</label>
        <select id="f-active" bind:value={form.active}>
          <option value={true}>Aktif</option>
          <option value={false}>Nonaktif</option>
        </select>
      {/if}
      <div class="actions">
        <button onclick={() => (showModal = false)}>Batal</button>
        <button class="primary" onclick={save} disabled={saving || !form.sku || !form.name}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .toolbar input { max-width: 280px; }
  .toolbar select { max-width: 180px; }
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.8rem;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .modal {
    width: 460px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
