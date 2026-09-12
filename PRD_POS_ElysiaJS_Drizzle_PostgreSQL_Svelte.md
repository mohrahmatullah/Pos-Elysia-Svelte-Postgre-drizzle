# PRD — Sistem POS (Point of Sale)

**Versi:** 1.0  
**Status:** Draft / Ready for Development  
**Tanggal:** 12 September 2026

---

## 1. Ringkasan Produk

Sistem POS adalah aplikasi point-of-sale untuk membantu toko/retail mengelola produk, stok, transaksi penjualan, pembayaran, pelanggan, pengguna/kasir, dan laporan operasional dalam satu sistem.

Arsitektur aplikasi menggunakan:

- **Backend:** ElysiaJS berjalan di atas Bun
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL
- **Frontend:** SvelteKit / Svelte
- **API:** REST API berbasis JSON
- **Authentication:** JWT dengan refresh-token/session strategy
- **Validation:** Schema validation di boundary API
- **Deployment:** Containerized deployment menggunakan Docker

Produk dirancang agar dapat digunakan untuk satu toko terlebih dahulu, tetapi struktur data dan arsitektur harus memungkinkan pengembangan multi-outlet di masa depan.

---

## 2. Tujuan Produk

### 2.1 Tujuan Utama

1. Mempercepat proses transaksi kasir.
2. Mengurangi kesalahan pencatatan penjualan dan stok.
3. Menyediakan informasi stok secara real-time.
4. Memudahkan pemilik/manager memantau penjualan.
5. Menyediakan laporan operasional yang dapat digunakan untuk pengambilan keputusan.
6. Menyediakan fondasi teknis yang mudah dikembangkan dan dipelihara.

### 2.2 Success Metrics

Target MVP:

| Metric | Target |
|---|---:|
| Waktu membuat transaksi sederhana | < 30 detik |
| Keberhasilan transaksi tanpa error | > 99% |
| Perubahan stok setelah transaksi | Konsisten/atomic |
| Waktu membuka halaman POS | < 2 detik pada jaringan normal |
| Waktu response API transaksi | p95 < 500 ms |
| Selisih stok akibat sistem | 0 transaksi tidak tercatat |

---

## 3. Scope

### 3.1 MVP

MVP mencakup:

- Authentication
- Role & permission dasar
- Dashboard
- Product management
- Category management
- Unit/SKU/barcode
- Inventory & stock adjustment
- POS/cart
- Sales transaction
- Payment
- Receipt
- Customer
- Sales history
- Basic reports
- Audit log
- Store/settings

### 3.2 Out of Scope MVP

Fitur berikut tidak wajib pada MVP:

- Accounting penuh
- Payroll
- Supplier invoice kompleks
- Purchase order kompleks
- Loyalty point
- Multi-currency kompleks
- Offline-first penuh
- Integrasi marketplace
- Integrasi payment gateway spesifik
- Advanced warehouse management
- AI forecasting

Fitur tersebut dapat menjadi fase berikutnya.

---

## 4. User Roles

### 4.1 Owner

Hak akses:

- Semua fitur
- User management
- Role/permission
- Product
- Inventory
- Sales
- Reports
- Settings
- Audit log

### 4.2 Manager

Hak akses:

- Dashboard
- Product
- Inventory
- Sales
- Customer
- Reports
- Sebagian settings

Tidak dapat mengubah konfigurasi owner/security tertentu.

### 4.3 Cashier

Hak akses:

- Membuka POS
- Scan/search product
- Membuat transaksi
- Menerima pembayaran
- Cetak/lihat receipt
- Melihat transaksi miliknya
- Customer lookup/create

Tidak dapat:

- Menghapus produk
- Mengubah stok manual
- Melihat laporan sensitif
- Mengelola user

---

# 5. Functional Requirements

## 5.1 Authentication

Sistem harus menyediakan:

- Login
- Logout
- Refresh session/token
- Password hashing
- Session/token expiry
- Protected API routes
- Role-based authorization

### Acceptance Criteria

- User valid dapat login.
- User invalid mendapat error yang aman.
- Password tidak pernah disimpan plaintext.
- Endpoint sensitif menolak request tanpa authorization.
- Logout mengakhiri session/token yang relevan.

---

## 5.2 User Management

Owner/authorized manager dapat:

- Melihat daftar user
- Membuat user
- Mengubah user
- Mengaktifkan/menonaktifkan user
- Mengatur role
- Reset password

