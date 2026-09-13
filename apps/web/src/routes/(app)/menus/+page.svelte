<script lang="ts">
  /** Menu management (dynamic sidebar).
   * Create/edit/delete menus; each menu's permission code is auto-created in the
   * catalog by the backend and auto-granted to owner, so a new menu is instantly usable.
   */
  import { onMount } from 'svelte';
  import { get, post, patch, del } from '$lib/api';
  import SkeletonTable from '$lib/components/SkeletonTable.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon, filterIconChoices, isIconifyName, normalizeIconInput } from '$lib/icons';

  interface MenuRow {
    id: string;
    label: string;
    href: string | null;
    icon: string | null;
    parent_id: string | null;
    permission_code: string | null;
    sort_order: number;
    active: boolean;
  }

  let menus = $state<MenuRow[]>([]);
  let loading = $state(true);
  let saving = $state(false);

  /** Group headers (href null) can be chosen as parent. */
  const groupOptions = $derived(menus.filter((m) => m.href === null));
  /** Hierarchical view: top-level rows with their children nested. */
  const tree = $derived.by(() => {
    const tops = menus.filter((m) => m.parent_id === null);
    return tops.map((t) => ({
      row: t,
      children: menus
        .filter((m) => m.parent_id === t.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    }));
  });

  // Icon picker state (shared by create + edit modals)
  let iconQuery = $state('');
  const iconChoices = $derived(filterIconChoices(iconQuery));

  // Create modal
  let showCreate = $state(false);
  let form = $state({ label: '', href: '', icon: '', permission_code: '', sort_order: 0, asGroup: false, parent_id: '' });

  // Edit modal
  let editing = $state<MenuRow | null>(null);
  let editForm = $state({ label: '', href: '', icon: '', permission_code: '', sort_order: 0, active: true, parent_id: '' });

  function pickIcon(icon: string) {
    if (editing) editForm.icon = icon;
    else form.icon = icon;
  }

  function openCreate() {
    form = { label: '', href: '', icon: '', permission_code: '', sort_order: 0, asGroup: false, parent_id: '' };
    iconQuery = '';
    showCreate = true;
  }

  async function load() {
    loading = true;
    try {
      const res = await get<MenuRow[]>('/menus');
      menus = res.data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function create() {
    saving = true;
    try {
      const isGroup = form.asGroup;
      await post('/menus', {
        label: form.label,
        href: isGroup ? null : form.href || null,
        icon: normalizeIconInput(form.icon),
        permission_code: form.permission_code || null,
        parent_id: form.parent_id || null,
        sort_order: form.sort_order || undefined,
      });
      toastSuccess(isGroup ? `Grup "${form.label}" dibuat` : `Menu "${form.label}" dibuat`);
      showCreate = false;
      form = { label: '', href: '', icon: '', permission_code: '', sort_order: 0, asGroup: false, parent_id: '' };
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  function openEdit(m: MenuRow) {
    editing = m;
    editForm = {
      label: m.label,
      href: m.href ?? '',
      icon: m.icon ?? '',
      permission_code: m.permission_code ?? '',
      sort_order: m.sort_order,
      active: m.active,
      parent_id: m.parent_id ?? '',
    };
  }

  async function saveEdit() {
    if (!editing) return;
    saving = true;
    try {
      await patch(`/menus/${editing.id}`, {
        label: editForm.label,
        href: editForm.href || null,
        icon: normalizeIconInput(editForm.icon),
        permission_code: editForm.permission_code || null,
        parent_id: editForm.parent_id || null,
        sort_order: editForm.sort_order,
        active: editForm.active,
      });
      toastSuccess('Menu diperbarui');
      editing = null;
      await load();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function remove(m: MenuRow) {
    if (!confirm(`Hapus menu "${m.label}" dari sidebar? (Permission-nya tetap ada di katalog)`)) return;
    try {
      await del(`/menus/${m.id}`);
      toastSuccess(`Menu "${m.label}" dihapus`);
      await load();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function toggleActive(m: MenuRow) {
    try {
      await patch(`/menus/${m.id}`, { active: !m.active });
      await load();
    } catch (e) {
      toastError((e as Error).message);
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Menus</h1>
    <button class="primary" onclick={openCreate}>+ Menu Baru</button>
  </div>

  <p class="muted small">
    Sidebar dibaca langsung dari database. Buat <strong>grup</strong> (tanpa link) untuk mengelompokkan menu,
    lalu buat menu dengan parent grup tersebut. Permission menu dengan kode baru otomatis dibuat di katalog
    dan diberikan ke role <strong>owner</strong> — atur role lain di halaman Role &amp; Permission.
  </p>

  {#if loading}
    <SkeletonTable rows={6} cols={4} />
  {:else}
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>Urut</th><th>Menu</th><th>Link</th><th>Permission</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {#each tree as node (node.row.id)}
            <!-- Top-level row -->
            <tr class:group-row={!node.row.href}>
              <td class="mono">{node.row.sort_order}</td>
              <td>
                <strong>{node.row.icon ? `${node.row.icon} ` : ''}{node.row.label}</strong>
                {#if !node.row.href}<span class="badge amber">grup</span>{/if}
              </td>
              <td class="mono">{node.row.href ?? '—'}</td>
              <td>{#if node.row.permission_code}<span class="badge gray mono">{node.row.permission_code}</span>{:else}<span class="muted">—</span>{/if}</td>
              <td>
                <button class="link" onclick={() => toggleActive(node.row)}>
                  <span class="badge {node.row.active ? 'green' : 'gray'}">{node.row.active ? 'Aktif' : 'Disembunyikan'}</span>
                </button>
              </td>
              <td style="display:flex;gap:.4rem">
                <button onclick={() => openEdit(node.row)}>Edit</button>
                <button class="danger" onclick={() => remove(node.row)}>Hapus</button>
              </td>
            </tr>
            {#each node.children as m (m.id)}
              <tr>
                <td class="mono muted">{m.sort_order}</td>
                <td class="child-cell">↳ {m.icon ? `${m.icon} ` : ''}{m.label}</td>
                <td class="mono">{m.href}</td>
                <td><span class="badge gray mono">{m.permission_code ?? '—'}</span></td>
                <td>
                  <button class="link" onclick={() => toggleActive(m)}>
                    <span class="badge {m.active ? 'green' : 'gray'}">{m.active ? 'Aktif' : 'Disembunyikan'}</span>
                  </button>
                </td>
                <td style="display:flex;gap:.4rem">
                  <button onclick={() => openEdit(m)}>Edit</button>
                  <button class="danger" onclick={() => remove(m)}>Hapus</button>
                </td>
              </tr>
            {/each}
          {:else}
            <tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Belum ada menu.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showCreate}
  <div class="overlay">
    <div class="modal card">
      <h2>Menu Baru</h2>
      <label for="m-type">Tipe</label>
      <select id="m-type" bind:value={form.asGroup}>
        <option value={false}>Menu dengan link</option>
        <option value={true}>Grup (pengelompok, tanpa link)</option>
      </select>
      <label for="m-label">Label *</label>
      <input id="m-label" bind:value={form.label} placeholder="Laporan Pajak" maxlength={80} />
      {#if !form.asGroup}
        <label for="m-href">Link / Path</label>
        <input id="m-href" bind:value={form.href} placeholder="/tax-reports" maxlength={200} />
      {/if}
      <label for="m-parent">Parent (opsional — masukkan ke grup)</label>
      <select id="m-parent" bind:value={form.parent_id}>
        <option value="">— Top level —</option>
        {#each groupOptions as g (g.id)}
          <option value={g.id}>{g.label}</option>
        {/each}
      </select>
      <label for="m-icon">Icon (Iconify name atau emoji)</label>
      <input id="m-icon" bind:value={form.icon} placeholder="mdi:cart-outline" maxlength={60} />
      <div class="icon-pick">
        <input class="icon-search" bind:value={iconQuery} placeholder="Cari icon… (contoh: cart, laporan, user)" />
        <div class="icon-grid">
          {#each iconChoices as c (c.name)}
            <button
              type="button"
              class="icon-btn"
              class:selected={form.icon === c.name}
              title={c.name}
              onclick={() => pickIcon(c.name)}
            >
              <Icon icon={c.name} width="26" height="26" />
            </button>
          {:else}
            <span class="muted small">Tidak ada yang cocok — ketik nama Iconify manual di atas.</span>
          {/each}
        </div>
        {#if form.icon}
          <div class="icon-preview">
            <span class="icon-preview-box">
              <Icon icon={isIconifyName(form.icon) ? form.icon : 'mdi:help-circle-outline'} width="40" height="40" />
            </span>
            <div>
              <strong class="mono">{form.icon}</strong>
              <p class="muted small">Seperti ini nanti tampilnya di sidebar.</p>
            </div>
          </div>
        {/if}
      </div>
      <label for="m-perm">Permission code {form.asGroup ? '(opsional — untuk mengunci seluruh grup)' : '*'}</label>
      <input id="m-perm" bind:value={form.permission_code} placeholder="taxreport.view" maxlength={100} />
      <p class="muted small">Jika kode belum ada di katalog, otomatis dibuat dan diberikan ke owner.</p>
      <label for="m-sort">Urutan tampil (angka kecil = atas)</label>
      <input id="m-sort" type="number" min="0" bind:value={form.sort_order} />
      <div class="actions">
        <button onclick={() => (showCreate = false)}>Batal</button>
        <button
          class="primary"
          onclick={create}
          disabled={saving || !form.label.trim() || (!form.asGroup && (!form.href.trim() || !form.permission_code.trim()))}
        >
          {saving ? 'Menyimpan…' : form.asGroup ? 'Buat Grup' : 'Buat Menu'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if editing}
  <div class="overlay">
    <div class="modal card">
      <h2>Edit Menu</h2>
      <label for="e-label">Label *</label>
      <input id="e-label" bind:value={editForm.label} maxlength={80} />
      <label for="e-href">Link / Path (kosongkan = grup)</label>
      <input id="e-href" bind:value={editForm.href} maxlength={200} placeholder="— grup tanpa link —" />
      <label for="e-parent">Parent</label>
      <select id="e-parent" bind:value={editForm.parent_id}>
        <option value="">— Top level —</option>
        {#each groupOptions.filter((g) => g.id !== editing?.id) as g (g.id)}
          <option value={g.id}>{g.label}</option>
        {/each}
      </select>
      <label for="e-icon">Icon (Iconify name atau emoji)</label>
      <input id="e-icon" bind:value={editForm.icon} placeholder="mdi:cart-outline" maxlength={60} />
      <div class="icon-pick">
        <input class="icon-search" bind:value={iconQuery} placeholder="Cari icon… (contoh: cart, laporan, user)" />
        <div class="icon-grid">
          {#each iconChoices as c (c.name)}
            <button
              type="button"
              class="icon-btn"
              class:selected={editForm.icon === c.name}
              title={c.name}
              onclick={() => pickIcon(c.name)}
            >
              <Icon icon={c.name} width="26" height="26" />
            </button>
          {:else}
            <span class="muted small">Tidak ada yang cocok — ketik nama Iconify manual di atas.</span>
          {/each}
        </div>
        {#if editForm.icon}
          <div class="icon-preview">
            <span class="icon-preview-box">
              <Icon icon={isIconifyName(editForm.icon) ? editForm.icon : 'mdi:help-circle-outline'} width="40" height="40" />
            </span>
            <div>
              <strong class="mono">{editForm.icon}</strong>
              <p class="muted small">Seperti ini nanti tampilnya di sidebar.</p>
            </div>
          </div>
        {/if}
      </div>
      <label for="e-perm">Permission code</label>
      <input id="e-perm" bind:value={editForm.permission_code} maxlength={100} />
      <label for="e-sort">Urutan tampil</label>
      <input id="e-sort" type="number" min="0" bind:value={editForm.sort_order} />
      <label for="e-active">Status</label>
      <select id="e-active" bind:value={editForm.active}>
        <option value={true}>Aktif</option>
        <option value={false}>Disembunyikan</option>
      </select>
      <div class="actions">
        <button onclick={() => (editing = null)}>Batal</button>
        <button class="primary" onclick={saveEdit} disabled={saving || !editForm.label.trim() || !editForm.href.trim()}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .small {
    font-size: 0.85rem;
  }
  .modal {
    width: min(440px, 100%);
  }
  .modal h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    cursor: pointer;
  }
  .group-row td {
    background: var(--bg-soft);
  }
  .child-cell {
    padding-left: 1.6rem;
    color: var(--text-dim);
  }
  .icon-pick {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem;
    margin-bottom: 0.4rem;
  }
  .icon-search {
    width: 100%;
    margin-bottom: 0.5rem;
  }
  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 0.35rem;
    max-height: 230px;
    overflow-y: auto;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    padding: 0.45rem 0;
    border-radius: 6px;
  }
  .icon-btn:hover {
    background: var(--bg-card);
  }
  .icon-btn.selected {
    background: var(--accent-strong);
    color: #fff;
  }
  .icon-preview {
    margin-top: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .icon-preview-box {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-card);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
