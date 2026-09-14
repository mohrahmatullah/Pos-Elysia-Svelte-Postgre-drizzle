<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, formatIDR } from '$lib/api';
  import {
    cart,
    totals,
    orderDiscount,
    orderDiscountType,
    orderDiscountPercent,
    addToCart,
    setQuantity,
    removeLine,
    clearCart,
  } from '$lib/stores/cart';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';

  interface Product {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    selling_price: string;
    unit: string;
    stock: number;
    category_id: string | null;
    category_name: string | null;
    discount_type: 'PERCENT' | 'NOMINAL';
    discount_value: string;
  }
  interface Customer {
    id: string;
    name: string;
  }
  interface Category {
    id: string;
    name: string;
  }
  interface StoreCfg {
    default_discount_type: 'PERCENT' | 'NOMINAL';
    default_discount_value: string;
  }

  let products = $state<Product[]>([]);
  let customers = $state<Customer[]>([]);
  let categories = $state<Category[]>([]);
  let search = $state('');
  let selectedCategory = $state(''); // '' = semua kategori
  let searchInput = $state<HTMLInputElement | null>(null);
  let selectedCustomer = $state<string | null>(null);

  // Order discount: two kinds — PERCENT (% of subtotal) or NOMINAL (flat Rp).
  // State lives in the cart store; the general default comes from Store Settings
  // and pre-fills it (cashier can still change or clear it).
  let discountType = orderDiscountType;
  let discountPercent = orderDiscountPercent;
  const effectiveDiscountRp = $derived($totals.discount);

  // Payment modal — web POS is cash-only for now. Other methods (TRANSFER/
  // CARD/QRIS) are kept in the code but hidden — re-enable by removing `hidden`
  // on the <option>s and the {#if payMethod !== 'CASH'} guards below.
  let showPayment = $state(false);
  let payMethod = $state<'CASH' | 'TRANSFER' | 'CARD' | 'QRIS'>('CASH');
  let amountPaid = $state(0);
  let referenceNumber = $state('');
  let processing = $state(false);

  // Receipt
  interface ReceiptSale {
    invoice_number: string;
    created_at: string;
    grand_total: string;
    discount: string;
    tax: string;
    subtotal: string;
    rounding?: string;
    payments: { method: string; amount: string }[];
    items: { product_name: string; sku: string | null; quantity: number; unit_price: string; subtotal: string }[];
  }
  let receipt = $state<ReceiptSale | null>(null);

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let active = products.filter((p) => p.stock > 0);
    if (selectedCategory) active = active.filter((p) => p.category_id === selectedCategory);
    if (!q) return active.slice(0, 24);
    return active
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? '').includes(q))
      .slice(0, 24);
  });

  const change = $derived(Math.max(0, amountPaid - $totals.grandTotal));

  // Change breakdown into cash denominations so the cashier knows exactly which
  // notes/coins to hand back. Exact to the nearest Rp 100; an odd remainder
  // (rare, from fractional totals) is shown separately.
  const DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100] as const;
  function changeBreakdown(amount: number): { denom: number; count: number }[] {
    let rest = Math.floor(Math.max(0, Math.round(amount)));
    const out: { denom: number; count: number }[] = [];
    for (const d of DENOMS) {
      if (rest < d) continue;
      const count = Math.floor(rest / d);
      rest -= count * d;
      out.push({ denom: d, count });
    }
    return out;
  }
  const changeDenoms = $derived(changeBreakdown(change));
  const changeRemainder = $derived(Math.max(0, Math.round(change)) - changeDenoms.reduce((a, b) => a + b.count * b.denom, 0));

  onMount(async () => {
    try {
      // Settings are optional (cashier has no settings.manage): the general-discount
      // pre-fill simply doesn't happen when the fetch fails.
      const [p, c, cats, cfg] = await Promise.all([
        get<Product[]>('/products?active=true&limit=100'),
        get<Customer[]>('/customers?limit=100'),
        get<Category[]>('/categories?active=true&limit=100'),
        get<StoreCfg>('/settings').catch(() => null),
      ]);
      products = p.data;
      customers = c.data;
      categories = cats.data;
      // General discount (Store Settings) pre-fills the order discount for the
      // transaction; the cashier can still change or clear it.
      const dv = Number.parseFloat(cfg?.data.default_discount_value ?? '0') || 0;
      if (dv > 0) {
        orderDiscountType.set(cfg!.data.default_discount_type);
        if (cfg!.data.default_discount_type === 'PERCENT') orderDiscountPercent.set(dv);
        else orderDiscount.set(dv);
      }
    } catch (e) {
      toastError((e as Error).message);
    }
    searchInput?.focus();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'F2') {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.key === 'F8') {
      e.preventDefault();
      if ($cart.length > 0) openPayment();
    } else if (e.key === 'Escape') {
      showPayment = false;
      receipt = null;
    }
  }

  function openPayment() {
    amountPaid = $totals.grandTotal;
    showPayment = true;
  }

  async function pay() {
    if (processing) return; // double-submission guard (PRD 23)
    processing = true;
    try {
      const discRp = $totals.discount;
      const body = {
        items: $cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        customer_id: selectedCustomer,
        discount: discRp > 0 ? ($discountType === 'PERCENT' ? $discountPercent : discRp) : undefined,
        discount_type: $discountType,
        method: payMethod,
        amount_paid: amountPaid,
        reference_number: referenceNumber || undefined,
      }
      const { data } = await post<ReceiptSale>('/sales', body, { idempotencyKey: crypto.randomUUID() });
      receipt = data;
      showPayment = false;
      clearCart();
      orderDiscountType.set('NOMINAL');
      selectedCustomer = null;
      // refresh stock display
      const p = await get<Product[]>('/products?active=true&limit=100');
      products = p.data;
      toastSuccess(`Transaksi ${data.invoice_number} berhasil`);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      processing = false;
    }
  }

  function printReceipt() {
    window.print();
  }

  function newTransaction() {
    receipt = null;
    searchInput?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="pos">
  <div class="search-bar card">
    <input
      bind:this={searchInput}
      bind:value={search}
      placeholder="Cari produk / scan barcode… (F2)"
      autofocus
    />
    <select class="cat-filter" bind:value={selectedCategory} title="Filter kategori">
      <option value="">Semua kategori</option>
      {#each categories as c (c.id)}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
    <span class="muted hint">F2 cari · F8 bayar · ESC tutup</span>
  </div>

  <div class="content">
    <div class="products">
      {#if filtered.length === 0}
        <p class="muted">Tidak ada produk yang cocok.</p>
      {:else}
        <div class="grid">
          {#each filtered as p (p.id)}
            <button class="product card" onclick={() => addToCart(p)} disabled={p.stock <= 0}>
              <div class="name">{p.name}</div>
              <div class="muted mono sku">{p.sku}</div>
              <div class="price">{formatIDR(p.selling_price)}</div>
              {#if Number.parseFloat(p.discount_value) > 0}
                <div class="small prod-disc">Diskon {p.discount_value}{p.discount_type === 'PERCENT' ? '%' : ''}</div>
              {/if}
              <div class="muted small">Stok: {p.stock}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="cart card">
      <h2 class="cart-title"><Icon icon="mdi:cart-outline" width="18" height="18" /> Keranjang</h2>
      {#if $cart.length === 0}
        <p class="muted">Keranjang kosong. Klik produk untuk menambah.</p>
      {:else}
        <div class="lines">
          {#each $cart as line (line.product_id)}
            <div class="line">
              <div class="info">
                <div>
                  {line.name}
                  {#if line.discount > 0}
                    <span class="muted small">(-{line.discount_value}{line.discount_type === 'PERCENT' ? '%' : ''})</span>
                  {/if}
                </div>
                <div class="muted small">{formatIDR(line.price)} × {line.quantity}</div>
              </div>
              <div class="qty">
                <button onclick={() => setQuantity(line.product_id, line.quantity - 1)}>−</button>
                <span>{line.quantity}</span>
                <button onclick={() => setQuantity(line.product_id, line.quantity + 1)}>+</button>
              </div>
              <div class="sum">
                {formatIDR(line.price * line.quantity - line.discount)}
                {#if line.discount > 0}<div class="muted small strike">{formatIDR(line.price * line.quantity)}</div>{/if}
              </div>
              <button class="danger x" title="Hapus item" aria-label="Hapus item" onclick={() => removeLine(line.product_id)}><Icon icon="mdi:close" width="15" height="15" /></button>
            </div>
          {/each}
        </div>

        <div class="customer-row">
          <select bind:value={selectedCustomer} onchange={() => {}}>
            <option value={null}>Tanpa pelanggan (walk-in)</option>
            {#each customers as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>

        <div class="totals">
          <div class="row"><span>Subtotal</span><span>{formatIDR($totals.subtotal)}</span></div>
          <div class="row discount">
            <span>Diskon</span>
            <span class="disc-inputs">
              <select bind:value={$discountType} title="Jenis diskon">
                <option value="NOMINAL">Rp</option>
                <option value="PERCENT">%</option>
              </select>
              {#if $discountType === 'NOMINAL'}
                <input type="number" min="0" max={$totals.subtotal} bind:value={$orderDiscount} placeholder="0" />
              {:else}
                <input type="number" min="0" max="100" bind:value={$discountPercent} placeholder="0" />
              {/if}
            </span>
          </div>
          {#if effectiveDiscountRp > 0}
            <div class="row muted small"><span>Diskon umum/produk diterapkan</span><span>−{formatIDR(effectiveDiscountRp)}</span></div>
          {/if}
          <div class="row"><span>Pajak (11%)</span><span>{formatIDR($totals.tax)}</span></div>
          {#if $totals.rounding > 0}
            <div class="row muted small"><span>Pembulatan ke Rp 100</span><span>+{formatIDR($totals.rounding)}</span></div>
          {/if}
          <div class="row grand"><span>Total</span><span>{formatIDR($totals.grandTotal)}</span></div>
        </div>

        <button class="primary pay" onclick={openPayment} disabled={$cart.length === 0}>
          <Icon icon="mdi:cash-check" width="18" height="18" /> BAYAR (F8) — {formatIDR($totals.grandTotal)}
        </button>
      {/if}
    </div>
  </div>
</div>

{#if showPayment}
  <div class="overlay" role="dialog">
    <div class="modal card">
      <h2>Pembayaran</h2>
      <div class="grand-line">Total: <strong>{formatIDR($totals.grandTotal)}</strong></div>
      <label for="method">Metode</label>
      <select id="method" bind:value={payMethod}>
        <option value="CASH">Tunai</option>
        <option value="TRANSFER" hidden>Transfer</option>
        <option value="CARD" hidden>Kartu</option>
        <option value="QRIS" hidden>QRIS</option>
      </select>
      <label for="paid">Jumlah Bayar</label>
      <input id="paid" type="number" bind:value={amountPaid} min={$totals.grandTotal} />
      {#if payMethod !== 'CASH'}
        <label for="ref">Referensi (opsional)</label>
        <input id="ref" bind:value={referenceNumber} placeholder="No. referensi transfer/kartu" />
      {/if}
      <div class="pay-summary">
        <div class="ps-row"><span>Total belanja</span><span>{formatIDR($totals.grandTotal)}</span></div>
        <div class="ps-row"><span>Uang dibayarkan</span><span>{formatIDR(amountPaid)}</span></div>
        <div class="ps-row change"><span>Kembalian</span><strong>{formatIDR(change)}</strong></div>
        {#if change > 0 && changeDenoms.length > 0}
          <div class="denoms">
            <span class="muted small">Pecahan kembalian:</span>
            <div class="denom-chips">
              {#each changeDenoms as b (b.denom)}
                <span class="denom-chip">{b.count} × {formatIDR(b.denom)}</span>
              {/each}
              {#if changeRemainder > 0}
                <span class="denom-chip odd">sisa {formatIDR(changeRemainder)}</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      <div class="quick-cash">
        <!-- Uang yang dibayarkan pembeli: klik = set nominal uang pecahan -->
        {#each [5000, 10000, 20000, 50000, 100000] as v (v)}
          <button class:under={v < $totals.grandTotal} onclick={() => (amountPaid = v)}>{formatIDR(v)}</button>
        {/each}
        <button onclick={() => (amountPaid = $totals.grandTotal)}>PAS</button>
      </div>
      {#if amountPaid < $totals.grandTotal}
        <p class="error-text">Uang kurang {formatIDR($totals.grandTotal - amountPaid)} dari total.</p>
      {/if}
      <div class="actions">
        <button onclick={() => (showPayment = false)}>Batal (ESC)</button>
        <button class="primary" onclick={pay} disabled={processing || amountPaid < $totals.grandTotal}>
          {processing ? 'Memproses…' : 'Selesaikan'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if receipt}
  <div class="overlay" role="dialog">
    <div class="modal receipt card">
      <h2 class="ok-title"><Icon icon="mdi:check-circle-outline" width="20" height="20" /> Transaksi Berhasil</h2>
      <div class="receipt-body" id="receipt-print">
        <div class="center"><strong>TOKO MAJU JAYA</strong></div>
        <div class="center muted">{new Date(receipt.created_at).toLocaleString('id-ID')}</div>
        <div class="mono inv">{receipt.invoice_number}</div>
        <hr />
        {#each receipt.items as item (item.product_name)}
          <div class="r-item">
            <div>{item.product_name}</div>
            <div class="muted small">{item.quantity} × {formatIDR(item.unit_price)}</div>
            <div>{formatIDR(item.subtotal)}</div>
          </div>
        {/each}
        <hr />
        <div class="row"><span>Subtotal</span><span>{formatIDR(receipt.subtotal)}</span></div>
        <div class="row"><span>Diskon</span><span>{formatIDR(receipt.discount)}</span></div>
        <div class="row"><span>Pajak</span><span>{formatIDR(receipt.tax)}</span></div>
        {#if receipt.rounding && Number.parseFloat(receipt.rounding) > 0}
          <div class="row"><span>Pembulatan</span><span>+{formatIDR(receipt.rounding)}</span></div>
        {/if}
        <div class="row grand"><span>TOTAL</span><span>{formatIDR(receipt.grand_total)}</span></div>
        <div class="row"><span>Bayar ({receipt.payments[0]?.method})</span><span>{formatIDR(receipt.payments[0]?.amount ?? 0)}</span></div>
        <div class="row"><span>Kembalian</span><span>{formatIDR(Math.max(0, Number(receipt.payments[0]?.amount ?? 0) - Number(receipt.grand_total)))}</span></div>
        {#if changeDenoms.length > 0 && change > 0}
          <div class="center muted small denoms-line">
            {changeDenoms.map((b) => `${b.count}×${formatIDR(b.denom)}`).join(' + ')}
          </div>
        {/if}
        <p class="center muted">Terima kasih telah berbelanja!</p>
      </div>
      <div class="actions">
        <button onclick={newTransaction}><Icon icon="mdi:plus" width="15" height="15" /> Transaksi Baru</button>
        <button class="primary" onclick={printReceipt}><Icon icon="mdi:printer" width="15" height="15" /> Cetak</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pos {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .search-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1rem 1.4rem 0.8rem;
  }
  .hint {
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .cat-filter {
    width: auto;
    min-width: 160px;
    max-width: 220px;
  }
  .prod-disc {
    color: var(--amber);
    font-weight: 600;
  }
  .disc-inputs {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .disc-inputs select {
    width: 72px;
    padding: 0.2rem 0.3rem;
  }
  .disc-inputs input {
    width: 90px;
    text-align: right;
    padding: 0.2rem 0.4rem;
  }
  .strike {
    text-decoration: line-through;
    text-align: right;
  }
  .content {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 0.8rem;
    padding: 0 1.4rem 1.4rem;
    flex: 1;
    min-height: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .product {
    text-align: left;
    padding: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .product .name {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .sku {
    font-size: 0.7rem;
  }
  .price {
    color: var(--green);
    font-weight: 700;
  }
  .small {
    font-size: 0.72rem;
  }
  .cart {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .cart-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cart h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .lines {
    flex: 1;
    overflow-y: auto;
    min-height: 60px;
  }
  .line {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.88rem;
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .qty button {
    padding: 0.1rem 0.5rem;
  }
  .x {
    padding: 0.1rem 0.4rem;
    border: none;
    color: var(--red);
  }
  .customer-row {
    margin: 0.7rem 0 0.4rem;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0;
  }
  .discount input {
    width: 110px;
    text-align: right;
    padding: 0.2rem 0.4rem;
  }
  .totals .small {
    font-size: 0.75rem;
  }
  .grand {
    font-weight: 700;
    font-size: 1.1rem;
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
    margin-top: 0.3rem;
  }
  .pay {
    margin-top: 0.8rem;
    font-size: 1rem;
    padding: 0.7rem;
  }
  .modal {
    width: min(380px, 100%);
  }
  .modal h2 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
  }
  .grand-line {
    font-size: 1.15rem;
    margin-bottom: 0.4rem;
  }
  .change {
    display: flex;
    justify-content: space-between;
    margin-top: 0.8rem;
    font-size: 1.05rem;
  }
  .quick-cash {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.7rem;
    flex-wrap: wrap;
  }
  .pay-summary {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem 0.8rem;
    margin-top: 0.8rem;
  }
  .ps-row {
    display: flex;
    justify-content: space-between;
    padding: 0.15rem 0;
    font-size: 0.95rem;
  }
  .ps-row.change {
    border-top: 1px dashed var(--border);
    margin-top: 0.3rem;
    padding-top: 0.45rem;
    font-size: 1.15rem;
    color: var(--green);
  }
  .denoms {
    margin-top: 0.5rem;
  }
  .denom-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .denom-chip {
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    font-size: 0.78rem;
    font-weight: 600;
  }
  .denom-chip.odd {
    color: var(--amber);
  }
  .denoms-line {
    font-size: 0.75rem;
    margin: 0.1rem 0 0;
  }
  .quick-cash button {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
  }
  .quick-cash button.under {
    opacity: 0.55;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .receipt .center {
    text-align: center;
  }
  .receipt h2 { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.5rem; font-size: 1.05rem; }
  .receipt h2 :global(svg) { color: #16a34a; }
  .inv {
    text-align: center;
    font-size: 1.05rem;
    margin: 0.3rem 0;
  }
  .r-item {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 0.15rem 0;
    font-size: 0.85rem;
  }
  .receipt .row {
    display: flex;
    justify-content: space-between;
    padding: 0.12rem 0;
    font-size: 0.88rem;
  }
  .receipt .grand {
    font-weight: 700;
    font-size: 1rem;
  }
  hr {
    border: none;
    border-top: 1px dashed var(--border);
  }
  @media print {
    body * {
      visibility: hidden;
    }
    #receipt-print,
    #receipt-print * {
      visibility: visible;
    }
    #receipt-print {
      position: absolute;
      top: 0;
      left: 0;
      width: 80mm;
      color: #000;
      background: #fff;
    }
  }
  @media (max-width: 900px) {
    .content {
      grid-template-columns: 1fr;
    }
  }
</style>