Data minimum:

- id
- name
- username/email
- password_hash
- role_id
- status
- created_at
- updated_at

---

## 5.3 Product Management

Admin/manager dapat:

- Membuat produk
- Edit produk
- Menonaktifkan produk
- Search produk
- Filter kategori
- Filter status
- Mengatur harga jual
- Mengatur harga modal
- Mengatur barcode/SKU
- Mengatur minimum stock

Data produk minimum:

- id
- SKU
- barcode
- name
- description
- category_id
- unit
- cost_price
- selling_price
- minimum_stock
- tax configuration
- active status
- timestamps

### Business Rules

- SKU harus unik dalam scope store.
- Barcode harus unik jika diisi.
- Harga tidak boleh negatif.
- Produk inactive tidak dapat dijual pada transaksi baru.

---

## 5.4 Category Management

Fitur:

- Create category
- Edit category
- Activate/deactivate category
- Search category

Category memiliki:

- id
- name
- description
- active
- timestamps

---

## 5.5 Inventory

Sistem harus mencatat stok melalui **stock movement**, bukan hanya menyimpan angka stok akhir.

Jenis movement:

- INITIAL
- PURCHASE
- SALE
- SALE_RETURN
- ADJUSTMENT_IN
- ADJUSTMENT_OUT
- DAMAGE
- STOCK_OPNAME

Data minimum:

- product_id
- quantity
- movement_type
- reference_type
- reference_id
- note
- created_by
- created_at

### Business Rules

- Penjualan mengurangi stok.
- Return penjualan menambah stok.
- Adjustment harus memiliki alasan.
- Semua perubahan stok harus dapat ditelusuri.
- Transaksi stok dan transaksi penjualan harus atomic.

### Stock Formula

```text
current_stock =
SUM(stock_movement.quantity_in)
-
SUM(stock_movement.quantity_out)
```

Implementasi dapat menggunakan tabel balance/cache untuk performa, tetapi source of truth harus tetap dapat diaudit melalui movement.

---

## 5.6 Stock Adjustment

Authorized user dapat:

- Menambah stok
- Mengurangi stok
- Melakukan stock opname
- Memberikan alasan adjustment

Contoh alasan:

- Barang rusak
- Barang hilang
- Selisih opname
- Koreksi input

Setiap adjustment menghasilkan stock movement.

---

# 6. POS / Sales

## 6.1 Cart

Kasir dapat:

- Search product
- Scan barcode
- Add item
- Remove item
- Update quantity
- Menggunakan customer
- Menggunakan discount jika memiliki permission
- Melihat subtotal
- Melihat tax
- Melihat discount
- Melihat grand total

### Cart Item

```text
product_id
product_name_snapshot
sku_snapshot
price_snapshot
quantity
discount
tax
subtotal
```

Harga/name yang digunakan dalam transaksi harus disimpan sebagai **snapshot** sehingga histori transaksi tidak berubah ketika master product berubah.

---

## 6.2 Checkout

Checkout harus:

1. Validasi cart.
2. Validasi product aktif.
3. Validasi stock.
4. Hitung ulang subtotal di server.
5. Hitung discount di server.
6. Hitung tax di server.
7. Hitung grand total di server.
8. Validasi payment.
9. Create sale.
10. Create sale items.
11. Create payment.
12. Create stock movements.
13. Commit database transaction.

Semua proses nomor 9–12 harus berada dalam satu database transaction.

---

## 6.3 Transaction Number

Format contoh:

```text
INV-20260912-000001
```

Nomor transaksi harus:

- Unique
- Tidak berubah
- Mudah dibaca
- Dapat dicari

---

## 6.4 Payment

MVP minimal mendukung:

- CASH
- TRANSFER
- CARD
- QRIS

Struktur payment:

```text
payment_id
sale_id
method
amount
reference_number
paid_at
```

Untuk cash:

```text
change = amount_paid - grand_total
```

Sistem harus menolak pembayaran kurang dari total transaksi kecuali mode pembayaran parsial memang diaktifkan.

---

## 6.5 Receipt

Receipt menampilkan:

- Nama toko
- Alamat
- Nomor transaksi
- Tanggal/waktu
- Kasir
- Item
- Quantity
- Harga
- Discount
- Tax
- Grand total
- Payment method
- Amount paid
- Change

