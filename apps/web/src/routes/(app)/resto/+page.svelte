<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get, post, patch, del, formatIDR } from '$lib/api';
  import { toastSuccess, toastError } from '$lib/stores/toast';
  import { Icon } from '$lib/icons';
  import { permissions } from '$lib/permissions';

  interface RestoTable {
    id: string;
    code: string;
    seats: number;
    status: 'FREE' | 'OCCUPIED' | 'RESERVED';
    area_id: string | null;
    order_id: string | null;
    guests: number | null;
  }
  interface Area { id: string; name: string; sort_order: number }
  interface Product {
    id: string;
    sku: string;
    name: string;
    selling_price: string;
    stock: number;
    category_id: string | null;
    category_name: string | null;
    discount_type: 'PERCENT' | 'NOMINAL';
    discount_value: string;
  }
  interface OrderItem {
    id: string;
    product_id: string | null;
    product_name: string;
    sku: string | null;
    quantity: number;
    unit_price: string;
    notes: string | null;
    kitchen_status: string;
  }
  interface Order {
    id: string;
    table_id: string;
    guests: number;
    status: string;
    items: OrderItem[];
  }
  interface OpenOrderRow {
    id: string;
    table_id: string;
    table_code: string;
    guests: number;
    opened_at: string;
    items: number;
    sent_items: number;
    served_items: number;
    subtotal: string;
  }
  interface BillPreview {
    order_id: string;
    table_code: string;
    guests: number;
    items: OrderItem[];
    subtotal: string;
    discount: string;
    tax: string;
    tax_rate: number;
    rounding: string;
    grand_total: string;
  }

  let tables = $state<RestoTable[]>([]);
  let areas = $state<Area[]>([]);
  let products = $state<Product[]>([]);
  let bills = $state<OpenOrderRow[]>([]);
  let loading = $state(true);
  let search = $state('');

  // Active order panel
  let order = $state<Order | null>(null);
  let orderTableCode = $state('');
  let busy = $state(false);

  // Settlement — totals come from the SERVER bill preview so the modal always
  // matches what settle will charge (discount + tax + Rp 100 rounding).
  let showPay = $state(false);
  let payMethod = $state<'CASH' | 'TRANSFER' | 'CARD' | 'QRIS'>('CASH');
  let amountPaid = $state(0);
  let orderDiscount = $state(0);
  let discountType = $state<'NOMINAL' | 'PERCENT'>('NOMINAL');
  let preview = $state<BillPreview | null>(null);
  let processing = $state(false);
  let receipt = $state<{ sale: { invoice_number: string; grand_total: string; payments: { method: string; amount: string }[] } } | null>(null);

  const grandTotal = $derived(preview ? Number.parseFloat(preview.grand_total) : 0);
  const changeDue = $derived(Math.max(0, amountPaid - grandTotal));

  const canOrder = $derived($permissions.permissions.has('resto.order'));
  const canSettle = $derived($permissions.permissions.has('resto.settle'));
  const canVoid = $derived($permissions.permissions.has('sales.cancel'));

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  });

  const subtotal = $derived(order ? order.items.reduce((a, i) => a + Number(i.unit_price) * i.quantity, 0) : 0);
  const queuedCount = $derived(order ? order.items.filter((i) => i.kitchen_status === 'QUEUED').length : 0);
  /** Every SENT/PREPARING/READY item has been served — ready to close the bill. */
  const allServed = $derived(
    order !== null &&
      order.items.length > 0 &&
      order.items.every((i) => i.kitchen_status === 'SERVED'),
  );
  const sentNotServed = $derived(order ? order.items.filter((i) => i.kitchen_status !== 'QUEUED' && i.kitchen_status !== 'SERVED').length : 0);

  async function sendToKitchen() {
    if (!order || busy || queuedCount === 0) return;
    busy = true;
    try {
      const { data } = await post<Order>(`/resto/orders/${order.id}/send`, {});
      order = data;
      toastSuccess(`${queuedCount} item dikirim ke dapur`);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function loadFloor() {
    try {
      const { data } = await get<{ areas: Area[]; tables: RestoTable[] }>('/resto/tables');
      areas = data.areas;
      tables = data.tables;
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  /** Active bills list — the cashier's payment queue (served-but-unpaid included). */
  async function loadBills() {
    try {
      bills = (await get<OpenOrderRow[]>('/resto/orders')).data;
    } catch {
      bills = [];
    }
  }

  async function openTable(t: RestoTable) {
    if (t.status === 'OCCUPIED' && t.order_id) {
      await attachOrder(t.order_id, t.code);
      return;
    }
    if (t.status === 'OCCUPIED' && !t.order_id) {
      // Drift: marked OCCUPIED but no OPEN order behind it (e.g. old data or a
      // crash) — offer to free it so the floor does not get permanently stuck.
      if (confirm(`Meja ${t.code} terisi tapi tidak punya order aktif. Kosongkan meja ini?`)) {
        await forceFreeTable(t);
      }
      return;
    }
    if (t.status !== 'FREE') return;
    if (!canOrder) return;
    const guests = Number(prompt('Jumlah tamu:', '2') ?? '2') || 2;
    try {
      const { data } = await post<Order>('/resto/orders/open', { table_id: t.id, guests });
      order = data;
      orderTableCode = t.code;
      await loadFloor();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function forceFreeTable(t: RestoTable) {
    try {
      await patch(`/resto/tables/${t.id}`, { status: 'FREE' });
      toastSuccess(`Meja ${t.code} dikosongkan`);
      await loadFloor();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function attachOrder(orderId: string, code: string) {
    try {
      const { data } = await get<Order>(`/resto/orders/${orderId}`);
      order = data;
      orderTableCode = code;
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  function closePanel() {
    order = null;
    orderTableCode = '';
  }

  async function addItem(p: Product) {
    if (!order || busy) return;
    busy = true;
    try {
      const { data } = await post<Order>(`/resto/orders/${order.id}/items`, { items: [{ product_id: p.id, quantity: 1 }] });
      order = data;
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function changeQty(item: OrderItem, delta: number) {
    if (!order || busy) return;
    busy = true;
    try {
      if (item.quantity + delta <= 0) {
        order = (await del<Order>(`/resto/orders/${order.id}/items/${item.id}`)).data;
      } else {
        order = (await patch<Order>(`/resto/orders/${order.id}/items/${item.id}`, { quantity: item.quantity + delta })).data;
      }
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      busy = false;
    }
  }

  /** Open the payment modal: load the authoritative server preview first, then
   * prefill the cash field with the exact grand total. */
  async function openPay() {
    if (!order) return;
    try {
      preview = (await get<BillPreview>(`/resto/orders/${order.id}/bill`)).data;
    } catch (e) {
      toastError((e as Error).message);
      return;
    }
    orderDiscount = 0;
    discountType = 'NOMINAL';
    amountPaid = Number.parseFloat(preview.grand_total);
    showPay = true;
  }

  /** What settle will actually charge: the server preview grand total (includes
   * tax + Rp 100 rounding), NOT subtotal-discount — validating against the wrong
   * number is what let the API reject an already-confirmed payment. */
  const chargeTotal = $derived(preview ? Number.parseFloat(preview.grand_total) : 0);

  /** Re-preview (debounced) when the cashier edits the discount. */
  let previewTimeout: ReturnType<typeof setTimeout> | undefined;
  function onDiscountInput() {
    if (!order) return;
    const orderId = order.id;
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(async () => {
      try {
        const q = orderDiscount > 0 ? `?discount=${orderDiscount}&discount_type=${discountType}` : '';
        preview = (await get<BillPreview>(`/resto/orders/${orderId}/bill${q}`)).data;
      } catch {
        /* keep last preview */
      }
    }, 300);
  }

  async function settle() {
    if (!order || processing) return;
    processing = true;
    try {
      const { data } = await post<{ sale: { invoice_number: string; grand_total: string; payments: { method: string; amount: string }[] } }>(
        `/resto/orders/${order.id}/settle`,
        {
          method: payMethod,
          amount_paid: amountPaid,
          discount: orderDiscount > 0 ? orderDiscount : undefined,
          discount_type: orderDiscount > 0 ? discountType : undefined,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      receipt = data;
      showPay = false;
      closePanel();
      await Promise.all([loadFloor(), loadBills()]);
      toastSuccess(`Transaksi ${data.sale.invoice_number} berhasil`);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      processing = false;
    }
  }

  async function voidOrder() {
    if (!order) return;
    const reason = prompt('Alasan void (wajib, minimal 3 karakter):\ncth: tamu pergi tanpa bayar, salah buka meja');
    if (!reason || reason.trim().length < 3) return;
    if (!confirm(`Void order meja ${orderTableCode}? Meja akan langsung dikosongkan.`)) return;
    try {
      await post(`/resto/orders/${order.id}/void`, { reason: reason.trim() });
      toastSuccess('Order di-void — meja dikosongkan');
      closePanel();
      await loadFloor();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  /** Recovery: bill was actually PAID (invoice exists) but the order stayed OPEN
   * (e.g. a crash during settle). Links the sale and frees the table without
   * charging again. */
  async function relinkOrder() {
    if (!order) return;
    const invoice = prompt(
      `Meja ${orderTableCode} sudah dibayar tapi order belum tertutup?\nMasukkan nomor invoice dari struk (cth: INV-20260914-000001):`,
    );
    if (!invoice?.trim()) return;
    try {
      await post(`/resto/orders/${order.id}/relink`, { invoice_number: invoice.trim() });
      toastSuccess('Order ditutup — meja dikosongkan');
      closePanel();
      await loadFloor();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function cancelOrder() {
    if (!order || !confirm('Batalkan order ini? Semua item belum terkirim dapur akan dibuang.')) return;
    try {
      await post(`/resto/orders/${order.id}/cancel`, {});
      toastSuccess('Order dibatalkan');
      closePanel();
      await loadFloor();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  onMount(async () => {
    try {
      const [p] = await Promise.all([get<Product[]>('/products?active=true&limit=100'), loadFloor(), loadBills()]);
      // Resto channel only — retail-only products are hidden here.
      products = (p.data as (Product & { available_resto?: boolean })[]).filter((x) => x.available_resto !== false);
    } catch (e) {
      toastError((e as Error).message);
    }
  });

  // Keep the payment queue fresh while the cashier screen is open.
  let billPoll: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    billPoll = setInterval(() => void loadBills(), 10_000);
  });
  onDestroy(() => clearInterval(billPoll));
</script>

<div class="pos-resto">
  <div class="resto-main">
    <div class="floor-header">
      <h2><Icon icon="mdi:silverware-fork-knife" width="18" height="18" /> Denah Meja</h2>
      <input class="search" placeholder="Cari menu…" bind:value={search} />
    </div>
    <div class="floor-scroll">
      {#each areas as area (area.id)}
        <section>
          <h3 class="area-name">{area.name}</h3>
          <div class="table-grid">
            {#each tables.filter((t) => t.area_id === area.id) as t (t.id)}
              <button
                class="floor-table {t.status.toLowerCase()}"
                onclick={() => openTable(t)}
                disabled={t.status === 'RESERVED'}
                title={t.status === 'OCCUPIED' ? 'Buka bill aktif' : 'Open bill'}
              >
                <span class="ft-code">{t.code}</span>
                <span class="ft-meta">{t.guests ? `${t.guests} tamu` : `${t.seats} kursi`}</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
      <section>
        <h3 class="area-name">Tanpa Area</h3>
        <div class="table-grid">
          {#each tables.filter((t) => !t.area_id) as t (t.id)}
            <button class="floor-table {t.status.toLowerCase()}" onclick={() => openTable(t)} disabled={t.status === 'RESERVED'}>
              <span class="ft-code">{t.code}</span>
              <span class="ft-meta">{t.guests ? `${t.guests} tamu` : `${t.seats} kursi`}</span>
            </button>
          {/each}
        </div>
      </section>
    </div>

    <!-- Bill aktif: part of the normal flow BELOW the floor plan, so it can never
         cover the Denah Meja. -->
    {#if bills.length > 0}
      <section class="bills-strip">
        <h4><Icon icon="mdi:receipt-text-clock-outline" width="14" height="14" /> Bill Aktif</h4>
        <div class="bills-scroll">
          {#each bills as b (b.id)}
            <button
              class="bill-chip {b.served_items >= b.items && b.items > 0 ? 'ready' : ''}"
              onclick={() => openTable({ id: b.table_id, code: b.table_code, seats: 0, status: 'OCCUPIED', area_id: null, order_id: b.id, guests: b.guests } as RestoTable)}
              title="Buka bill meja {b.table_code}"
            >
              <span class="bc-code">{b.table_code}</span>
              <span class="bc-sum">{formatIDR(b.subtotal)}</span>
              {#if b.served_items >= b.items && b.items > 0}
                <span class="bc-flag">siap bayar</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>

  {#if order}
    <aside class="order-panel card">
      <div class="op-head">
        <h3>Meja {orderTableCode} · {order.guests} tamu</h3>
        <button class="icon-only" aria-label="Tutup" onclick={closePanel}><Icon icon="mdi:close" width="16" height="16" /></button>
      </div>
      {#if canSettle}
        <button class="relink-link" onclick={relinkOrder} title="Order sudah dibayar tapi belum tertutup (mis. error saat settle)">
          <Icon icon="mdi:link-variant" width="13" height="13" /> Sudah bayar? Hubungkan invoice
        </button>
      {/if}
      {#if allServed && canSettle}
        <div class="served-banner">
          <Icon icon="mdi:check-decagram" width="15" height="15" />
          Semua item sudah diantar — tinggal tutup bill (BAYAR).
        </div>
      {:else if sentNotServed > 0}
        <div class="cooking-banner">
          <Icon icon="mdi:pot-steam" width="15" height="15" />
          {sentNotServed} item masih disiapkan dapur.
        </div>
      {/if}
      <div class="op-items">
        {#each order.items as item (item.id)}
          <div class="op-line">
            <div class="op-info">
              <div>{item.product_name}</div>
              <div class="muted small">
                {formatIDR(item.unit_price)}
                {#if item.notes}<span class="note"> · {item.notes}</span>{/if}
                {#if item.kitchen_status !== 'QUEUED'}<span class="badge green small-badge">dapur</span>{/if}
              </div>
            </div>
            <div class="op-qty">
              {#if canOrder && item.kitchen_status === 'QUEUED'}
                <button onclick={() => changeQty(item, -1)}>−</button>
              {/if}
              <span>{item.quantity}</span>
              {#if canOrder && item.kitchen_status === 'QUEUED'}
                <button onclick={() => changeQty(item, +1)}>+</button>
              {/if}
            </div>
            <div class="op-sum">{formatIDR(Number(item.unit_price) * item.quantity)}</div>
          </div>
        {:else}
          <p class="muted">Belum ada item — pilih dari daftar menu.</p>
        {/each}
      </div>
      <div class="op-total">
        <span>Subtotal</span><strong>{formatIDR(subtotal)}</strong>
      </div>
      <div class="op-actions">
        {#if canOrder}
          <button class="danger" onclick={cancelOrder} disabled={busy}>Batal Order</button>
        {/if}
        {#if canVoid}
          <button class="danger" onclick={voidOrder} disabled={busy} title="Tutup paksa: tamu pergi tanpa bayar / salah buka">Void</button>
        {/if}
        {#if canOrder}
          <button onclick={sendToKitchen} disabled={busy || queuedCount === 0} class="send-btn">
            Kirim Dapur{queuedCount > 0 ? ` (${queuedCount})` : ''}
          </button>
        {/if}
        {#if canSettle}
          <button class="primary" onclick={openPay} disabled={order.items.length === 0}>
            {allServed ? 'BAYAR / TUTUP BILL' : 'BAYAR'}
          </button>
        {:else if order.items.length > 0}
          <span class="muted small perm-hint" title="Butuh permission resto.settle">
            <Icon icon="mdi:lock-outline" width="12" height="12" /> Butuh akses kasir
          </span>
        {/if}
      </div>
    </aside>
  {/if}

  <div class="menu-panel">
    <div class="menu-grid">
      {#each filtered as p (p.id)}
        <button class="menu-card card" onclick={() => addItem(p)} disabled={!order || busy || p.stock <= 0}>
          <div class="mc-name">{p.name}</div>
          <div class="mc-price">{formatIDR(p.selling_price)}</div>
        </button>
      {:else}
        <p class="muted">Tidak ada menu.</p>
      {/each}
    </div>
    {#if !order}
      <p class="muted hint">Pilih meja untuk memulai order.</p>
    {/if}
  </div>
</div>

{#if showPay && order}
  <div class="overlay" role="dialog">
    <div class="modal card">
      <h2>Settlement — Meja {orderTableCode}</h2>
      <div class="grand-line">Subtotal: <strong>{formatIDR(subtotal)}</strong></div>
      <label for="r-disc">Diskon (Rp)</label>
      <input id="r-disc" type="number" min="0" max={subtotal} bind:value={orderDiscount} />
      <label for="r-paid">Uang Dibayarkan</label>
      <input id="r-paid" type="number" min="0" bind:value={amountPaid} />
      <label for="r-method">Metode</label>
      <select id="r-method" bind:value={payMethod}>
        <option value="CASH">Tunai</option>
        <option value="TRANSFER" hidden>Transfer</option>
        <option value="CARD" hidden>Kartu</option>
        <option value="QRIS" hidden>QRIS</option>
      </select>
      {#if preview}
        <div class="ps-row total-row">
          <span>Total Bayar{preview.tax_rate > 0 ? ` (pajak ${preview.tax_rate}% + pembulatan)` : ''}</span>
          <strong>{formatIDR(chargeTotal)}</strong>
        </div>
        {#if Number.parseFloat(preview.discount) > 0 || preview.rounding !== '0.00'}
          <div class="ps-row muted small">
            <span>Diskon {preview.tax_rate > 0 ? `· Pajak ${formatIDR(preview.tax)}` : ''} {Number.parseFloat(preview.rounding) !== 0 ? `· Pembulatan ${formatIDR(preview.rounding)}` : ''}</span>
            <span>-{formatIDR(preview.discount)}</span>
          </div>
        {/if}
      {/if}
      <div class="ps-row"><span>Kembalian</span><span>{formatIDR(changeDue)}</span></div>
      {#if amountPaid < chargeTotal}
        <p class="error-text">Uang kurang dari total.</p>
      {/if}
      <div class="actions">
        <button onclick={() => (showPay = false)}>Batal</button>
        <button class="primary" onclick={settle} disabled={processing || amountPaid < chargeTotal}>
          {processing ? 'Memproses…' : 'Settle'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pos-resto {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-areas: 'main panel' 'menu panel';
    gap: 1rem;
    padding: 1.2rem 1.4rem;
    min-height: 100vh;
  }

  .resto-main { grid-area: main; }
  .order-panel { grid-area: panel; align-self: start; position: sticky; top: 1rem; }
  .menu-panel { grid-area: menu; }
  .floor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.8rem;
  }
  .floor-header h2 {
    margin: 0;
    font-size: 1.05rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .search { max-width: 260px; }
  .floor-scroll section { margin-bottom: 1rem; }
  .area-name {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    margin: 0 0 0.4rem;
  }
  .table-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.6rem;
  }
  .floor-table {
    flex-direction: column;
    padding: 0.9rem 0.5rem;
    gap: 0.2rem;
    border-left: 4px solid var(--green);
  }
  .floor-table.occupied { border-left-color: var(--red); background: rgba(255, 92, 92, 0.08); }
  .floor-table.reserved { border-left-color: var(--amber); }
  .ft-code { font-weight: 700; font-size: 1rem; }
  .ft-meta { font-size: 0.72rem; color: var(--text-dim); }
  .menu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .menu-card { text-align: left; padding: 0.6rem 0.7rem; }
  .mc-name { font-weight: 600; font-size: 0.85rem; }
  .mc-price { color: var(--green); font-weight: 700; font-size: 0.85rem; }
  .hint { margin-top: 0.6rem; font-size: 0.85rem; }
  .op-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }
  .relink-link {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.25rem;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: var(--amber);
    background: transparent;
    border: 1px dashed var(--amber);
    border-radius: var(--radius, 8px);
  }
  .served-banner,
  .cooking-banner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
    margin-bottom: 0.5rem;
    border-radius: var(--radius, 8px);
    font-size: 0.78rem;
  }
  .served-banner {
    color: var(--green);
    background: rgba(46, 204, 113, 0.1);
    border: 1px solid var(--green);
  }
  .cooking-banner {
    color: var(--amber);
    background: rgba(241, 196, 15, 0.08);
    border: 1px dashed var(--amber);
  }
  /* Normal-flow section below the floor plan — no overlay, never covers tables. */
  .bills-strip {
    margin-top: 0.4rem;
    padding: 0.55rem 0.7rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    background: var(--bg-soft, rgba(255, 255, 255, 0.03));
  }
  .bills-strip h4 {
    margin: 0 0 0.4rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .bills-scroll {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .bill-chip {
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--red);
    border-radius: var(--radius, 8px);
    font-size: 0.75rem;
  }
  .bill-chip.ready {
    border-color: var(--green);
    background: rgba(46, 204, 113, 0.08);
  }
  .bill-chip .bc-code {
    font-weight: 700;
  }
  .bill-chip .bc-sum {
    color: var(--text-dim);
    font-size: 0.7rem;
  }
  .bill-chip .bc-flag {
    font-size: 0.62rem;
    color: var(--green);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .perm-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    align-self: center;
  }
  .total-row {
    font-size: 1.05rem;
    padding-top: 0.3rem;
  }
  .op-head h3 { margin: 0; font-size: 1rem; }
  .op-items { max-height: 44vh; overflow-y: auto; }
  .op-line {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.88rem;
  }
  .op-qty { display: flex; align-items: center; gap: 0.35rem; }
  .op-qty button { padding: 0.05rem 0.45rem; }
  .op-sum { font-weight: 600; }
  .note { color: var(--amber); }
  .small-badge { font-size: 0.62rem; padding: 0.05rem 0.35rem; margin-left: 0.3rem; }
  .op-total {
    display: flex;
    justify-content: space-between;
    padding: 0.6rem 0;
    font-size: 1.05rem;
    border-top: 1px solid var(--border);
    margin-top: 0.4rem;
  }
  .op-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .op-actions button { flex: 1; min-width: 100px; }
  .send-btn { border-color: var(--accent); color: var(--accent); }
  .grand-line { margin-bottom: 0.4rem; font-size: 1.05rem; }
  .ps-row { display: flex; justify-content: space-between; padding: 0.2rem 0; }
  .actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
  @media (max-width: 900px) {
    .pos-resto { grid-template-columns: 1fr; grid-template-areas: 'main' 'menu' 'panel'; }
    .order-panel { position: static; }
  }
</style>
