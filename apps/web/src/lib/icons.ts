/** Menu icon helpers.
 * Menus store an Iconify name (e.g. "mdi:cart-outline"). The sidebar renders it via
 * <Icon> from @iconify/svelte (loaded on demand from the Iconify API and cached).
 * Legacy emoji values are still supported as plain-text fallback.
 */
import Icon from '@iconify/svelte';

export { Icon };

/** True when the stored icon value is an Iconify name ("prefix:name"). */
export function isIconifyName(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-z0-9-]+:[a-z0-9-]+$/i.test(value.trim()));
}

/**
 * Curated icon choices for the menu picker (Iconify MDI set).
 * Every name here has been verified to exist in the Iconify API
 * (invalid names render as empty previews).
 */
export const ICON_CHOICES: { name: string; keywords: string }[] = [
  // Dashboard & umum
  { name: 'mdi:view-dashboard-outline', keywords: 'dashboard beranda home dasbor' },
  { name: 'mdi:monitor-dashboard', keywords: 'dashboard monitor beranda dasbor' },
  { name: 'mdi:view-grid-outline', keywords: 'grid aplikasi apps menu semuanya' },
  { name: 'mdi:apps', keywords: 'apps aplikasi grid menu' },
  { name: 'mdi:compass-outline', keywords: 'menu navigasi compass kompas' },
  { name: 'mdi:star-outline', keywords: 'favorit penting star bintang' },
  { name: 'mdi:bell-outline', keywords: 'notifikasi alert bell lonceng' },
  { name: 'mdi:logout', keywords: 'logout keluar keluar signout' },

  // POS / penjualan
  { name: 'mdi:point-of-sale', keywords: 'pos kasir cash register mesin' },
  { name: 'mdi:cash-register', keywords: 'pos kasir cash register mesin' },
  { name: 'mdi:cart-outline', keywords: 'pos kasir cart keranjang jual belanja' },
  { name: 'mdi:cart-plus', keywords: 'tambah tambah keranjang cart add' },
  { name: 'mdi:receipt-text-outline', keywords: 'sales invoice receipt struk transaksi nota' },
  { name: 'mdi:invoice-text-check-outline', keywords: 'invoice tagihan struk lunas sales' },
  { name: 'mdi:printer', keywords: 'print cetak printer struk' },
  { name: 'mdi:printer-pos', keywords: 'print cetak struk kasir pos' },
  { name: 'mdi:cash-multiple', keywords: 'payment pembayaran uang cash duit' },
  { name: 'mdi:cash-100', keywords: 'payment uang cash duit nominal' },
  { name: 'mdi:credit-card-outline', keywords: 'payment kartu kredit debit card' },
  { name: 'mdi:wallet-outline', keywords: 'dompet wallet pembayaran uang' },
  { name: 'mdi:bank-outline', keywords: 'bank transfer pembayaran' },
  { name: 'mdi:calculator', keywords: 'kalkulator hitung calculator' },
  { name: 'mdi:swap-horizontal', keywords: 'retur return tukar exchange tukar' },
  { name: 'mdi:sale-outline', keywords: 'diskon promo sale discount' },
  { name: 'mdi:ticket-percent-outline', keywords: 'diskon promo voucher kupon coupon' },
  { name: 'mdi:coupon-outline', keywords: 'diskon promo voucher kupon coupon' },
  { name: 'mdi:percent-outline', keywords: 'persen diskon percent pajak' },
  { name: 'mdi:scale-balance', keywords: 'timbangan pajak tax balance laporan' },
  { name: 'mdi:gift-outline', keywords: 'hadiah gift loyalty bonus' },

  // Produk & stok
  { name: 'mdi:package-variant-closed', keywords: 'product produk barang package kotak' },
  { name: 'mdi:package-variant', keywords: 'product produk barang package' },
  { name: 'mdi:cube-outline', keywords: 'produk barang kubus cube item' },
  { name: 'mdi:tag-outline', keywords: 'inventory stok tag label harga' },
  { name: 'mdi:tag-multiple-outline', keywords: 'kategori kategori tags label banyak' },
  { name: 'mdi:barcode', keywords: 'barcode stok produk scan' },
  { name: 'mdi:barcode-scan', keywords: 'scan barcode pindai kasir' },
  { name: 'mdi:qrcode', keywords: 'qr code qrcode pindai' },
  { name: 'mdi:warehouse', keywords: 'inventory gudang warehouse stok' },
  { name: 'mdi:store-outline', keywords: 'toko store toko shop' },
  { name: 'mdi:home-city-outline', keywords: 'toko outlet cabang store' },
  { name: 'mdi:archive-outline', keywords: 'arsip stok gudang archive simpan' },
  { name: 'mdi:truck-outline', keywords: 'supplier vendor truck kirim pengiriman' },
  { name: 'mdi:clipboard-list-outline', keywords: 'opname stok list catatan stock' },
  { name: 'mdi:clipboard-check-outline', keywords: 'opname selesai stok cek stock' },

  // Pelanggan & orang
  { name: 'mdi:account-outline', keywords: 'user pengguna akun account orang' },
  { name: 'mdi:account-multiple-outline', keywords: 'users user pelanggan orang banyak' },
  { name: 'mdi:account-group-outline', keywords: 'customer pelanggan group orang tim' },
  { name: 'mdi:account-key-outline', keywords: 'users user manajemen akun kunci' },
  { name: 'mdi:account-cog-outline', keywords: 'user pengaturan akun admin profil' },
  { name: 'mdi:shield-account-outline', keywords: 'role permission hak akses shield' },
  { name: 'mdi:shield-check-outline', keywords: 'aman verifikasi hak akses shield' },
  { name: 'mdi:shield-lock-outline', keywords: 'keamanan password kunci shield' },
  { name: 'mdi:shield-sync-outline', keywords: 'sinkron peran role permission' },

  // Laporan
  { name: 'mdi:chart-box-outline', keywords: 'report laporan chart grafik' },
  { name: 'mdi:chart-bar', keywords: 'report laporan chart batang grafik' },
  { name: 'mdi:chart-line', keywords: 'report laporan grafik garis trend' },
  { name: 'mdi:chart-areaspline', keywords: 'laporan area grafik chart' },
  { name: 'mdi:finance', keywords: 'keuangan laporan finance chart' },
  { name: 'mdi:trending-up', keywords: 'pertumbuhan trend naik laporan' },
  { name: 'mdi:poll', keywords: 'laporan polling statistik grafik' },
  { name: 'mdi:file-chart-outline', keywords: 'report laporan pajak file dokumen' },
  { name: 'mdi:file-document-outline', keywords: 'dokumen file laporan nota' },

  // Sistem
  { name: 'mdi:database-outline', keywords: 'master data database' },
  { name: 'mdi:database-cog-outline', keywords: 'master data database pengaturan' },
  { name: 'mdi:folder-multiple-outline', keywords: 'grup group folder kategori' },
  { name: 'mdi:folder-cog-outline', keywords: 'grup sistem folder setelan' },
  { name: 'mdi:file-cog-outline', keywords: 'dokumen sistem pengaturan file' },
  { name: 'mdi:store-cog-outline', keywords: 'toko pengaturan toko sistem' },
  { name: 'mdi:cog-outline', keywords: 'settings sistem pengaturan gear' },
  { name: 'mdi:cog-transfer-outline', keywords: 'pengaturan sistem transfer gear' },
  { name: 'mdi:tune', keywords: 'settings pengaturan setelan tune' },
  { name: 'mdi:briefcase-outline', keywords: 'transaksi bisnis work koper' },
  { name: 'mdi:calendar-clock', keywords: 'jadwal riwayat waktu kalender' },
  { name: 'mdi:history', keywords: 'audit riwayat log history' },
  { name: 'mdi:text-box-search-outline', keywords: 'audit log riwayat pencarian' },
];

/** Search the picker: match icon name or any individual keyword. */
export function filterIconChoices(query: string): typeof ICON_CHOICES {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_CHOICES;
  return ICON_CHOICES.filter(
    (c) => c.name.includes(q) || c.keywords.split(' ').some((w) => w.includes(q)),
  );
}

/** Normalize stored icon input: trim; empty -> null. */
export function normalizeIconInput(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}