MVP dapat mendukung:

- Print browser
- Thermal printer melalui browser/print integration

---

# 7. Sales Return

Fitur return minimal:

- Search transaction
- Select item
- Input return quantity
- Validasi quantity tidak melebihi quantity yang dapat diretur
- Input alasan
- Refund amount
- Stock kembali

Return harus memiliki reference ke transaksi asli.

---

# 8. Customer

Fitur:

- Create customer
- Edit customer
- Search customer
- View customer transaction history

Data:

- id
- name
- phone
- email
- address
- notes
- timestamps

Customer tidak wajib untuk transaksi walk-in.

---

# 9. Dashboard

Dashboard menampilkan:

- Sales today
- Number of transactions
- Average transaction value
- Gross sales
- Discount
- Tax
- Net sales
- Low-stock products
- Top-selling products
- Sales trend

Filter:

- Today
- Yesterday
- This week
- This month
- Custom range

---

# 10. Reports

## 10.1 Sales Report

Filter:

- Date range
- Cashier
- Payment method
- Product
- Category

Output:

- Total transactions
- Gross sales
- Discount
- Tax
- Net sales

## 10.2 Product Sales Report

Menampilkan:

- Product
- Quantity sold
- Revenue
- Discount
- Net revenue

## 10.3 Payment Report

Menampilkan total berdasarkan:

- Cash
- Transfer
- Card
- QRIS

## 10.4 Stock Report

Menampilkan:

- Product
- Current stock
- Minimum stock
- Stock status

## 10.5 Cashier Report

Menampilkan performa transaksi per cashier.

---

# 11. Audit Log

Aksi penting harus tercatat.

Contoh:

- LOGIN
- LOGOUT
- CREATE_PRODUCT
- UPDATE_PRODUCT
- CREATE_SALE
- CANCEL_SALE
- CREATE_RETURN
- STOCK_ADJUSTMENT
- CREATE_USER
- UPDATE_USER

Data:

```text
id
user_id
action
entity_type
entity_id
metadata
ip_address
user_agent
created_at
```

Metadata tidak boleh menyimpan password, token, atau data sensitif.

---

# 12. Store Settings

Settings minimal:

- Store name
- Store address
- Phone
- Receipt footer
- Currency
- Tax configuration
- Invoice prefix
- Timezone

Default timezone:

```text
Asia/Jakarta
```

Currency:

```text
IDR
```

---

# 13. Database Design

Database menggunakan PostgreSQL dan Drizzle ORM.

## 13.1 Core Tables

### users

```text
id
store_id
role_id
name
email
password_hash
status
created_at
updated_at
```

### roles

```text
id
name
created_at
updated_at
```

### stores

```text
id
name
address
phone
currency
timezone
created_at
updated_at
```

### products

```text
id
store_id
category_id
sku
barcode
name
description
unit
cost_price
selling_price
minimum_stock
tax_rate
active
created_at
updated_at
```

### categories

```text
id
store_id
name
description
active
created_at
updated_at
```

### customers

```text
id
store_id
name
phone
email
address
notes
created_at
updated_at
```

### sales

```text
id
store_id
customer_id
cashier_id
invoice_number
status
subtotal
discount
tax
grand_total
created_at
updated_at
```

### sale_items

```text
id
sale_id
product_id
product_name
sku
unit_price
quantity
discount
tax
subtotal
created_at
```

### payments

```text
id
sale_id
method
amount
reference_number
paid_at
created_at
```

### stock_movements

```text
id
store_id
product_id
movement_type
quantity_in
quantity_out
reference_type
reference_id
note
created_by
created_at
```

### audit_logs

```text
id
store_id
user_id
action
entity_type
entity_id
metadata
ip_address
user_agent
created_at
```

---

# 14. Database Constraints

Wajib menggunakan database constraints untuk menjaga integritas.

Contoh:

- Unique `(store_id, sku)`
- Unique `(store_id, barcode)` jika barcode tersedia
- Unique `(store_id, invoice_number)`
- Foreign key antar entity
- Numeric check untuk harga >= 0
- Quantity > 0 pada sale item
- Status menggunakan enum/controlled value
- Index pada field pencarian utama

---

# 15. Indexing

Index minimum:

