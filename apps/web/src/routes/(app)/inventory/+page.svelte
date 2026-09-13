<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, formatDateTime } from '$lib/api';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';

  interface StockRow {
    product_id: string;
    sku: string;
    name: string;
    unit: string;
    minimum_stock: number;
    stock: number;
  }
  interface Movement {
    id: string;
    product_name: string;
    sku: string;
    movement_type: string;
    quantity_in: number;
    quantity_out: number;
    note: string | null;
    created_by_name: string;
    created_at: string;
  }

  let rows = $state<StockRow[]>([]);
  let movements = $state<Movement[]>([]);
  let loading = $state(true);
  let search = $state('');

  let showModal = $state(false);
  let target = $state<StockRow | null>(null);
  let adjType = $state<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'STOCK_OPNAME'>('ADJUSTMENT_IN');
  let qty = $state(1);
  let reason = $state('');
  let saving = $state(false);

  const canAdjust = $derived($permissions.permissions.has('inventory.adjust') || $permissions.permissions.has('inventory.opname'));

  async function load() {
    loading = true;
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const [stock, moves] = await Promise.all([get<StockRow[]>(`/inventory${params}`), get<Movement[]>('/inventory/movements/all?limit=15')]);
      rows = stock.data;
      movements = moves.data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function openAdjust(row: StockRow) {
    target = row;
    adjType = 'ADJUSTMENT_IN';
    qty = 1;
    reason = '';
    showModal = true;
  }

  async function saveAdjustment() {
    if (!target || !reason.trim()) return;
    saving = true;
    try {
      await post('/inventory/adjustments', {
        product_id: target.product_id,
        movement_type: adjType,
        quantity: qty,
        reason: reason.trim(),
      });
      toastSuccess('Adjustment tersimpan');
      showModal = false;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  const typeLabel: Record<string, string> = {
    INITIAL: 'Stok awal',
    PURCHASE: 'Pembelian',
    SALE: 'Penjualan',
    SALE_RETURN: 'Retur',
    ADJUSTMENT_IN: 'Penyesuaian +',
    ADJUSTMENT_OUT: 'Penyesuaian −',
    DAMAGE: 'Rusak',
    STOCK_OPNAME: 'Opname',
  };
</script>

<div class="page">
  <div class="page-header">
    <h1>Inventory</h1>
  </div>

  <div class="toolbar">
    <input placeholder="Cari produk…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
    <button onclick={load}>Cari</button>
  </div>

  {#if loading}
    <p class="muted">Memuat…</p>
  {:else}
    <div class="card" style="padding:0;margin-bottom:1.2rem">
      <table>
        <thead><tr><th>SKU</th><th>Produk</th><th>Stok</th><th>Minimum</th><th>Status</th>{#if canAdjust}<th></th>{/if}</tr></thead>
        <tbody>
          {#each rows as r (r.product_id)}
            <tr>
              <td class="mono">{r.sku}</td>
              <td>{r.name}</td>
              <td><strong>{r.stock}</strong> {r.unit}</td>
              <td>{r.minimum_stock}</td>
              <td>
                <span class="badge {r.stock <= 0 ? 'red' : r.stock <= r.minimum_stock ? 'amber' : 'green'}">
                  {r.stock <= 0 ? 'Habis' : r.stock <= r.minimum_stock ? 'Menipis' : 'OK'}
                </span>
              </td>
              {#if canAdjust}
                <td><button onclick={() => openAdjust(r)}>Adjust</button></td>
              {/if}
            </tr>
          {:else}
            <tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Tidak ada data.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>Riwayat Pergerakan Stok</h3>
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Waktu</th><th>Produk</th><th>Tipe</th><th>In</th><th>Out</th><th>Catatan</th><th>Oleh</th></tr></thead>
        <tbody>
          {#each movements as m (m.id)}
            <tr>
              <td class="muted small">{formatDateTime(m.created_at)}</td>
              <td>{m.product_name}</td>
              <td><span class="badge gray">{typeLabel[m.movement_type] ?? m.movement_type}</span></td>
              <td class="mono">{m.quantity_in > 0 ? `+${m.quantity_in}` : ''}</td>
              <td class="mono">{m.quantity_out > 0 ? `−${m.quantity_out}` : ''}</td>
              <td class="muted">{m.note ?? '—'}</td>
              <td class="muted">{m.created_by_name}</td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted" style="text-align:center;padding:1.5rem">Belum ada pergerakan.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showModal && target}
  <div class="overlay">
    <div class="modal card">
      <h2>Adjust Stok — {target.name}</h2>
      <p class="muted small">Stok saat ini: <strong>{target.stock}</strong> {target.unit}</p>
      <label for="adj-type">Tipe</label>
      <select id="adj-type" bind:value={adjType}>
        <option value="ADJUSTMENT_IN">Tambah stok</option>
        <option value="ADJUSTMENT_OUT">Kurangi stok</option>
        <option value="DAMAGE">Barang rusak</option>
        <option value="STOCK_OPNAME">Stock opname (set stok fisik)</option>
      </select>
      <label for="adj-qty">{adjType === 'STOCK_OPNAME' ? 'Stok fisik hasil hitung' : 'Quantity'}</label>
      <input id="adj-qty" type="number" min="0" bind:value={qty} />
      <label for="adj-reason">Alasan *</label>
      <textarea id="adj-reason" bind:value={reason} rows="2" placeholder="Contoh: barang rusak, selisih opname, koreksi input"></textarea>
      <div class="actions">
        <button onclick={() => (showModal = false)}>Batal</button>
        <button class="primary" onclick={saveAdjustment} disabled={saving || !reason.trim() || qty < 0}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .toolbar input { max-width: 280px; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .modal { width: 420px; }
  .modal h2 { margin: 0 0 0.3rem; font-size: 1.05rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .small { font-size: 0.85rem; }
</style>
