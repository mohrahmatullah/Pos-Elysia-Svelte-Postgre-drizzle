<script lang="ts">
  import { onMount } from 'svelte';
  import { get, formatDateTime } from '$lib/api';
  import { toastError } from '$lib/stores/toast';

  interface AuditRow {
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    metadata: Record<string, unknown> | null;
    ip_address: string | null;
    user_name: string | null;
    created_at: string;
  }

  let rows = $state<AuditRow[]>([]);
  let meta = $state<{ page: number; totalPages: number; total: number }>({ page: 1, totalPages: 1, total: 0 });
  let actionFilter = $state('');
  let loading = $state(true);

  async function load(page = 1) {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      params.set('page', String(page));
      const res = await get<AuditRow[]>(`/audit-logs?${params}`);
      rows = res.data;
      meta = res.meta as typeof meta;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(() => load());

  const actions = [
    '', 'LOGIN', 'LOGOUT', 'CREATE_PRODUCT', 'UPDATE_PRODUCT', 'DEACTIVATE_PRODUCT',
    'CREATE_CATEGORY', 'UPDATE_CATEGORY', 'CREATE_CUSTOMER', 'UPDATE_CUSTOMER',
    'CREATE_SALE', 'CANCEL_SALE', 'CREATE_RETURN', 'STOCK_ADJUSTMENT',
    'CREATE_USER', 'UPDATE_USER', 'UPDATE_SETTINGS',
  ];
</script>

<div class="page">
  <div class="page-header">
    <h1>Audit Log</h1>
  </div>

  <div class="toolbar">
    <select bind:value={actionFilter} onchange={() => load(1)}>
      {#each actions as a (a)}
        <option value={a}>{a || 'Semua aksi'}</option>
      {/each}
    </select>
  </div>

  {#if loading}
    <p class="muted">Memuat…</p>
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Entity</th><th>Detail</th><th>IP</th></tr></thead>
        <tbody>
          {#each rows as r (r.id)}
            <tr>
              <td class="muted small">{formatDateTime(r.created_at)}</td>
              <td>{r.user_name ?? '—'}</td>
              <td><span class="badge gray">{r.action}</span></td>
              <td class="muted">{r.entity_type ?? '—'}</td>
              <td class="mono small">{r.metadata ? JSON.stringify(r.metadata).slice(0, 60) : '—'}</td>
              <td class="muted mono small">{r.ip_address ?? '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Belum ada log.</td></tr>
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

<style>
  .toolbar select { max-width: 220px; }
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.8rem;
  }
  .small { font-size: 0.78rem; }
</style>