```text
products(store_id)
products(store_id, sku)
products(store_id, barcode)
products(store_id, category_id)
products(store_id, active)

sales(store_id, created_at)
sales(store_id, invoice_number)
sales(store_id, cashier_id)

sale_items(sale_id)
sale_items(product_id)

stock_movements(store_id, product_id, created_at)

customers(store_id, phone)
```

Gunakan PostgreSQL full-text search atau trigram index jika pencarian nama produk membutuhkan performa tinggi.

---

# 16. Backend Architecture

Backend menggunakan:

- Bun
- ElysiaJS
- Drizzle ORM
- PostgreSQL

Struktur yang direkomendasikan:

```text
apps/
  api/
    src/
      config/
      db/
        schema/
        migrations/
        index.ts
      modules/
        auth/
        users/
        products/
        categories/
        inventory/
        sales/
        payments/
        customers/
        reports/
        settings/
      middleware/
      lib/
      utils/
      app.ts
      server.ts
```

Gunakan pendekatan modular berdasarkan domain, bukan satu folder controller besar.

---

# 17. Backend Layering

Setiap module dapat menggunakan pola:

```text
route
  ↓
controller/handler
  ↓
service
  ↓
repository/query
  ↓
Drizzle
  ↓
PostgreSQL
```

### Rule

Business logic utama tidak boleh berada langsung di route handler.

Contoh:

```text
POST /sales
        ↓
SalesRoute
        ↓
SalesService.checkout()
        ↓
SalesRepository
        ↓
Drizzle Transaction
        ↓
PostgreSQL
```

---

# 18. API Design

Base URL:

```text
/api/v1
```

## Authentication

```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

## Products

```http
GET    /api/v1/products
GET    /api/v1/products/:id
POST   /api/v1/products
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id
```

## Categories

```http
GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/:id
DELETE /api/v1/categories/:id
```

## Inventory

```http
GET  /api/v1/inventory
GET  /api/v1/inventory/:productId
POST /api/v1/inventory/adjustments
GET  /api/v1/inventory/movements
```

## Sales

```http
GET  /api/v1/sales
GET  /api/v1/sales/:id
POST /api/v1/sales
POST /api/v1/sales/:id/cancel
POST /api/v1/sales/:id/return
```

## Customers

```http
GET   /api/v1/customers
GET   /api/v1/customers/:id
POST  /api/v1/customers
PATCH /api/v1/customers/:id
```

## Reports

```http
GET /api/v1/reports/sales
GET /api/v1/reports/products
GET /api/v1/reports/payments
GET /api/v1/reports/stock
GET /api/v1/reports/cashiers
```

---

# 19. API Response Standard

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product tidak ditemukan"
  }
}
```

Pagination:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

---

# 20. Error Codes

Minimal:

```text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
CONFLICT
PRODUCT_NOT_FOUND
PRODUCT_INACTIVE
INSUFFICIENT_STOCK
SALE_NOT_FOUND
SALE_ALREADY_CANCELLED
INVALID_PAYMENT
DUPLICATE_SKU
DUPLICATE_BARCODE
INTERNAL_ERROR
```

Error response tidak boleh membocorkan stack trace pada production.

---

# 21. Frontend Architecture

Frontend menggunakan SvelteKit.

Struktur:

```text
apps/
  web/
    src/
      lib/
        api/
        components/
        stores/
        utils/
      routes/
        login/
        dashboard/
        pos/
        products/
        inventory/
        sales/
        customers/
        reports/
        settings/
```

Gunakan:

- Svelte components
- Svelte stores/state management sesuai kebutuhan
- Form validation
- API client terpusat
- Route guards
- Loading state
- Error state
- Empty state
- Toast/notification

---

# 22. POS UI

Halaman POS harus dioptimalkan untuk kecepatan kasir.

Layout:

```text
+------------------------------------------------+
| Search / Scan Barcode                          |
+-------------------------+----------------------+
|                         |                      |
| Product List            | Cart                 |
|                         |                      |
| [Product] [Product]     | Product x 2          |
| [Product] [Product]     | Product x 1          |
| [Product] [Product]     |                      |
|                         | Subtotal             |
|                         | Discount             |
|                         | Tax                  |
|                         | Grand Total          |
|                         |                      |
|                         | [PAY]                |
+-------------------------+----------------------+
```

Keyboard-first interaction disarankan untuk kasir.

Contoh shortcut:

```text
F2  → Search product
F4  → Customer
F8  → Payment
ESC → Close modal
```

