<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get, patch } from '$lib/api';
  import { formatIDR } from '$lib/api';
  import { toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';

  interface KitchenItem {
    id: string;
    product_name: string;
    quantity: number;
    notes: string | null;
    kitchen_status: 'SENT' | 'PREPARING' | 'READY';
    sent_at: string | null;
    ready_at: string | null;
  }
  type KitchenState = 'COOKING' | 'ALL_SERVED' | 'IDLE';
  interface KitchenTicket {
    order_id: string;
    table_code: string;
    guests: number;
    opened_at: string;
    paid: boolean;
    kitchen_state: KitchenState;
    subtotal: string;
    items_total: number;
    served_count: number;
    queued_count: number;
    active_count: number;
    elapsed_seconds: number;
    items: KitchenItem[];
  }

  type Tab = 'dapur' | 'belum' | 'bayar';
  let tab = $state<Tab>('dapur');
  let tickets = $state<KitchenTicket[]>([]);
  let loading = $state(true);
  let busyId = $state<string | null>(null);
  let now = $state(Date.now());
  let lastLoad = $state(Date.now());

  /** Live elapsed: server value at load + time since the last refresh. */
  function liveElapsed(t: KitchenTicket): number {
    return t.elapsed_seconds + Math.floor((now - lastLoad) / 1000);
  }

  const STATUS_LABEL: Record<KitchenItem['kitchen_status'], string> = {
    SENT: 'Baru',
    PREPARING: 'Dimasak',
    READY: 'Siap',
  };

  function fmtElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function load(silent = false) {
    if (!silent) loading = true;
    try {
      const { data } = await get<KitchenTicket[]>('/resto/kitchen');
      tickets = data;
      lastLoad = Date.now();
    } catch (e) {
      if (!silent) toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  async function advance(item: KitchenItem) {
    if (busyId) return;
    busyId = item.id;
    try {
      await patch(`/resto/kitchen/items/${item.id}`, {});
      await load(true);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busyId = null;
    }
  }

  // Live board: poll + elapsed-time ticker.
  let poll: ReturnType<typeof setInterval> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    void load();
    poll = setInterval(() => void load(true), 10_000);
    ticker = setInterval(() => (now = Date.now()), 1_000);
  });
  onDestroy(() => {
    clearInterval(poll);
    clearInterval(ticker);
  });

  // ---- Tab filtering (bill never disappears until it is settled/cancelled) ----
  const dapurTickets = $derived(tickets.filter((t) => t.kitchen_state === 'COOKING'));
  const unpaidTickets = $derived(tickets.filter((t) => !t.paid && t.items_total > 0 && t.kitchen_state !== 'COOKING'));
  const paidTickets = $derived(tickets.filter((t) => t.paid));
  const shown = $derived(tab === 'dapur' ? dapurTickets : tab === 'belum' ? unpaidTickets : paidTickets);
  const activeItemCount = $derived(tickets.reduce((a, t) => a + t.active_count, 0));

  const EMPTY_MSG: Record<Tab, { title: string; sub: string }> = {
    dapur: { title: 'Tidak ada orderan di dapur', sub: 'Item yang dikirim dari POS Resto muncul di sini.' },
    belum: { title: 'Tidak ada bill menunggu pembayaran', sub: 'Bill yang semua itemnya sudah diantar tapi belum dibayar muncul di sini.' },
    bayar: { title: 'Belum ada bill yang dibayar', sub: 'Bill yang sudah di-settle kasir tetap tampil di sini sampai meja dibuka lagi.' },
  };
</script>

<div class="kds">
  <div class="kds-header">
    <h1><Icon icon="mdi:chef-hat" width="22" height="22" /> Kitchen Display</h1>
    <div class="kds-meta">
      <span class="badge blue">{activeItemCount} item dimasak</span>
      <span class="muted small">Auto-refresh 10 detik</span>
      <button onclick={() => void load()} aria-label="Refresh"><Icon icon="mdi:refresh" width="16" height="16" /></button>
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button class="tab" class:active={tab === 'dapur'} role="tab" aria-selected={tab === 'dapur'} onclick={() => (tab = 'dapur')}>
      Dapur
      <span class="count">{dapurTickets.length}</span>
    </button>
    <button class="tab" class:active={tab === 'belum'} role="tab" aria-selected={tab === 'belum'} onclick={() => (tab = 'belum')}>
      Belum Bayar
      <span class="count amber">{unpaidTickets.length}</span>
    </button>
    <button class="tab" class:active={tab === 'bayar'} role="tab" aria-selected={tab === 'bayar'} onclick={() => (tab = 'bayar')}>
      Sudah Bayar
      <span class="count green">{paidTickets.length}</span>
    </button>
  </div>

  {#if loading}
    <div class="board">
      {#each Array(3) as _, i (i)}
        <SkeletonCard lines={4} />
      {/each}
    </div>
  {:else if shown.length === 0}
    <div class="empty card">
      <Icon icon="mdi:silverware-clean" width="34" height="34" />
      <p>{EMPTY_MSG[tab].title}</p>
      <p class="muted small">{EMPTY_MSG[tab].sub}</p>
    </div>
  {:else}
    <div class="board">
      {#each shown as t (t.order_id)}
        <div
          class="ticket card"
          class:ready={t.kitchen_state === 'ALL_SERVED' && !t.paid}
          class:paid={t.paid}
        >
          <div class="tk-head">
            <span class="tk-table">{t.table_code}</span>
            {#if t.paid}
              <span class="badge green">LUNAS</span>
            {:else if t.kitchen_state === 'ALL_SERVED'}
              <span class="badge amber">Menunggu bayar</span>
            {:else}
              <span class="tk-elapsed" class:late={liveElapsed(t) > 600}>{fmtElapsed(Math.max(0, liveElapsed(t)))}</span>
            {/if}
          </div>
          <div class="tk-sub muted small">{t.guests} tamu · {t.items_total} item</div>

          {#if t.kitchen_state === 'COOKING'}
            <ul class="tk-items">
              {#each t.items as item (item.id)}
                <li>
                  <div class="tk-info">
                    <span class="tk-qty">{item.quantity}×</span>
                    <span class="tk-name">{item.product_name}</span>
                    {#if item.notes}<span class="tk-note">“{item.notes}”</span>{/if}
                    <span class="badge {item.kitchen_status === 'READY' ? 'green' : item.kitchen_status === 'PREPARING' ? 'amber' : 'blue'} small-badge">
                      {STATUS_LABEL[item.kitchen_status]}
                    </span>
                  </div>
                  <button class="primary tk-btn" disabled={busyId === item.id} onclick={() => void advance(item)}>
                    {item.kitchen_status === 'SENT' ? 'Mulai' : item.kitchen_status === 'PREPARING' ? 'Selesai' : 'Diantar'}
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="tk-summary" class:ok={t.paid}>
              {#if t.paid}
                <Icon icon="mdi:check-decagram" width="15" height="15" /> Bill dibayar — total {formatIDR(t.subtotal)}
              {:else}
                <Icon icon="mdi:clock-outline" width="15" height="15" /> Semua item sudah diantar. Total {formatIDR(t.subtotal)} — menunggu pembayaran di kasir.
              {/if}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kds {
    padding: 1.2rem 1.4rem;
    min-height: 100dvh;
  }
  .kds-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.8rem;
  }
  .kds-header h1 {
    margin: 0;
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .kds-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    font-weight: 600;
    color: var(--text-dim);
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .count {
    font-size: 0.72rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--surface-2, rgba(128, 128, 128, 0.15));
  }
  .count.amber {
    background: var(--amber);
    color: #1a1a1a;
  }
  .count.green {
    background: var(--green);
    color: #fff;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.8rem;
    align-items: start;
  }
  .ticket {
    padding: 0.8rem;
    border-left: 4px solid var(--accent);
  }
  .ticket.ready {
    border-left-color: var(--amber);
  }
  .ticket.paid {
    border-left-color: var(--green);
    opacity: 0.85;
  }
  .tk-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tk-table {
    font-weight: 800;
    font-size: 1.15rem;
  }
  .tk-elapsed {
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .tk-elapsed.late {
    color: var(--red);
    font-weight: 700;
  }
  .tk-sub {
    margin: 0.1rem 0 0.5rem;
  }
  .tk-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .tk-items li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    background: var(--surface-2, transparent);
  }
  .tk-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 0;
  }
  .tk-qty {
    font-weight: 800;
    color: var(--accent);
  }
  .tk-name {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .tk-note {
    color: var(--amber);
    font-size: 0.75rem;
    font-style: italic;
  }
  .small-badge {
    font-size: 0.62rem;
    padding: 0.05rem 0.35rem;
  }
  .tk-btn {
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    flex-shrink: 0;
  }
  .tk-summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--amber);
  }
  .tk-summary.ok {
    color: var(--green);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 2.5rem 1rem;
    color: var(--text-dim);
  }
  @media (max-width: 640px) {
    .board {
      grid-template-columns: 1fr;
    }
  }
</style>
