<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, del } from '$lib/api';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';

  interface Area { id: string; name: string; sort_order: number }
  interface RestoTable {
    id: string;
    code: string;
    seats: number;
    status: 'FREE' | 'OCCUPIED' | 'RESERVED';
    area_id: string | null;
    order_id: string | null;
    guests: number | null;
  }

  let areas = $state<Area[]>([]);
  let tables = $state<RestoTable[]>([]);
  let loading = $state(true);
  let saving = $state(false);

  // Table form
  let showTableForm = $state(false);
  let tCode = $state('');
  let tSeats = $state(4);
  let tArea = $state<string>('');
  let editingTable = $state<RestoTable | null>(null);

  // Area form
  let showAreaForm = $state(false);
  let aName = $state('');

  const canManage = $derived($permissions.permissions.has('table.manage'));
  import { permissions } from '$lib/permissions';

  async function load() {
    loading = true;
    try {
      const { data } = await get<{ areas: Area[]; tables: RestoTable[] }>('/resto/tables');
      areas = data.areas;
      tables = data.tables;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  async function saveTable() {
    if (saving || !tCode.trim()) return;
    saving = true;
    try {
      const payload = { code: tCode.trim(), seats: tSeats, area_id: tArea || null };
      if (editingTable) {
        await patch(`/resto/tables/${editingTable.id}`, payload);
        toastSuccess('Meja diperbarui');
      } else {
        await post('/resto/tables', payload);
        toastSuccess('Meja dibuat');
      }
      showTableForm = false;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function removeTable(t: RestoTable) {
    if (!confirm(`Hapus meja ${t.code}?`)) return;
    try {
      await del(`/resto/tables/${t.id}`);
      toastSuccess('Meja dihapus');
      await load();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  /** Force a stuck table back to FREE: OCCUPIED without an active order, or a
   * stale reservation. The backend still rejects OCCUPIED tables that DO have
   * an OPEN order — those must go through settle/void. */
  async function freeTable(t: RestoTable) {
    const msg =
      t.status === 'RESERVED'
        ? `Lepas reservasi meja ${t.code}?`
        : `Kosongkan meja ${t.code}? Gunakan hanya jika meja tidak punya order aktif.`;
    if (!confirm(msg)) return;
    try {
      await patch(`/resto/tables/${t.id}`, { status: 'FREE' });
      toastSuccess(`Meja ${t.code} dikosongkan`);
      await load();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function addArea() {
    if (!aName.trim()) return;
    try {
      await post('/resto/tables/areas', { name: aName.trim() });
      aName = '';
      showAreaForm = false;
      await load();
      toastSuccess('Area dibuat');
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  function openCreate() {
    editingTable = null;
    tCode = '';
    tSeats = 4;
    tArea = '';
    showTableForm = true;
  }

  function openEdit(t: RestoTable) {
    editingTable = t;
    tCode = t.code;
    tSeats = t.seats;
    tArea = t.area_id ?? '';
    showTableForm = true;
  }

  const tablesByArea = $derived.by(() => {
    const groups = new Map<string | null, RestoTable[]>();
    for (const t of tables) {
      const key = t.area_id ?? null;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return groups;
  });

  onMount(load);
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>Denah Meja</h1>
      <p class="muted">Kelola area dan meja resto. Meja berstatus OCCUPIED diatur otomatis oleh order.</p>
    </div>
    {#if canManage}
      <div class="header-actions">
        <button onclick={() => (showAreaForm = !showAreaForm)}><Icon icon="mdi:floor-plan" width="16" height="16" /> Area</button>
        <button class="primary" onclick={openCreate}><Icon icon="mdi:plus" width="16" height="16" /> Meja Baru</button>
      </div>
    {/if}
  </div>

  {#if showAreaForm && canManage}
    <div class="card area-form">
      <input placeholder="Nama area (cth: Indoor, Teras)" bind:value={aName} onkeydown={(e) => e.key === 'Enter' && addArea()} />
      <button class="primary" onclick={addArea} disabled={!aName.trim()}>Tambah Area</button>
    </div>
  {/if}

  {#if loading}
    <SkeletonCard lines={6} />
  {:else}
    {#each [...tablesByArea.entries()] as [areaId, list] (areaId ?? 'none')}
      <section class="area-section">
        <h2>{areas.find((a) => a.id === areaId)?.name ?? 'Tanpa Area'}</h2>
        <div class="floor-grid">
          {#each list as t (t.id)}
            <div class="card table-card {t.status.toLowerCase()}">
              <div class="t-head">
                <span class="t-code">{t.code}</span>
                <span class="badge {t.status === 'FREE' ? 'green' : t.status === 'OCCUPIED' ? 'red' : 'amber'}">{t.status}</span>
              </div>
              <div class="muted small"><Icon icon="mdi:account-multiple-outline" width="13" height="13" /> {t.seats} kursi{t.guests ? ` · ${t.guests} tamu` : ''}</div>
              {#if canManage}
                <div class="t-actions">
                  <button class="act" onclick={() => openEdit(t)}>Edit</button>
                  {#if t.status !== 'FREE'}
                    <button class="act" onclick={() => freeTable(t)} title="Kembalikan ke Available">Kosongkan</button>
                  {/if}
                  <button class="act danger" onclick={() => removeTable(t)} disabled={t.status === 'OCCUPIED'}>Hapus</button>
                </div>
              {/if}
            </div>
          {/each}
          {#if list.length === 0}
            <p class="muted small">Belum ada meja di area ini.</p>
          {/if}
        </div>
      </section>
    {/each}
  {/if}
</div>

{#if showTableForm}
  <div class="overlay" role="dialog">
    <div class="modal card">
      <h2>{editingTable ? 'Edit Meja' : 'Meja Baru'}</h2>
      <label for="t-code">Kode Meja</label>
      <input id="t-code" bind:value={tCode} placeholder="cth: T5, BAR-1" />
      <label for="t-seats">Jumlah Kursi</label>
      <input id="t-seats" type="number" min="1" max="50" bind:value={tSeats} />
      <label for="t-area">Area</label>
      <select id="t-area" bind:value={tArea}>
        <option value="">Tanpa Area</option>
        {#each areas as a (a.id)}
          <option value={a.id}>{a.name}</option>
        {/each}
      </select>
      <div class="actions">
        <button onclick={() => (showTableForm = false)}>Batal</button>
        <button class="primary" onclick={saveTable} disabled={saving || !tCode.trim()}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .header-actions {
    display: flex;
    gap: 0.6rem;
  }
  .area-form {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .area-form input {
    max-width: 320px;
  }
  .area-section {
    margin-bottom: 1.4rem;
  }
  .area-section h2 {
    font-size: 0.95rem;
    margin: 0 0 0.6rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .floor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.7rem;
  }
  .table-card {
    padding: 0.75rem;
    border-left: 4px solid var(--border);
  }
  .table-card.free { border-left-color: var(--green); }
  .table-card.occupied { border-left-color: var(--red); }
  .table-card.reserved { border-left-color: var(--amber); }
  .t-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }
  .t-code {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .t-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.55rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
