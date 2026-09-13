<script lang="ts">
  import { get, formatIDR } from '$lib/api';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastError } from '$lib/stores/toast';

  type Tab = 'sales' | 'products' | 'payments' | 'stock' | 'cashiers';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'Penjualan' },
    { id: 'products', label: 'Produk' },
    { id: 'payments', label: 'Pembayaran' },
    { id: 'stock', label: 'Stok' },
    { id: 'cashiers', label: 'Kasir' },
  ];

  let tab = $state<Tab>('sales');
  let from = $state('');
  let to = $state('');
  let loading = $state(false);

  interface SalesReport {
    total_transactions: number;
    gross_sales: string;
    discount: string;
    tax: string;
    net_sales: string;
  }
  interface ProductReport {
    product_name: string;
    sku: string | null;
    quantity_sold: number;
    revenue: string;
    discount: string;
    net_revenue: string;
  }
  interface PaymentReport {
    method: string;
    total: string;
    transactions: number;
  }
  interface StockReport {
    product_id: string;
    sku: string;
    name: string;
    stock: number;
    minimum_stock: number;
    stock_status: string;
  }
  interface CashierReport {
    cashier_name: string;
    transactions: number;
    total_sales: string;
    avg_transaction: string;
  }

  let sales = $state<SalesReport | null>(null);
  let products = $state<ProductReport[]>([]);
  let payments = $state<PaymentReport[]>([]);
  let stock = $state<StockReport[]>([]);
  let cashiers = $state<CashierReport[]>([]);

  const qs = () => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  async function load() {
    loading = true;
    try {
      if (tab === 'sales') sales = (await get<SalesReport>(`/reports/sales${qs()}`)).data;
      else if (tab === 'products') products = (await get<ProductReport[]>(`/reports/products${qs()}`)).data;
      else if (tab === 'payments') payments = (await get<PaymentReport[]>(`/reports/payments${qs()}`)).data;
      else if (tab === 'stock') stock = (await get<StockReport[]>(`/reports/stock${qs()}`)).data;
      else if (tab === 'cashiers') cashiers = (await get<CashierReport[]>(`/reports/cashiers${qs()}`)).data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  const stockBadge: Record<string, string> = { OK: 'green', LOW: 'amber', OUT_OF_STOCK: 'red' };
  const methodLabel: Record<string, string> = { CASH: 'Tunai', TRANSFER: 'Transfer', CARD: 'Kartu', QRIS: 'QRIS' };
</script>

<div class="page">
  <div class="page-header">
    <h1>Reports</h1>
    <div class="daterange">
      <input type="date" bind:value={from} />
      <span class="muted">s/d</span>
      <input type="date" bind:value={to} />
      <button class="primary" onclick={load}>Tampilkan</button>
    </div>
  </div>

  <div class="toolbar">
    {#each tabs as t (t.id)}
      <button class:primary={tab === t.id} onclick={() => { tab = t.id; load(); }}>{t.label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="cards" aria-busy="true">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if tab === 'sales' && sales}
    <div class="cards">
      <div class="card"><div class="muted small">Transaksi</div><div class="big">{sales.total_transactions}</div></div>
      <div class="card"><div class="muted small">Penjualan Kotor</div><div class="big">{formatIDR(sales.gross_sales)}</div></div>
      <div class="card"><div class="muted small">Diskon</div><div class="big">{formatIDR(sales.discount)}</div></div>
      <div class="card"><div class="muted small">Pajak</div><div class="big">{formatIDR(sales.tax)}</div></div>
      <div class="card"><div class="muted small">Penjualan Bersih</div><div class="big">{formatIDR(sales.net_sales)}</div></div>
    </div>
  {:else if tab === 'products'}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Produk</th><th>SKU</th><th>Qty Terjual</th><th>Pendapatan</th><th>Diskon</th><th>Net</th></tr></thead>
        <tbody>
          {#each products as p (p.sku ?? p.product_name)}
            <tr>
              <td>{p.product_name}</td>
              <td class="mono">{p.sku ?? '—'}</td>
              <td>{p.quantity_sold}</td>
              <td>{formatIDR(p.revenue)}</td>
              <td>{formatIDR(p.discount)}</td>
              <td><strong>{formatIDR(p.net_revenue)}</strong></td>
            </tr>
          {:else}
            <tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Belum ada data.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if tab === 'payments'}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Metode</th><th>Jumlah Transaksi</th><th>Total</th></tr></thead>
        <tbody>
          {#each payments as p (p.method)}
            <tr>
              <td><strong>{methodLabel[p.method] ?? p.method}</strong></td>
              <td>{p.transactions}</td>
              <td>{formatIDR(p.total)}</td>
            </tr>
          {:else}
            <tr><td colspan="3" class="muted" style="text-align:center;padding:2rem">Belum ada data.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if tab === 'stock'}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>SKU</th><th>Produk</th><th>Stok</th><th>Minimum</th><th>Status</th></tr></thead>
        <tbody>
          {#each stock as s (s.product_id)}
            <tr>
              <td class="mono">{s.sku}</td>
              <td>{s.name}</td>
              <td>{s.stock}</td>
              <td>{s.minimum_stock}</td>
              <td><span class="badge {stockBadge[s.stock_status] ?? 'gray'}">
                {s.stock_status === 'OK' ? 'Aman' : s.stock_status === 'LOW' ? 'Menipis' : 'Habis'}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if tab === 'cashiers'}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Kasir</th><th>Transaksi</th><th>Total</th><th>Rata-rata</th></tr></thead>
        <tbody>
          {#each cashiers as c (c.cashier_name)}
            <tr>
              <td><strong>{c.cashier_name}</strong></td>
              <td>{c.transactions}</td>
              <td>{formatIDR(c.total_sales)}</td>
              <td>{formatIDR(c.avg_transaction)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="muted" style="text-align:center;padding:2rem">Belum ada data.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .daterange {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .daterange input {
    width: 150px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.8rem;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 700;
    margin-top: 0.2rem;
  }
  .small {
    font-size: 0.82rem;
  }
</style>
