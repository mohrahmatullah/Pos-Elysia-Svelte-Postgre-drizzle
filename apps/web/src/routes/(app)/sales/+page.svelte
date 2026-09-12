<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, formatIDR, formatDateTime } from '$lib/api';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { getUser } from '$lib/api';

  interface SaleRow {
    id: string;
    invoice_number: string;
    status: string;
    grand_total: string;
    created_at: string;
  }
  interface SaleDetail extends SaleRow {
    subtotal: string;
    discount: string;
    tax: string;
    customer_id: string | null;
    items: {
      id: string;
      product_name: string;
      sku: string | null;
      quantity: number;
      returned_quantity: number;
      unit_price: string;
      subtotal: string;
    }[];
    payments: { method: string; amount: string; reference_number: string | null }[];
  }

  let sales = $state<SaleRow[]>([]);
  let meta = $state<{ page: number; totalPages: number; total: number }>({ page: 1, totalPages: 1, total: 0 });
  let search = $state('');
  let statusFilter = $state('');
  let loading = $state(true);

  let detail = $state<SaleDetail | null>(null);
  let returnQty = $state<Record<string, number>>({});
  let returnReason = $state('');
  let busy = $state(false);

  const canCancelOrReturn = $derived(['owner', 'manager'].includes(getUser()?.role ?? ''));

  const statusBadge: Record<string, string> = {
    completed: 'green',
    cancelled: 'red',
    partially_returned: 'amber',
    returned: 'gray',
  };
  const statusLabel: Record<string, string> = {
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
    partially_returned: 'Retur sebagian',
    returned: 'Diretur',
  };

  async function load(page = 1) {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      const res = await get<SaleRow[]>(`/sales?${params}`);
      sales = res.data;
      meta = res.meta as typeof meta;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(() => load());

  async function openDetail(sale: SaleRow) {
    try {
      const res = await get<SaleDetail>(`/sales/${sale.id}`);
      detail = res.data;
      returnQty = {};
      returnReason = '';
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function cancelSale() {
    if (!detail || !confirm(`Batalkan transaksi ${detail.invoice_number}? Stok akan dikembalikan.`)) return;
    busy = true;
    try {
      await post(`/sales/${detail.id}/cancel`, { reason: 'Dibatalkan via UI' });
      toastSuccess('Transaksi dibatalkan');
      detail = null;
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function submitReturn() {
    if (!detail || !returnReason.trim()) return;
    const items = Object.entries(returnQty)
      .filter(([, q]) => q > 0)
      .map(([sale_item_id, quantity]) => ({ sale_item_id, quantity }));
    if (items.length === 0) {
      toastError('Isi quantity retur minimal 1 item');
      return;
    }
    busy = true;
    try {
      const res = await post<{ refund_amount: string }>(`/sales/${detail.id}/return`, { items, reason: returnReason.trim() });
      toastSuccess(`Retur tersimpan. Refund: ${formatIDR(res.data.refund_amount)}`);
      detail = null;
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Sales</h1>
  </div>

  <div class="toolbar">
    <input placeholder="Cari nomor invoice…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load(1)} />
    <select bind:value={statusFilter} onchange={() => load(1)}>
      <option value="">Semua status</option>
      {#each Object.entries(statusLabel) as [value, label]}
        <option value={value}>{label}</option>
      {/each}
    </select>
    <button onclick={() => load(1)}>Cari</button>
  </div>

  {#if loading}
    <p class="muted">Memuat…</p>
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Invoice</th><th>Waktu</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          {#each sales as s (s.id)}
            <tr onclick={() => openDetail(s)} style="cursor:pointer">
              <td class="mono">{s.invoice_number}</td>
              <td class="muted">{formatDateTime(s.created_at)}</td>
              <td><strong>{formatIDR(s.grand_total)}</strong></td>
              <td><span class="badge {statusBadge[s.status] ?? 'gray'}">{statusLabel[s.status] ?? s.status}</span></td>
            </tr>
          {:else}
            <tr><td colspan="4" class="muted" style="text-align:center;padding:2rem">Belum ada transaksi.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <button disabled={meta.page <= 1} onclick={() => load(meta.page - 1)}>← Sebelumnya</button>
      <span class="muted">Halaman {meta.page} / {meta.totalPages} ({meta.total})</span>
      <button disabled={meta.page >= meta.totalPages} onclick={() => load(meta.page + 1)}>Berikutnya →</button>
    </div>
  {/if}
</div>

{#if detail}
  <div class="overlay">
    <div class="modal card">
      <div class="modal-head">
        <h2 class="mono">{detail.invoice_number}</h2>
        <span class="badge {statusBadge[detail.status] ?? 'gray'}">{statusLabel[detail.status] ?? detail.status}</span>
      </div>
      <p class="muted small">{formatDateTime(detail.created_at)}</p>

      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th>{#if canCancelOrReturn && detail.status === 'completed'}<th>Retur</th>{/if}</tr></thead>
        <tbody>
          {#each detail.items as item (item.id)}
            <tr>
              <td>{item.product_name}<div class="muted small mono">{item.sku}</div></td>
              <td>
                {item.quantity}
                {#if item.returned_quantity > 0}
                  <span class="badge amber small">retur {item.returned_quantity}</span>
                {/if}
              </td>
              <td>{formatIDR(item.unit_price)}</td>
              <td>{formatIDR(item.subtotal)}</td>
              {#if canCancelOrReturn && detail.status === 'completed'}
                <td>
                  {#if item.quantity - item.returned_quantity > 0}
                    <input class="ret-input" type="number" min="0" max={item.quantity - item.returned_quantity}
                      bind:value={returnQty[item.id]} placeholder="0" />
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="sums">
        <div><span class="muted">Subtotal</span><span>{formatIDR(detail.subtotal)}</span></div>
        <div><span class="muted">Diskon</span><span>{formatIDR(detail.discount)}</span></div>
        <div><span class="muted">Pajak</span><span>{formatIDR(detail.tax)}</span></div>
        <div class="grand"><span>Total</span><span>{formatIDR(detail.grand_total)}</span></div>
        {#each detail.payments as p (p.method)}
          <div><span class="muted">Bayar ({p.method})</span><span>{formatIDR(p.amount)}</span></div>
        {/each}
      </div>

      {#if canCancelOrReturn && detail.status === 'completed'}
        <label for="ret-reason">Alasan retur (jika ada)</label>
        <input id="ret-reason" bind:value={returnReason} placeholder="Contoh: barang cacat" />
        <div class="actions">
          <button class="danger" onclick={cancelSale} disabled={busy}>Batalkan Transaksi</button>
          <button class="primary" onclick={submitReturn} disabled={busy || !returnReason.trim()}>Proses Retur</button>
        </div>
      {/if}
      <div class="actions">
        <button onclick={() => (detail = null)}>Tutup</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .toolbar input { max-width: 260px; }
  .toolbar select { max-width: 170px; }
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
    width: 560px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal h2 { margin: 0; font-size: 1.1rem; }
  .small { font-size: 0.8rem; }
  .ret-input { width: 64px; text-align: center; padding: 0.2rem; }
  .sums div {
    display: flex;
    justify-content: space-between;
    padding: 0.15rem 0;
    font-size: 0.9rem;
  }
  .sums .grand {
    font-weight: 700;
    border-top: 1px solid var(--border);
    padding-top: 0.4rem;
    margin-top: 0.3rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }
</style>
