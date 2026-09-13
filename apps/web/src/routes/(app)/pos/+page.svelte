<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, formatIDR } from '$lib/api';
  import { cart, totals, orderDiscount, addToCart, setQuantity, removeLine, clearCart } from '$lib/stores/cart';
  import { toastSuccess, toastError } from '$lib/stores/toast';

  interface Product {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    selling_price: string;
    unit: string;
    stock: number;
  }
  interface Customer {
    id: string;
    name: string;
  }

  let products = $state<Product[]>([]);
  let customers = $state<Customer[]>([]);
  let search = $state('');
  let searchInput = $state<HTMLInputElement | null>(null);
  let selectedCustomer = $state<string | null>(null);
  let discountInput = $state(0);

  // Payment modal
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
    payments: { method: string; amount: string }[];
    items: { product_name: string; sku: string | null; quantity: number; unit_price: string; subtotal: string }[];
  }
  let receipt = $state<ReceiptSale | null>(null);

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const active = products.filter((p) => p.stock > 0);
    if (!q) return active.slice(0, 24);
    return active
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? '').includes(q))
      .slice(0, 24);
  });

  const change = $derived(Math.max(0, amountPaid - $totals.grandTotal));

  onMount(async () => {
    try {
      const [p, c] = await Promise.all([get<Product[]>('/products?active=true&limit=100'), get<Customer[]>('/customers?limit=100')]);
      products = p.data;
      customers = c.data;
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
      const body = {
        items: $cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity, discount: l.discount || undefined })),
        customer_id: selectedCustomer,
        discount: discountInput || undefined,
        method: payMethod,
        amount_paid: amountPaid,
        reference_number: referenceNumber || undefined,
      };
      const { data } = await post<ReceiptSale>('/sales', body, { idempotencyKey: crypto.randomUUID() });
      receipt = data;
      showPayment = false;
      clearCart();
      discountInput = 0;
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
              <div class="muted small">Stok: {p.stock}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="cart card">
      <h2>Keranjang</h2>
      {#if $cart.length === 0}
        <p class="muted">Keranjang kosong. Klik produk untuk menambah.</p>
      {:else}
        <div class="lines">
          {#each $cart as line (line.product_id)}
            <div class="line">
              <div class="info">
                <div>{line.name}</div>
                <div class="muted small">{formatIDR(line.price)} × {line.quantity}</div>
              </div>
              <div class="qty">
                <button onclick={() => setQuantity(line.product_id, line.quantity - 1)}>−</button>
                <span>{line.quantity}</span>
                <button onclick={() => setQuantity(line.product_id, line.quantity + 1)}>+</button>
              </div>
              <div class="sum">{formatIDR(line.price * line.quantity - line.discount)}</div>
              <button class="danger x" onclick={() => removeLine(line.product_id)}>✕</button>
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
            <input type="number" min="0" bind:value={discountInput} />
          </div>
          <div class="row"><span>Pajak (11%)</span><span>{formatIDR($totals.tax)}</span></div>
          <div class="row grand"><span>Total</span><span>{formatIDR($totals.grandTotal)}</span></div>
        </div>

        <button class="primary pay" onclick={openPayment} disabled={$cart.length === 0}>
          BAYAR (F8) — {formatIDR($totals.grandTotal)}
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
        <option value="TRANSFER">Transfer</option>
        <option value="CARD">Kartu</option>
        <option value="QRIS">QRIS</option>
      </select>
      <label for="paid">Jumlah Bayar</label>
      <input id="paid" type="number" bind:value={amountPaid} min={$totals.grandTotal} />
      <label for="ref">Referensi (opsional)</label>
      <input id="ref" bind:value={referenceNumber} placeholder="No. referensi transfer/kartu" />
      <div class="row change"><span>Kembalian</span><strong>{formatIDR(change)}</strong></div>
      <div class="quick-cash">
        {#each [10000, 20000, 50000, 100000] as v (v)}
          <button onclick={() => (amountPaid = $totals.grandTotal + v)}>+{formatIDR(v)}</button>
        {/each}
        <button onclick={() => (amountPaid = $totals.grandTotal)}>PAS</button>
      </div>
      {#if amountPaid < $totals.grandTotal}
        <p class="error-text">Jumlah bayar kurang dari total.</p>
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
      <h2>✅ Transaksi Berhasil</h2>
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
        <div class="row grand"><span>TOTAL</span><span>{formatIDR(receipt.grand_total)}</span></div>
        <div class="row"><span>Bayar ({receipt.payments[0]?.method})</span><span>{formatIDR(receipt.payments[0]?.amount ?? 0)}</span></div>
        <div class="row"><span>Kembalian</span><span>{formatIDR(Math.max(0, Number(receipt.payments[0]?.amount ?? 0) - Number(receipt.grand_total)))}</span></div>
        <p class="center muted">Terima kasih telah berbelanja!</p>
      </div>
      <div class="actions">
        <button onclick={newTransaction}>Transaksi Baru</button>
        <button class="primary" onclick={printReceipt}>🖨️ Cetak</button>
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
  .quick-cash button {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
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
