<script lang="ts">
  import { onMount } from 'svelte';
  import { get, patch } from '$lib/api';
  import SkeletonCard from '$lib/components/SkeletonCard.svelte';
  import { toastSuccess, toastError } from '$lib/stores/toast';

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
  }

  let form = $state<StoreSettings | null>(null);
  let saving = $state(false);

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
</style>
