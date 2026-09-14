<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, del, formatIDR } from '$lib/api';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';
  import { Icon } from '$lib/icons';

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
    discount_type: 'PERCENT' | 'NOMINAL';
    discount_value: string;
    available_retail?: boolean;
    available_resto?: boolean;
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
    discount_type: 'PERCENT' | 'NOMINAL';
    discount_value: number;
    available_retail: boolean;
    available_resto: boolean;
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
    discount_type: 'NOMINAL',
    discount_value: 0,
    available_retail: true,
    available_resto: true,
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
      discount_type: p.discount_type ?? 'NOMINAL',
      discount_value: Number.parseFloat(p.discount_value ?? '0'),
      available_retail: p.available_retail ?? true,
      available_resto: p.available_resto ?? true,
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
        discount_type: form.discount_type,
        discount_value: form.discount_value || 0,
        // Channel availability: which POS may sell this product.
        available_retail: form.available_retail,
        available_resto: form.available_resto,
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
      <button class="primary" onclick={openCreate}><Icon icon="mdi:plus" width="16" height="16" /> Tambah Produk</button>
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
    <button onclick={() => load(1)} title="Cari" aria-label="Cari"><Icon icon="mdi:magnify" width="15" height="15" /> Cari</button>
  </div>

  {#if loading}
    <SkeletonTable rows={8} cols={6} />
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
              <td>
                {formatIDR(p.selling_price)}
                {#if Number.parseFloat(p.discount_value) > 0}
                  <span class="badge amber disc-badge" title="Diskon produk">
                    -{p.discount_value}{p.discount_type === 'PERCENT' ? '%' : ''}
                  </span>
                {/if}
                <span class="channel-badges">
                  {#if p.available_retail !== false}<span class="badge gray" title="Tersedia di POS Retail">R</span>{/if}
                  {#if p.available_resto !== false}<span class="badge gray" title="Tersedia di POS Resto">O</span>{/if}
                </span>
              </td>
              <td><span class="badge {p.stock <= 0 ? 'red' : p.stock <= p.minimum_stock ? 'amber' : 'green'}">{p.stock}</span></td>
              <td><span class="badge {p.active ? 'green' : 'gray'}">{p.active ? 'Aktif' : 'Nonaktif'}</span></td>
              {#if canUpdate || canDelete}
                <td style="display:flex;gap:.4rem">
                  {#if canUpdate}<button class="act" title="Edit produk" aria-label="Edit" onclick={() => openEdit(p)}><Icon icon="mdi:pencil" width="15" height="15" /></button>{/if}
                  {#if canDelete && p.active}
                    <button class="danger act" title="Nonaktifkan produk" aria-label="Nonaktifkan" onclick={() => deactivate(p)}><Icon icon="mdi:cancel" width="15" height="15" /></button>
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
        <div>
          <label for="f-dtype">Jenis Diskon Produk</label>
          <select id="f-dtype" bind:value={form.discount_type}>
            <option value="NOMINAL">Nominal (Rp)</option>
            <option value="PERCENT">Persen (%)</option>
          </select>
        </div>
        <div>
          <label for="f-dval">Nilai Diskon {form.discount_type === 'PERCENT' ? '(%)' : '(Rp)'}</label>
          <input id="f-dval" type="number" min="0" max={form.discount_type === 'PERCENT' ? 100 : undefined} bind:value={form.discount_value} />
        </div>
      </div>
      <p class="muted small">Diskon produk otomatis dipakai di POS setiap kali item ini dijual.</p>
      <div class="channel-box">
        <span class="channel-title"><Icon icon="mdi:storefront-outline" width="14" height="14" /> Ketersediaan Channel</span>
        <label class="channel-row" for="f-retail">
          <input id="f-retail" type="checkbox" bind:checked={form.available_retail} />
          <span class="channel-name"><Icon icon="mdi:cart-outline" width="15" height="15" /> Retail</span>
          <span class="muted small">Tampil di POS Kasir (toko retail)</span>
        </label>
        <label class="channel-row" for="f-resto">
          <input id="f-resto" type="checkbox" bind:checked={form.available_resto} />
          <span class="channel-name"><Icon icon="mdi:silverware-fork-knife" width="15" height="15" /> Resto</span>
          <span class="muted small">Tampil di POS Resto (meja &amp; dapur)</span>
        </label>
        {#if !form.available_retail && !form.available_resto}
          <p class="error-text small">Minimal satu channel harus dipilih.</p>
        {/if}
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
        <button class="primary" onclick={save} disabled={saving || !form.sku || !form.name || (!form.available_retail && !form.available_resto)}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .toolbar input { max-width: 280px; }
  .toolbar select { max-width: 180px; }
  .disc-badge { margin-left: 0.35rem; }
  .small { font-size: 0.8rem; }
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.8rem;
  }
  .modal { width: min(460px, 100%); }
  .modal h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .channel-box {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-top: 0.9rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    background: var(--bg-soft, rgba(255, 255, 255, 0.03));
  }
  .channel-title {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
  }
  .channel-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  .channel-row input[type='checkbox'] {
    width: 15px;
    height: 15px;
    accent-color: var(--accent-strong, #2f6fe0);
  }
  .channel-name {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 600;
    font-size: 0.85rem;
    min-width: 70px;
  }
  .channel-row .small {
    font-size: 0.72rem;
  }
  .channel-badges {
    display: inline-flex;
    gap: 0.2rem;
    margin-left: 0.35rem;
  }
  .channel-badges .badge {
    font-size: 0.6rem;
    padding: 0.02rem 0.3rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
