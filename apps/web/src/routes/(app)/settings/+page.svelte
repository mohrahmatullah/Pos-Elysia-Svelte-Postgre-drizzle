<script lang="ts">
  import { onMount } from 'svelte';
  import { get, patch } from '$lib/api';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';
  import { Icon } from '$lib/icons';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { permissions } from '$lib/permissions';

  interface StoreSettings {
    name: string;
    address: string | null;
    phone: string | null;
    currency: string;
    timezone: string;
    receipt_footer: string | null;
    invoice_prefix: string;
    tax_rate: string;
    default_discount_type: 'PERCENT' | 'NOMINAL';
    default_discount_value: string;
    default_theme: 'DARK' | 'LIGHT' | 'SYSTEM';
    business_type: 'RETAIL' | 'RESTO' | 'HYBRID';
  }

  let form = $state<StoreSettings | null>(null);
  let saving = $state(false);
  /** Tipe bisnis re-scopes seluruh menu & fitur toko — butuh izin khusus
   * store.business_type (owner secara default; role check mencegah lockout saat
   * DB belum di-seed ulang dengan kode baru). */
  const canChangeBizType = $derived(
    $permissions.permissions.has('store.business_type') || $permissions.role === 'owner',
  );

  onMount(async () => {
    try {
      form = (await get<StoreSettings>('/settings')).data;
    } catch (e) {
      toastError((e as Error).message);
    }
  });

  async function save() {
    if (!form) return;
    saving = true;
    try {
      form = (await patch<StoreSettings>('/settings', {
        name: form.name,
        address: form.address,
        phone: form.phone,
        currency: form.currency,
        timezone: form.timezone,
        receipt_footer: form.receipt_footer,
        invoice_prefix: form.invoice_prefix,
        tax_rate: Number.parseFloat(form.tax_rate),
        default_discount_type: form.default_discount_type,
        default_discount_value: Number.parseFloat(form.default_discount_value) || 0,
        default_theme: form.default_theme,
        // The backend silently drops this without store.business_type; only send it
        // when permitted so a 403 can never abort the whole save.
        ...(canChangeBizType ? { business_type: form.business_type } : {}),
      })).data;
      toastSuccess('Pengaturan tersimpan');
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Store Settings</h1>
  </div>

  {#if form}
    <div class="card biz-card" class:locked={!canChangeBizType}>
      <h2 class="biz-title">
        Tipe Bisnis
        {#if !canChangeBizType}<span class="badge gray" title="Butuh izin store.business_type"><Icon icon="mdi:lock-outline" width="12" height="12" /> Owner only</span>{/if}
      </h2>
      <div class="biz-options">
        {#each [
          { v: 'RETAIL', icon: 'mdi:cart-outline', title: 'Retail', desc: 'Kasir biasa: scan produk, keranjang, bayar' },
          { v: 'RESTO', icon: 'mdi:silverware-fork-knife', title: 'Resto', desc: 'Meja, order per meja, kitchen display' },
          { v: 'HYBRID', icon: 'mdi:store-plus', title: 'Hybrid', desc: 'Retail + Resto sekaligus' },
        ] as opt (opt.v)}
          <button
            type="button"
            class="biz-option"
            class:selected={form.business_type === opt.v}
            disabled={!canChangeBizType}
            onclick={() => {
              if (form) form.business_type = opt.v as typeof form.business_type;
            }}
          >
            <Icon icon={opt.icon} width="20" height="20" />
            <span class="biz-name">{opt.title}</span>
            <span class="biz-desc muted small">{opt.desc}</span>
          </button>
        {/each}
      </div>
      <p class="muted small">
        {#if canChangeBizType}
          Menu sidebar menyesuaikan otomatis: toko Retail tidak melihat menu Resto, dan sebaliknya. Perubahan berlaku setelah halaman dimuat ulang.
        {:else}
          Hanya role dengan izin <strong>store.business_type</strong> (owner) yang dapat mengubah tipe bisnis.
        {/if}
      </p>
    </div>
  {/if}

  {#if form}
    <div class="card" style="max-width:560px">
      <label for="s-name">Nama Toko</label>
      <input id="s-name" bind:value={form.name} />
      <label for="s-addr">Alamat</label>
      <textarea id="s-addr" rows="2" bind:value={form.address}></textarea>
      <label for="s-phone">Telepon</label>
      <input id="s-phone" bind:value={form.phone} />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div>
          <label for="s-curr">Currency</label>
          <input id="s-curr" bind:value={form.currency} />
        </div>
        <div>
          <label for="s-tz">Timezone</label>
          <input id="s-tz" bind:value={form.timezone} />
        </div>
        <div>
          <label for="s-prefix">Prefix Invoice</label>
          <input id="s-prefix" bind:value={form.invoice_prefix} />
        </div>
        <div>
          <label for="s-tax">Tax Rate (%)</label>
          <input id="s-tax" type="number" min="0" max="100" step="0.01" bind:value={form.tax_rate} />
        </div>
        <div>
          <label for="s-dtype">Diskon Umum — Jenis</label>
          <select id="s-dtype" bind:value={form.default_discount_type}>
            <option value="NOMINAL">Nominal (Rp)</option>
            <option value="PERCENT">Persen (%)</option>
          </select>
        </div>
        <div>
          <label for="s-dval">Diskon Umum — Nilai {form.default_discount_type === 'PERCENT' ? '(%)' : '(Rp)'}</label>
          <input
            id="s-dval"
            type="number"
            min="0"
            max={form.default_discount_type === 'PERCENT' ? 100 : undefined}
            step="0.01"
            bind:value={form.default_discount_value}
          />
        </div>
      </div>
      <p class="muted small">
        Diskon umum otomatis dipakai di POS untuk setiap transaksi baru (kasir masih bisa mengubahnya).
        Nilai 0 = tidak ada diskon umum.
      </p>
      <label for="s-theme">Tema Default Aplikasi</label>
      <select id="s-theme" bind:value={form.default_theme}>
        <option value="DARK">Gelap</option>
        <option value="LIGHT">Terang</option>
        <option value="SYSTEM">Ikuti Sistem</option>
      </select>
      <p class="muted small">
        Dipakai saat user belum memilih tema sendiri. Setiap user tetap bisa mengganti tema kapan saja lewat tombol di topbar.
      </p>
      <label for="s-footer">Footer Receipt</label>
      <textarea id="s-footer" rows="2" bind:value={form.receipt_footer}></textarea>
      <div style="margin-top:1rem;display:flex;justify-content:flex-end">
        <button class="primary" onclick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </div>
  {:else}
    <div class="card" style="max-width:560px" aria-busy="true">
      <SkeletonCard lines={6} />
    </div>
  {/if}
</div>

<style>
  .small {
    font-size: 0.8rem;
    margin: 0.4rem 0 0;
  }
  .biz-card {
    max-width: 560px;
    margin-bottom: 1rem;
  }
  .biz-title {
    margin: 0 0 0.6rem;
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .biz-card.locked .biz-option {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .biz-card.locked .biz-option.selected {
    box-shadow: none;
    border-color: var(--border);
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
  }
  .biz-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }
  .biz-option {
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.8rem 0.6rem;
    text-align: center;
    align-items: center;
  }
  .biz-option.selected {
    border-color: var(--accent);
    background: rgba(79, 140, 255, 0.12);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .biz-name {
    font-weight: 600;
  }
  .biz-desc {
    line-height: 1.3;
  }
  @media (max-width: 560px) {
    .biz-options {
      grid-template-columns: 1fr;
    }
  }
</style>