Shortcut harus dapat dikonfigurasi atau dinonaktifkan jika bertabrakan dengan browser/perangkat.

---

# 23. Checkout UX

Flow:

```text
Add Product
    ↓
Cart
    ↓
Review
    ↓
Payment
    ↓
Processing
    ↓
Success
    ↓
Receipt
```

Setelah sukses:

- Cart dikosongkan.
- Invoice ditampilkan.
- Receipt dapat dicetak.
- Kasir dapat memulai transaksi baru.

Double submission harus dicegah.

Gunakan idempotency key untuk endpoint checkout jika memungkinkan.

---

# 24. State Management

State frontend dibagi menjadi:

### Server State

- Products
- Sales
- Customers
- Inventory
- Reports

### Local UI State

- Cart
- Modal
- Search query
- Selected product
- Payment form
- Notification

Cart dapat disimpan sementara di browser untuk mencegah kehilangan data ketika UI mengalami reload, tetapi server tetap menjadi source of truth saat checkout.

---

# 25. Security Requirements

### Authentication

- Password menggunakan Argon2id atau algoritma password hashing modern yang setara.
- Jangan menyimpan password plaintext.
- Token/session harus memiliki expiry.
- Refresh token/session harus dapat direvoke.

### Authorization

Semua endpoint harus melakukan permission check.

Contoh:

```text
cashier → CREATE_SALE
cashier → READ_PRODUCT

manager → MANAGE_PRODUCT
manager → STOCK_ADJUSTMENT

owner → MANAGE_USERS
owner → SYSTEM_SETTINGS
```

### API Security

- Validasi semua input.
- Rate limit endpoint authentication.
- CORS hanya untuk origin yang diizinkan.
- HTTPS pada production.
- Jangan expose database credentials.
- Jangan expose stack trace production.
- Audit aksi sensitif.

---

# 26. Transaction & Concurrency

Checkout adalah operasi kritikal.

Pseudo flow:

```text
BEGIN

validate cart

lock/check stock

create sales
create sale_items
create payment
create stock_movements

COMMIT
```

Jika salah satu operasi gagal:

```text
ROLLBACK
```

Tidak boleh terjadi kondisi:

```text
sale berhasil
tetapi stock gagal dikurangi
```

atau:

```text
stock berkurang
tetapi sale gagal dibuat
```

Gunakan PostgreSQL transaction melalui Drizzle.

Untuk concurrency tinggi, gunakan strategi locking/isolation yang sesuai ketika melakukan validasi dan pengurangan stok.

---

# 27. Idempotency

Endpoint checkout harus memiliki perlindungan terhadap request ganda.

Contoh:

```http
Idempotency-Key: 01JXXXXXXXXXXXX
```

Jika request yang sama dikirim ulang karena network retry:

- Jangan membuat invoice kedua.
- Kembalikan hasil transaksi sebelumnya.

---

# 28. Validation

Validasi dilakukan di dua sisi:

### Frontend

Untuk UX:

- Required
- Format
- Range
- Basic business rules

### Backend

Sebagai source of enforcement:

- Schema validation
- Authorization
- Business rules
- Stock validation
- Price calculation

Frontend validation tidak boleh dianggap sebagai security boundary.

---

# 29. Pricing Rules

Semua perhitungan final dilakukan server-side.

Contoh:

```text
item_subtotal = unit_price × quantity

subtotal = SUM(item_subtotal)

discount = calculated discount

taxable_amount = subtotal - discount

tax = taxable_amount × tax_rate

grand_total = subtotal - discount + tax
```

Perhitungan harus menggunakan numeric/decimal yang sesuai untuk uang.

Hindari floating-point JavaScript untuk perhitungan uang.

---

# 30. Currency

Default:

```text
IDR
```

Untuk database:

- Gunakan `numeric/decimal`.
- Jangan menggunakan floating-point untuk monetary value.

Contoh:

```text
numeric(18,2)
```

Format tampilan:

```text
Rp 25.000
```

---

# 31. Observability

Backend harus memiliki:

- Structured logging
- Request ID
- Error logging
- Database error logging
- Basic metrics

Log minimal:

```text
timestamp
request_id
method
path
status
duration
user_id
```

Jangan log:

- password
- access token
- refresh token
- data pembayaran sensitif

---

# 32. Testing Requirements

## Unit Test

Test:

- Pricing calculation
- Discount calculation
- Tax calculation
- Change calculation
- Permission check
- Stock calculation

