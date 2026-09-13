<script lang="ts">
  import { onMount } from 'svelte';
  import { get, formatIDR } from '$lib/api';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';
  import { toastError } from '$lib/stores/toast';

  interface Dashboard {
    summary: { sales_today: string; transactions: number; avg_transaction: string; gross: string; discount: string; tax: string; net: string };
    low_stock: { id: string; name: string; sku: string; stock: number; minimum_stock: number }[];
    top_products: { product_name: string; quantity: number; revenue: string }[];
    trend: { date: string; total: string; transactions: number }[];
  }

  let data = $state<Dashboard | null>(null);
  let loading = $state(true);
  let range = $state<'today' | 'week' | 'month' | 'all'>('today');

  const rangeStart = (): string => {
    const d = new Date();
    if (range === 'today') return d.toISOString().slice(0, 10);
    if (range === 'week') {
      const week = new Date(d);
      week.setDate(d.getDate() - 6);
      return week.toISOString().slice(0, 10);
    }
    if (range === 'month') return d.toISOString().slice(0, 7) + '-01';
    return '';
  };

  async function load() {
    loading = true;
    try {
      const from = rangeStart();
      const res = await get<Dashboard>(`/reports/dashboard${from ? `?from=${from}` : ''}`);
      data = res.data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    range;
    load();
  });

  const maxTrend = $derived(Math.max(1, ...(data?.trend ?? []).map((t) => Number(t.total))));
</script>

<div class="page">
  <div class="page-header">
    <h1>Dashboard</h1>
    <div class="toolbar" style="margin-bottom:0">
      {#each [['today', 'Hari ini'], ['week', '7 hari'], ['month', 'Bulan ini'], ['all', 'Semua']] as [value, label]}
        <button class:primary={range === value} onclick={() => (range = value as typeof range)}>{label}</button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="cards" aria-busy="true">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if data}
    <div class="cards">
      <div class="card"><div class="muted small">Penjualan</div><div class="big">{formatIDR(data.summary.net)}</div></div>
      <div class="card"><div class="muted small">Transaksi</div><div class="big">{data.summary.transactions}</div></div>
      <div class="card"><div class="muted small">Rata-rata</div><div class="big">{formatIDR(data.summary.avg_transaction)}</div></div>
      <div class="card"><div class="muted small">Diskon</div><div class="big">{formatIDR(data.summary.discount)}</div></div>
      <div class="card"><div class="muted small">Pajak</div><div class="big">{formatIDR(data.summary.tax)}</div></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Tren Penjualan</h3>
        {#if data.trend.length === 0}
          <p class="muted">Belum ada transaksi.</p>
        {:else}
          <div class="trend">
            {#each data.trend as t (t.date)}
              <div class="trend-bar" title="{t.date}: {formatIDR(t.total)}">
                <div class="bar" style="height: {Math.max(4, (Number(t.total) / maxTrend) * 90)}px"></div>
                <div class="muted small">{t.date.slice(5)}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="card">
        <h3>Produk Terlaris</h3>
        {#if data.top_products.length === 0}
          <p class="muted">Belum ada penjualan.</p>
        {:else}
          <table>
            <thead><tr><th>Produk</th><th>Qty</th><th>Pendapatan</th></tr></thead>
            <tbody>
              {#each data.top_products as p (p.product_name)}
                <tr><td>{p.product_name}</td><td>{p.quantity}</td><td>{formatIDR(p.revenue)}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>

    <div class="card">
      <h3>⚠️ Stok Menipis</h3>
      {#if data.low_stock.length === 0}
        <p class="muted">Semua stok aman.</p>
      {:else}
        <table>
          <thead><tr><th>Produk</th><th>SKU</th><th>Stok</th><th>Minimum</th></tr></thead>
          <tbody>
            {#each data.low_stock as p (p.id)}
              <tr>
                <td>{p.name}</td>
                <td class="mono">{p.sku}</td>
                <td><span class="badge {p.stock <= 0 ? 'red' : 'amber'}">{p.stock}</span></td>
                <td>{p.minimum_stock}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }
  .big {
    font-size: 1.35rem;
    font-weight: 700;
    margin-top: 0.2rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
    margin-bottom: 1rem;
  }
  .trend {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 130px;
    padding-top: 0.5rem;
  }
  .trend-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
  }
  .bar {
    width: 100%;
    max-width: 34px;
    background: var(--accent);
    border-radius: 4px 4px 0 0;
  }
  h3 {
    margin: 0 0 0.6rem;
    font-size: 0.95rem;
  }
  @media (max-width: 800px) {
    .grid2 { grid-template-columns: 1fr; }
  }
</style>
