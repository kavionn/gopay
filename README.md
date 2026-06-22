# GoBiz Payment

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/ES_Modules-4B32C3?logo=javascript&logoColor=white" alt="ES Modules" />
  <img src="https://img.shields.io/badge/API-GoBiz%20Merchant-00AED9?logoColor=white" alt="GoBiz API" />
  <img src="https://img.shields.io/badge/requires-curl-073551?logo=curl&logoColor=white" alt="curl" />

</p>

Modul Node.js untuk berinteraksi dengan API GoBiz (GoPay Merchant) — memungkinkan pengambilan riwayat transaksi dan pemantauan pembayaran masuk secara real-time menggunakan polling otomatis.

> [!WARNING]
> **Peringatan Risiko Banned:** Penggunaan otomatisasi login atau polling API yang terlalu sering dan agresif berisiko membuat akun GoBiz Anda terdeteksi dan terkena **banned/blokir**. Penggunaan modul ini sepenuhnya merupakan tanggung jawab Anda sendiri.

---

## ✨ Fitur Utama

- 🔐 **Autentikasi Otomatis** — Login menggunakan email & password, token disimpan dan diperbarui otomatis
- 🏪 **Deteksi Merchant ID** — Merchant ID dideteksi secara otomatis dari akun yang login
- 📋 **Riwayat Transaksi** — Ambil transaksi dari Analytics API maupun Journal API dengan fallback otomatis
- 👁️ **Pemantauan Pembayaran** — Pantau transaksi masuk secara real-time dengan polling interval
- ⏳ **Tunggu Pembayaran** — Await pembayaran dengan nominal tertentu + toleransi + timeout
- ♻️ **Singleton Watcher** — `getGoPayWatcher()` selalu mengembalikan instance yang sama; polling hanya berjalan sekali meski dipanggil dari banyak tempat

---

## 📦 Instalasi

Clone repo ini lalu install dependensi:

```bash
git clone https://github.com/kavionn/gobiz-payment.git
cd gobiz-payment
npm install
```

---

## 🔑 Cara Mengatur Password Akun GoBiz

Modul ini memerlukan **email & password** untuk login ke API GoBiz. Jika kamu belum memiliki password (atau belum pernah mengaturnya), ikuti langkah berikut:

1. **Buka portal GoFood Merchant**
   Kunjungi → [https://portal.gofoodmerchant.co.id](https://portal.gofoodmerchant.co.id)

2. **Login menggunakan OTP**
   Masukkan nomor HP yang terdaftar, lalu masukkan kode OTP yang dikirim via SMS.

3. **Buka halaman Profile**
   Setelah berhasil login, pergi ke:
   [https://portal.gofoodmerchant.co.id/account/profile](https://portal.gofoodmerchant.co.id/account/profile)

4. **Atur password login**
   Di halaman profile, cari opsi untuk mengatur atau mengubah **password login**, lalu simpan.

5. **Gunakan kredensial di `.env`**
   Setelah password berhasil diatur, gunakan email & password tersebut di file `.env`:
   ```env
   GOPAY_EMAIL=email@merchant.com
   GOPAY_PASSWORD=password_yang_baru_diatur
   ```

---

## ⚙️ Konfigurasi

### File `.env`

Buat file `.env` di direktori yang **sama** dengan `gobiz.js` dan isi dengan kredensial akun GoBiz Merchant:

```env
GOPAY_EMAIL=email@merchant.com
GOPAY_PASSWORD=password_kamu

# Diperlukan jika menggunakan demo.js
# String QRIS statis dari akun GoPay Merchant kamu (bisa di-scan dari gambar QRIS)
QRIS_STRING=00020101021226...

# Nominal pembayaran default (Rupiah), bisa di-override via argumen CLI
PRICE_AMOUNT=2000
```

Salin `.env.example` sebagai titik awal:

```bash
cp .env.example .env
```

### File `.gopay_cache.json` *(dibuat otomatis)*

Modul ini akan **membuat sendiri** file `.gopay_cache.json` di direktori yang sama saat pertama kali login berhasil. File ini menyimpan token dan merchant ID agar tidak perlu login ulang setiap kali aplikasi dijalankan.

Contoh isi file yang dibuat otomatis:

```json
{
  "gopay_token": "eyJhbGci...",
  "gopay_merchant_id": "M-XXXXXXXX"
}
```

> **Catatan:** Token yang kadaluarsa akan di-refresh otomatis — kamu tidak perlu mengubah file ini secara manual.

---

## 🚀 Cara Penggunaan

### 1. Menunggu Pembayaran Masuk ⭐ *(Direkomendasikan)*

> [!TIP]
> **Mengapa Watcher lebih efisien?**
> `GoPayWatcher` melakukan **satu request API** per interval, lalu mendeteksi semua transaksi baru dari hasilnya sekaligus — berapapun jumlahnya. Jauh lebih hemat dibanding memanggil `getHistory` secara terpisah untuk setiap order.

Cara paling umum dan paling efisien — tunggu hingga ada pembayaran dengan nominal tertentu masuk.

```js
import { getGoPayWatcher } from './gobiz.js';

// Atur seberapa sering API di-poll (default: 7000ms = 7 detik)
const watcher = getGoPayWatcher(7_000);

try {
  const tx = await watcher.waitForPayment(50000, {
    timeout: 5 * 60_000, // batas waktu maksimum menunggu (bukan frekuensi cek)
    tolerance: 0         // toleransi selisih nominal (Rp)
  });

  console.log('✅ Pembayaran diterima!');
  console.log('Nominal     :', tx.amount);
  console.log('ID Transaksi:', tx.txId);
  console.log('Detail      :', tx.entry);
} catch (err) {
  console.error('❌', err.message); // timeout atau error lain
}
```

**Parameter `getGoPayWatcher`:**

| Parameter    | Tipe     | Default | Keterangan                                         |
|--------------|----------|---------|----------------------------------------------------|
| `intervalMs` | `number` | `7000`  | Seberapa sering API di-poll (milidetik). Nilai terlalu kecil berisiko rate-limit. Disarankan ≥ 7000 ms |

**Parameter `waitForPayment`:**

| Parameter   | Tipe     | Default   | Keterangan                                                        |
|-------------|----------|-----------|-------------------------------------------------------------------|
| `amount`    | `number` | *(wajib)* | Nominal yang ditunggu (dalam Rupiah)                              |
| `timeout`   | `number` | `300000`  | Batas waktu **maksimum** menunggu (ms) — bukan frekuensi polling  |
| `tolerance` | `number` | `0`       | Toleransi selisih nominal (Rupiah)                                |

---

### 2. Mengambil Riwayat Transaksi *(Untuk Keperluan Audit/Debug)*

> [!NOTE]
> `getHistory` berguna untuk membaca riwayat transaksi secara satu kali — misalnya untuk laporan, audit, atau debugging. **Jangan** gunakan ini sebagai pengganti `GoPayWatcher` untuk memantau pembayaran masuk secara real-time: memanggil `getHistory` berulang kali untuk banyak order sekaligus justru menghasilkan lebih banyak request dibanding watcher.

```js
import GoPayMerchant from './gobiz.js';

const merchant = new GoPayMerchant();

// ✅ Panggil ini secara manual setiap 2-5 menit, BUKAN dalam loop cepat
const result = await merchant.getHistory({ days: 1, size: 20 });

if (result.status) {
  for (const tx of result.data.histories) {
    console.log(tx.amount.displayed_text, '—', tx.time);
  }
} else {
  console.error('Gagal:', result.message);
}
```

**Contoh penggunaan untuk audit satu kali:**

```js
import GoPayMerchant from './gobiz.js';

const merchant = new GoPayMerchant();

// Panggil sekali untuk keperluan laporan/audit
const result = await merchant.getHistory({ days: 7, size: 50 });
if (result.status) {
  for (const tx of result.data.histories) {
    console.log(tx.amount.displayed_text, '—', tx.time);
  }
}
```

> Untuk pemantauan pembayaran real-time, gunakan `GoPayWatcher` — jauh lebih efisien karena cukup **1 request per interval** untuk mendeteksi semua transaksi baru sekaligus.

**Parameter `getHistory`:**

| Parameter | Tipe     | Default | Keterangan                              |
|-----------|----------|---------|-----------------------------------------|
| `days`    | `number` | `1`     | Rentang hari ke belakang                |
| `size`    | `number` | `50`    | Jumlah maksimum transaksi yang diambil  |

**Struktur item `histories`:**

```js
{
  type: "payin",
  amount: {
    displayed_text: "Rp 50000"
  },
  time: "15 Jun 2026 - 13:00:00",
  raw: { /* objek transaksi mentah dari API */ }
}
```

---

### 3. Inisialisasi Manual dengan Token & Merchant ID

Jika kamu sudah memiliki access token dan merchant ID, bisa langsung diisi tanpa proses login:

```js
import GoPayMerchant from './gobiz.js';

const merchant = new GoPayMerchant({
  token: 'eyJhbGci...',     // opsional
  merchantId: 'M-XXXXXXXX' // opsional
});

const result = await merchant.getHistory({ days: 7, size: 100 });
```

> Jika `token` atau `merchantId` tidak diisi, keduanya akan di-resolve otomatis saat method pertama dipanggil.

---

### 4. Mendengarkan Event Pembayaran Secara Manual


`GoPayWatcher` adalah EventEmitter — kamu bisa langsung listen event `'payment'`:

```js
import { getGoPayWatcher } from './gobiz.js';

const watcher = getGoPayWatcher(10_000); // polling tiap 10 detik

watcher.on('payment', (data) => {
  console.log('💸 Pembayaran masuk!');
  console.log('Nominal     :', data.amount);
  console.log('ID Transaksi:', data.txId);
});
```

> Poller akan **otomatis berjalan** saat ada listener aktif dan **berhenti** saat semua listener dihapus.

---

### 5. Reset Watcher

Berguna saat testing agar transaksi lama bisa terdeteksi ulang:

```js
import { getGoPayWatcher } from './gobiz.js';

const watcher = getGoPayWatcher();
watcher.reset();
// Semua ID transaksi yang diingat dihapus, seed ulang dimulai.
```

---

### 6. Contoh Script End-to-End (`demo.js`)

Repo ini menyertakan `demo.js` — script siap pakai yang mendemonstrasikan alur pembayaran QRIS lengkap dari awal hingga selesai:

```
🔐 Auth ke GoBiz
    ↓
⚙️  Generate QRIS dinamis (sisipkan nominal + hitung ulang CRC16)
    ↓
🖼️  Render gambar QR Code
    ↓
☁️  Upload gambar → dapat URL
    ↓
📲  Tampilkan URL (kirim ke pengguna untuk di-scan)
    ↓
⏳  Tunggu pembayaran masuk via GoPayWatcher
    ↓
✅  Konfirmasi sukses → program selesai
```

**Cara menjalankan:**

```bash
# Pakai nominal default dari .env (PRICE_AMOUNT)
node demo.js

# Atau tentukan nominal langsung
node demo.js 50000
```

> [!IMPORTANT]
> Pastikan `QRIS_STRING` sudah diisi di file `.env` sebelum menjalankan script ini.
> String QRIS statis bisa didapat dengan men-scan gambar QRIS dari portal GoBiz Merchant.

---

## 📖 API Reference

### `default export: GoPayMerchant`

Kelas utama untuk berinteraksi dengan API GoBiz Merchant.

| Method                                    | Keterangan                                                          |
|-------------------------------------------|---------------------------------------------------------------------|
| `constructor(options?)`                   | `options.token` dan `options.merchantId` bersifat opsional          |
| `async init()`                            | Inisialisasi: validasi/refresh token & resolve merchant ID          |
| `async getHistory({ days, size })`        | Ambil riwayat transaksi (fallback Analytics → Journal)              |
| `async getTransactionsAnalytics({ ... })` | Ambil transaksi dari Analytics API secara langsung                  |
| `async getTransactionsJournal({ ... })`   | Ambil transaksi dari Journal API secara langsung                    |

---

### `export class: GoPayWatcher`

Kelas pemantau pembayaran berbasis `EventEmitter`.

| Method                          | Keterangan                                                          |
|---------------------------------|---------------------------------------------------------------------|
| `constructor(merchant, intervalMs?)` | `merchant` adalah instance `GoPayMerchant`, `intervalMs` default `7000` ms |
| `waitForPayment(amount, opts?)`  | Tunggu pembayaran nominal tertentu, returns `Promise`               |
| `on('payment', callback)`        | Dengarkan event pembayaran masuk                                    |
| `reset()`                        | Reset seed (hapus semua ID transaksi yang diingat)                  |

**Event `'payment'`** memancarkan objek:

```js
{
  amount: 50000,    // nominal dalam Rupiah (number)
  txId: "TXN-...", // ID unik transaksi
  entry: { ... }   // objek riwayat lengkap dari getHistory
}
```

---

### `export function: getGoPayWatcher(intervalMs?)`

Mengembalikan instance `GoPayWatcher` singleton. Setiap kali fungsi ini dipanggil — dari file mana pun dalam satu proses — akan selalu mengembalikan instance yang **sama**, sehingga hanya ada **satu proses polling** yang berjalan di background.

```js
import { getGoPayWatcher } from './gobiz.js';

const watcher = getGoPayWatcher(10_000); // polling tiap 10 detik
```

| Parameter    | Tipe     | Default | Keterangan                                              |
|--------------|----------|---------|---------------------------------------------------------|
| `intervalMs` | `number` | `7000`  | Interval polling dalam milidetik. Disarankan ≥ 7000 ms |

> **Catatan:** `intervalMs` hanya berlaku saat instance pertama kali dibuat. Pemanggilan `getGoPayWatcher()` berikutnya akan mengabaikan parameter ini karena instance sudah ada (singleton).

---

## 🔄 Alur Autentikasi

```mermaid
flowchart TD
    A([Panggil method apapun]) --> B{Token tersedia\ndi instance?}

    B -- Tidak --> C{Ada di\n.gopay_cache.json?}
    B -- Ya --> F

    C -- Tidak --> E[Login otomatis\nbaca .env →\nGOPAY_EMAIL\nGOPAY_PASSWORD]
    C -- Ya --> D[Muat token\ndari cache]

    D --> F{Validasi token\nke API}
    E --> G[Simpan token\nke .gopay_cache.json]
    G --> F

    F -- Valid --> H{Merchant ID\ntersedia?}
    F -- Tidak valid --> E

    H -- Tidak --> I[Fetch Merchant ID\ndari API]
    H -- Ya --> K([Siap digunakan ✅])

    I --> J[Simpan Merchant ID\nke .gopay_cache.json]
    J --> K
```

---

## ⚠️ Catatan Penting

- Modul ini **bukan** library resmi Gojek/GoPay dan mengakses API internal GoBiz
- Modul ini menggunakan `execFileSync('curl', ...)` untuk proses login — pastikan `curl` tersedia di sistem
- Email & password dibaca dari file `.env` di direktori yang sama dengan `gobiz.js`
- Token & merchant ID disimpan ke `.gopay_cache.json` yang **dibuat otomatis** — tidak perlu konfigurasi tambahan
- Token yang kadaluarsa akan di-refresh otomatis saat request gagal dengan status `401`
- Cache ID transaksi di `GoPayWatcher` dibatasi **500 entri** untuk mencegah memory leak

- Tambahkan `.env`, `.gopay_cache.json`, dan `node_modules/` ke `.gitignore` untuk keamanan

---

## 📁 Struktur Export

```js
// Default export
import GoPayMerchant from './gobiz.js';

// Named exports
import { GoPayWatcher, getGoPayWatcher } from './gobiz.js';
```

---

## Star History

<a href="https://www.star-history.com/?repos=kavionn%2Fgobiz-payment&type=timeline&logscale=&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=kavionn/gobiz-payment&type=timeline&theme=dark&logscale&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=kavionn/gobiz-payment&type=timeline&logscale&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=kavionn/gobiz-payment&type=timeline&logscale&legend=bottom-right" />
 </picture>
</a>