## Integration Test

Test:

- Login
- Product CRUD
- Checkout
- Payment
- Stock movement
- Return
- Cancellation

## E2E Test

Minimal flow:

```text
Login
→ Open POS
→ Search product
→ Add product
→ Checkout
→ Pay cash
→ Verify receipt
→ Verify stock
→ Verify sales history
```

---

# 33. Acceptance Criteria MVP

MVP dianggap selesai jika:

### Authentication

- [ ] User dapat login.
- [ ] User dapat logout.
- [ ] Protected route bekerja.
- [ ] Role authorization bekerja.

### Product

- [ ] Product CRUD berjalan.
- [ ] SKU unik.
- [ ] Barcode unik.
- [ ] Product inactive tidak dapat dijual.

### Inventory

- [ ] Stock dapat dilihat.
- [ ] Adjustment dapat dibuat.
- [ ] Semua movement tercatat.
- [ ] Stock berubah setelah sale.

### POS

- [ ] Product dapat dicari.
- [ ] Product dapat ditambahkan ke cart.
- [ ] Quantity dapat diubah.
- [ ] Total dihitung.
- [ ] Payment dapat dilakukan.
- [ ] Invoice dibuat.
- [ ] Receipt tersedia.

### Sales

- [ ] Sales history tersedia.
- [ ] Detail transaksi tersedia.
- [ ] Cancellation memiliki authorization.
- [ ] Return memiliki validasi.

### Reports

- [ ] Sales report tersedia.
- [ ] Payment report tersedia.
- [ ] Product sales report tersedia.
- [ ] Stock report tersedia.

### Audit

- [ ] Aktivitas penting tercatat.
- [ ] Audit log tidak dapat diubah oleh cashier.

---

# 34. Non-Functional Requirements

## Performance

Target:

- API p95 < 500 ms untuk operasi normal.
- POS UI siap digunakan < 2 detik pada jaringan normal.
- Search product terasa instan.
- Pagination wajib untuk dataset besar.

## Availability

Target MVP:

```text
99.5% uptime
```

## Scalability

Sistem harus memungkinkan:

- Penambahan outlet.
- Penambahan user.
- Penambahan produk hingga ratusan ribu record.
- Peningkatan jumlah transaksi tanpa perubahan arsitektur besar.

## Maintainability

- TypeScript strict mode.
- Modular architecture.
- Migration menggunakan Drizzle.
- API contract terdokumentasi.
- Business logic memiliki automated tests.

---

# 35. Environment

Environment variables minimum:

```env
NODE_ENV=development

DATABASE_URL=postgresql://...

JWT_SECRET=...

APP_URL=http://localhost:3000
API_URL=http://localhost:3001

CORS_ORIGIN=http://localhost:3000
```

Production secret harus disimpan menggunakan secret management, bukan committed ke repository.

---

# 36. Deployment

Recommended:

```text
                    Internet
                       |
                    Reverse Proxy
                       |
             +---------+---------+
             |                   |
         SvelteKit           ElysiaJS
          Frontend             API
                                 |
                              Drizzle
                                 |
                            PostgreSQL
```

Docker services:

```text
web
api
postgres
```

Untuk production, PostgreSQL sebaiknya menggunakan managed database atau deployment dengan backup dan monitoring yang memadai.

---

# 37. Backup & Recovery

Database:

- Automated daily backup
- Retention policy
- Point-in-time recovery jika tersedia
- Backup restore test berkala

Target awal:

```text
RPO: 24 jam
RTO: 4 jam
```

Target dapat ditingkatkan untuk production enterprise.

---

# 38. Recommended Monorepo

Struktur:

```text
pos/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── drizzle/
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       └── package.json
│
├── packages/
│   ├── shared/
│   └── config/
│
├── docker/
├── docs/
├── package.json
└── README.md
```

Shared package dapat berisi:

- API types
- Enum
- Shared validation schema
- Constants

Namun business logic tetap berada di backend.

---

# 39. Development Phases

## Phase 1 — Foundation

- [ ] Monorepo
- [ ] Bun
- [ ] ElysiaJS
- [ ] SvelteKit
- [ ] PostgreSQL
- [ ] Drizzle
- [ ] Docker
- [ ] Environment config
- [ ] Migration system

## Phase 2 — Authentication

- [ ] Users
- [ ] Roles
- [ ] Login
- [ ] Session/token
- [ ] Authorization

