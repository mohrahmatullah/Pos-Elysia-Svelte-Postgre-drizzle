<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, patch, del } from '$lib/api';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';
  import { Icon } from '$lib/icons';

  interface Category {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
  }

  interface FormState {
    id?: string;
    name: string;
    description: string;
    active: boolean;
  }

  const emptyForm: FormState = { name: '', description: '', active: true };

  let categories = $state<Category[]>([]);
  let meta = $state<{ page: number; totalPages: number; total: number }>({ page: 1, totalPages: 1, total: 0 });
  let search = $state('');
  let statusFilter = $state('');
  let showModal = $state(false);
  let form = $state<FormState>({ ...emptyForm });
  let saving = $state(false);
  let loading = $state(true);

  const canCreate = $derived($permissions.permissions.has('category.create'));
  const canUpdate = $derived($permissions.permissions.has('category.update'));
  const canDelete = $derived($permissions.permissions.has('category.delete'));

  async function load(page = 1) {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('active', statusFilter);
      params.set('page', String(page));
      const res = await get<Category[]>(`/categories?${params}`);
      categories = res.data;
      meta = res.meta as typeof meta;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(() => load());

  function openCreate() {
    form = { ...emptyForm };
    showModal = true;
  }

  function openEdit(c: Category) {
    form = { id: c.id, name: c.name, description: c.description ?? '', active: c.active };
    showModal = true;
  }

  async function save() {
    saving = true;
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
      };
      if (form.id) {
        await patch(`/categories/${form.id}`, { ...payload, active: form.active });
        toastSuccess('Kategori diperbarui');
      } else {
        await post('/categories', payload);
        toastSuccess('Kategori dibuat');
      }
      showModal = false;
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function deactivate(c: Category) {
    if (!confirm(`Nonaktifkan kategori ${c.name}?`)) return;
    try {
      await del(`/categories/${c.id}`);
      toastSuccess('Kategori dinonaktifkan');
      await load(meta.page);
    } catch (e) {
      toastError((e as Error).message);
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Categories</h1>
    {#if canCreate}
      <button class="primary" onclick={openCreate}><Icon icon="mdi:plus" width="16" height="16" /> Tambah Kategori</button>
    {/if}
  </div>

  <div class="toolbar">
    <input placeholder="Cari nama kategori…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load(1)} />
    <select bind:value={statusFilter} onchange={() => load(1)}>
      <option value="">Semua status</option>
      <option value="true">Aktif</option>
      <option value="false">Nonaktif</option>
    </select>
    <button onclick={() => load(1)} title="Cari" aria-label="Cari"><Icon icon="mdi:magnify" width="15" height="15" /> Cari</button>
  </div>

  {#if loading}
    <SkeletonTable rows={8} cols={3} />
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead>
          <tr><th>Nama</th><th>Deskripsi</th><th>Status</th>{#if canUpdate || canDelete}<th></th>{/if}</tr>
        </thead>
        <tbody>
          {#each categories as c (c.id)}
            <tr>
              <td class="font-medium">{c.name}</td>
              <td class="muted">{c.description ?? '—'}</td>
              <td><span class="badge {c.active ? 'green' : 'gray'}">{c.active ? 'Aktif' : 'Nonaktif'}</span></td>
              {#if canUpdate || canDelete}
                <td style="display:flex;gap:.4rem">
                  {#if canUpdate}<button class="act" title="Edit kategori" aria-label="Edit" onclick={() => openEdit(c)}><Icon icon="mdi:pencil" width="15" height="15" /></button>{/if}
                  {#if canDelete && c.active}
                    <button class="danger act" title="Nonaktifkan kategori" aria-label="Nonaktifkan" onclick={() => deactivate(c)}><Icon icon="mdi:cancel" width="15" height="15" /></button>
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr><td colspan="4" class="muted" style="text-align:center;padding:2rem">Tidak ada kategori.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <button disabled={meta.page <= 1} onclick={() => load(meta.page - 1)}>← Sebelumnya</button>
      <span class="muted">Halaman {meta.page} / {meta.totalPages} ({meta.total} kategori)</span>
      <button disabled={meta.page >= meta.totalPages} onclick={() => load(meta.page + 1)}>Berikutnya →</button>
    </div>
  {/if}
</div>

{#if showModal}
  <div class="overlay">
    <div class="modal card">
      <h2>{form.id ? 'Edit Kategori' : 'Kategori Baru'}</h2>
      <label for="f-name">Nama *</label>
      <input id="f-name" bind:value={form.name} placeholder="Makanan" />
      <label for="f-desc">Deskripsi</label>
      <textarea id="f-desc" rows="2" bind:value={form.description}></textarea>
      {#if form.id}
        <label for="f-active">Status</label>
        <select id="f-active" bind:value={form.active}>
          <option value={true}>Aktif</option>
          <option value={false}>Nonaktif</option>
        </select>
      {/if}
      <div class="actions">
        <button onclick={() => (showModal = false)}>Batal</button>
        <button class="primary" onclick={save} disabled={saving || !form.name}>
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
  .modal { width: min(460px, 100%); }
  .modal h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