## Phase 3 — Master Data

- [ ] Categories
- [ ] Products
- [ ] Customers

## Phase 4 — Inventory

- [ ] Stock movement
- [ ] Stock adjustment
- [ ] Stock report
- [ ] Low-stock indicator

## Phase 5 — POS

- [ ] Product search
- [ ] Barcode input
- [ ] Cart
- [ ] Pricing
- [ ] Checkout
- [ ] Payment
- [ ] Receipt

## Phase 6 — Sales Management

- [ ] Sales history
- [ ] Sales detail
- [ ] Cancellation
- [ ] Return

## Phase 7 — Reports

- [ ] Dashboard
- [ ] Sales report
- [ ] Payment report
- [ ] Product report
- [ ] Stock report
- [ ] Cashier report

## Phase 8 — Hardening

- [ ] Automated tests
- [ ] Performance test
- [ ] Security review
- [ ] Backup
- [ ] Monitoring
- [ ] Production deployment

---

# 40. Definition of Done

Sebuah feature dianggap selesai apabila:

1. Requirement sudah diimplementasikan.
2. Database migration tersedia.
3. API endpoint tersedia jika diperlukan.
4. Authorization sudah diterapkan.
5. Validation sudah diterapkan.
6. Error handling tersedia.
7. UI memiliki loading/error/empty state.
8. Unit/integration test tersedia untuk business-critical logic.
9. Tidak ada console error yang tidak ditangani.
10. Dokumentasi API diperbarui.
11. Audit log tersedia untuk aksi sensitif.
12. Feature lolos acceptance criteria.

---

# 41. Future Roadmap

Setelah MVP stabil, fitur berikut dapat ditambahkan:

### Phase 2

- Purchase / pembelian
- Supplier
- Purchase order
- Goods receiving
- Barcode label printing
- Advanced stock opname
- Export Excel/CSV
- PDF report

### Phase 3

- Multi-outlet
- Central inventory
- Inter-store transfer
- Role permission granular
- Shift kasir
- Cash drawer management
- Opening/closing cash
- Expense management

### Phase 4

- Loyalty
- Promotions
- Membership
- Digital receipt
- WhatsApp notification
- Payment gateway
- Accounting integration
- Offline POS

---

# 42. Architecture Principles

Prinsip yang harus dipertahankan:

1. **Server adalah source of truth** untuk transaksi dan harga.
2. **Database transaction** wajib digunakan untuk operasi finansial dan inventory yang saling terkait.
3. **Stock movement adalah audit trail** perubahan stok.
4. **Sale item menyimpan snapshot** data penting saat transaksi.
5. **Business logic tidak diletakkan di UI.**
6. **Authorization dilakukan di backend.**
7. **Money menggunakan decimal/numeric**, bukan floating point.
8. **Semua migration versioned.**
9. **API harus backward-compatible** sejauh memungkinkan.
10. **Critical flow harus memiliki automated tests.**

---

# 43. Ringkasan Arsitektur

```text
┌─────────────────────────────────────────────┐
│                SvelteKit Web                │
│                                             │
│ Dashboard │ POS │ Products │ Reports        │
└──────────────────────┬──────────────────────┘
                       │ HTTPS / JSON
                       ▼
┌─────────────────────────────────────────────┐
│              ElysiaJS + Bun                 │
│                                             │
│ Auth │ Products │ Sales │ Inventory │ Report│
│              Service Layer                  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 Drizzle ORM                 │
│                                             │
│ Schema │ Query │ Transaction │ Migration    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 PostgreSQL                  │
│                                             │
│ Users │ Products │ Sales │ Payments │ Stock │
└─────────────────────────────────────────────┘
```

---

# 44. Final Product Goal

Produk akhir MVP harus memungkinkan seorang kasir melakukan:

```text
Login
  ↓
Buka POS
  ↓
Scan/Search Product
  ↓
Masukkan Product ke Cart
  ↓
Pilih Customer (optional)
  ↓
Review Cart
  ↓
Checkout
  ↓
Pilih Payment
  ↓
Transaksi Berhasil
  ↓
Cetak Receipt
  ↓
Stock Otomatis Berkurang
  ↓
Owner Dapat Melihat Laporan
```

Sistem harus memprioritaskan **kecepatan transaksi, integritas data, keamanan, auditability, dan kemudahan pengembangan**.
