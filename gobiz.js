import moment from "moment-timezone";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = 'https://api.gobiz.co.id';
const CLIENT_ID = 'go-biz-web-new';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, '.gopay_cache.json');
const ENV_FILE   = path.join(__dirname, '.env');

/**
 * Membaca file .env dan mengembalikan objek key-value.
 * Mendukung format KEY=VALUE, komentar (#), dan nilai berquote.
 */
function loadEnv() {
   if (!fs.existsSync(ENV_FILE)) return {};
   const content = fs.readFileSync(ENV_FILE, 'utf-8');
   const result = {};
   for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
         value = value.slice(1, -1);
      }
      result[key] = value;
   }
   return result;
}

/**
 * Membaca cache dari file .gopay_cache.json.
 * @returns {{ gopay_token?: string, gopay_merchant_id?: string }}
 */
function readCache() {
   try {
      if (fs.existsSync(CACHE_FILE)) {
         return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
   } catch {}
   return {};
}

/**
 * Menulis data cache ke file .gopay_cache.json (dibuat otomatis jika belum ada).
 * @param {{ gopay_token?: string, gopay_merchant_id?: string }} data
 */
function writeCache(data) {
   try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
   } catch (e) {
      console.warn('[GoPayMerchant] Gagal menyimpan cache:', e.message);
   }
}

function generateUUID() {
   return crypto.randomUUID();
}

function getAuthHeaders(uniqueId, accessToken) {
   return {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'id',
      'Authentication-Type': 'go-id',
      'Authorization': accessToken ? `Bearer ${accessToken}` : 'Bearer',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Gojek-Country-Code': 'ID',
      'Gojek-Timezone': 'Asia/Jakarta',
      'Origin': 'https://portal.gofoodmerchant.co.id',
      'Referer': 'https://portal.gofoodmerchant.co.id/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'X-AppVersion': 'platform-v3.107.0-94ce5d57',
      'X-PhoneMake': 'Windows 10 64-bit',
      'X-PhoneModel': 'Chrome 149.0.0.0 on Windows 10 64-bit',
      'X-Platform': 'Web',
      'X-User-Locale': 'en-US',
      'X-User-Type': 'merchant',
      'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'x-DeviceOS': 'Web',
      'x-appId': 'go-biz-web-dashboard',
      'x-uniqueid': uniqueId
   };
}

async function loginWithPassword(email, password) {
   const uniqueId = generateUUID();
   const headers = getAuthHeaders(uniqueId);

   console.log(`[Auth] Memvalidasi email: ${email}`);
   const curlArgsRequest = ['-4', '-s', '-X', 'POST', `${BASE_URL}/goid/login/request`];
   Object.entries(headers).forEach(([k, v]) => curlArgsRequest.push('-H', `${k}: ${v}`));
   curlArgsRequest.push('--data-raw', JSON.stringify({ email, login_type: 'password', client_id: CLIENT_ID }));

   let outputRequest;
   try {
      outputRequest = execFileSync('curl', curlArgsRequest, { encoding: 'utf-8' });
   } catch (e) {
      throw new Error(`Curl validasi email gagal: ${e.message}`);
   }

   const valData = JSON.parse(outputRequest);
   if (valData.errors?.length > 0) {
      console.warn(`[Auth] Peringatan validasi email: ${valData.errors[0].message}`);
   }

   console.log('[Auth] Mengirim kredensial login...');
   const curlArgsToken = ['-4', '-s', '-X', 'POST', `${BASE_URL}/goid/token`];
   Object.entries(headers).forEach(([k, v]) => curlArgsToken.push('-H', `${k}: ${v}`));
   curlArgsToken.push('--data-raw', JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'password',
      data: { email, password }
   }));

   let outputToken;
   try {
      outputToken = execFileSync('curl', curlArgsToken, { encoding: 'utf-8' });
   } catch (e) {
      throw new Error(`Curl login gagal: ${e.message}`);
   }

   const tokenData = JSON.parse(outputToken);
   if (tokenData.errors?.length > 0) {
      throw new Error(`Login gagal: ${tokenData.errors[0].message || 'Password salah atau akun bermasalah'}`);
   }

   return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
   };
}

async function getUserMerchants(accessToken) {
   const uniqueId = generateUUID();
   console.log('[Auth] Mengambil daftar merchant...');

   const response = await fetch(`${BASE_URL}/v1/merchants/search`, {
      method: 'POST',
      headers: getAuthHeaders(uniqueId, accessToken),
      body: JSON.stringify({ from: 0, to: 50, _source: ['id', 'merchant_name'] })
   });

   const resData = await response.json();
   if (!response.ok) {
      throw new Error(`Gagal mengambil list merchant (${response.status}): ${resData?.errors?.[0]?.message || 'Gagal autentikasi'}`);
   }

   return resData;
}

export default class GoPayMerchant {
   constructor(options = {}) {
      this.token = options.token || null;
      this.merchantId = options.merchantId || null;
      this._initialized = false;
   }

   async _isTokenValid(token) {
      try {
         const uniqueId = generateUUID();
         const res = await fetch(`${BASE_URL}/v1/merchants/search`, {
            method: 'POST',
            headers: getAuthHeaders(uniqueId, token),
            body: JSON.stringify({ from: 0, to: 1, _source: ['id'] })
         });
         return res.status !== 401;
      } catch {
         return false;
      }
   }

   async _doLogin() {
      const env = loadEnv();
      const email    = env.GOPAY_EMAIL;
      const password = env.GOPAY_PASSWORD;

      if (!email || !password) {
         throw new Error('[GoPayMerchant] GOPAY_EMAIL/GOPAY_PASSWORD belum diisi di file .env');
      }

      console.log(`[GoPayMerchant] Login otomatis sebagai: ${email}`);
      const authData = await loginWithPassword(email, password);
      this.token = authData.access_token;

      const cache = readCache();
      cache.gopay_token = this.token;
      writeCache(cache);

      console.log('[GoPayMerchant] Login berhasil, token disimpan ke cache.');
   }

   async init() {
      if (this._initialized) return;

      const cache = readCache();

      if (!this.token && cache.gopay_token) {
         this.token = cache.gopay_token;
         console.log('[GoPayMerchant] Token dimuat dari cache.');
      }

      if (!this.token || !(await this._isTokenValid(this.token))) {
         console.log('[GoPayMerchant] Token tidak valid atau belum ada, login ulang...');
         await this._doLogin();
      }

      if (!this.merchantId && cache.gopay_merchant_id) {
         this.merchantId = cache.gopay_merchant_id;
         console.log(`[GoPayMerchant] Merchant ID dimuat dari cache: ${this.merchantId}`);
      }

      if (!this.merchantId) {
         console.log('[GoPayMerchant] Mendeteksi Merchant ID secara otomatis...');
         const merchants = await getUserMerchants(this.token);

         let merchantList = [];
         if (Array.isArray(merchants)) {
            merchantList = merchants;
         } else if (merchants?.merchants && Array.isArray(merchants.merchants)) {
            merchantList = merchants.merchants;
         } else if (merchants?.hits && Array.isArray(merchants.hits)) {
            merchantList = merchants.hits;
         } else if (merchants?.hits?.hits && Array.isArray(merchants.hits.hits)) {
            merchantList = merchants.hits.hits.map(h => h._source || h);
         } else if (merchants?.data && Array.isArray(merchants.data)) {
            merchantList = merchants.data;
         }

         if (merchantList.length === 0) {
            throw new Error('[GoPayMerchant] Tidak ada merchant yang terasosiasi dengan akun ini.');
         }

         this.merchantId = merchantList[0].id || merchantList[0].merchant_id;
         const merchantName = merchantList[0].merchant_name || 'Tidak diketahui';
         console.log(`[GoPayMerchant] Menggunakan merchant: ${merchantName} (ID: ${this.merchantId})`);

         const updatedCache = readCache();
         updatedCache.gopay_merchant_id = this.merchantId;
         writeCache(updatedCache);
      }

      this._initialized = true;
   }

   async getHistory({ days = 1, size = 50 } = {}) {
      try {
         await this.init();
         const data = await this.getTransactionsAnalytics({ days, size });
         const histories = [];

         if (data && Array.isArray(data.transactions)) {
            for (const tx of data.transactions) {
               const realAmount = typeof tx.gross_amount === "number" ? tx.gross_amount / 100 : 0;
               const timeFormatted = tx.transaction_time
                  ? moment(tx.transaction_time).tz(global.timezone || "Asia/Jakarta").locale("id").format("DD MMM YYYY - HH:mm:ss")
                  : "";

               histories.push({
                  type: "payin",
                  amount: {
                     displayed_text: `Rp ${realAmount}`
                  },
                  time: timeFormatted,
                  raw: tx
               });
            }
            return {
               status: true,
               data: {
                  histories
               }
            };
         }

         const journalData = await this.getTransactionsJournal({ days, size });
         if (journalData && Array.isArray(journalData.data)) {
            for (const item of journalData.data) {
               const tx = item.metadata?.transaction;
               if (!tx) continue;

               const realAmount = typeof tx.gross_amount === "number" ? tx.gross_amount / 100 : 0;
               const timeFormatted = tx.transaction_time
                  ? moment(tx.transaction_time).tz(global.timezone || "Asia/Jakarta").locale("id").format("DD MMM YYYY - HH:mm:ss")
                  : "";

               histories.push({
                  type: "payin",
                  amount: {
                     displayed_text: `Rp ${realAmount}`
                  },
                  time: timeFormatted,
                  raw: item
               });
            }
            return {
               status: true,
               data: {
                  histories
               }
            };
         }

         return {
            status: false,
            message: "Tidak ada data transaksi yang ditemukan."
         };
      } catch (error) {
         return {
            status: false,
            message: error.message || "Terjadi kesalahan saat mengambil riwayat transaksi."
         };
      }
   }

   async getTransactionsAnalytics({ days = 1, size = 50 } = {}) {
      await this.init();
      const url = new URL("https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions");

      const startTime = moment().subtract(days, "days").tz(global.timezone || "Asia/Jakarta").toISOString();
      const endTime = moment().tz(global.timezone || "Asia/Jakarta").toISOString();

      url.searchParams.append("from", "0");
      url.searchParams.append("size", String(size));
      url.searchParams.append("statuses", "SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND");
      url.searchParams.append("payment_types", "QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD");
      url.searchParams.append("start_time", startTime);
      url.searchParams.append("end_time", endTime);
      url.searchParams.append("merchant_ids", this.merchantId);

      const headers = {
         "accept": "application/json, text/plain, */*",
         "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
         "authentication-type": "go-id",
         "authorization": `Bearer ${this.token}`,
         "content-type": "application/json",
         "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
         "sec-ch-ua-mobile": "?0",
         "sec-ch-ua-platform": '"Linux"',
         "sec-fetch-dest": "empty",
         "sec-fetch-mode": "cors",
         "sec-fetch-site": "cross-site"
      };

      const response = await fetch(url.toString(), { method: "GET", headers });

      if (response.status === 401) {
         console.log('[GoPayMerchant] Token expired (Analytics), login ulang...');
         this._initialized = false;
         this.token = null;
         await this.init();
         const retryResponse = await fetch(url.toString(), {
            method: "GET",
            headers: { ...headers, "authorization": `Bearer ${this.token}` }
         });
         if (!retryResponse.ok) throw new Error(`HTTP Error Analytics (retry): ${retryResponse.status} ${retryResponse.statusText}`);
         return await retryResponse.json();
      }

      if (!response.ok) {
         throw new Error(`HTTP Error Analytics: ${response.status} ${response.statusText}`);
      }

      return await response.json();
   }

   async getTransactionsJournal({ days = 1, size = 50 } = {}) {
      await this.init();
      const url = "https://api.gobiz.co.id/journals/search";

      const startTime = moment().subtract(days, "days").tz(global.timezone || "Asia/Jakarta").toISOString();
      const endTime = moment().tz(global.timezone || "Asia/Jakarta").toISOString();

      const requestBody = {
         from: 0,
         size: size,
         sort: {
            time: {
               order: "desc"
            }
         },
         included_categories: {
            incoming: ["transaction_share", "action"]
         },
         query: [
            {
               clauses: [
                  {
                     op: "not",
                     clauses: [
                        {
                           clauses: [
                              { field: "metadata.source", op: "in", value: ["GOSAVE_ONLINE", "GoSave", "GODEALS_ONLINE"] },
                              { field: "metadata.gopay.source", op: "in", value: ["GOSAVE_ONLINE", "GoSave", "GODEALS_ONLINE"] }
                           ],
                           op: "or"
                        }
                     ]
                  },
                  {
                     field: "metadata.transaction.status",
                     op: "in",
                     value: ["settlement", "capture", "refund", "partial_refund"]
                  },
                  {
                     op: "or",
                     clauses: [
                        {
                           op: "or",
                           clauses: [
                              {
                                 field: "metadata.transaction.payment_type",
                                 op: "in",
                                 value: ["qris", "gopay", "offline_credit_card", "offline_debit_card", "credit_card"]
                              }
                           ]
                        }
                     ]
                  },
                  {
                     field: "metadata.transaction.transaction_time",
                     op: "gte",
                     value: startTime
                  },
                  {
                     field: "metadata.transaction.transaction_time",
                     op: "lte",
                     value: endTime
                  },
                  {
                     field: "metadata.transaction.merchant_id",
                     op: "equal",
                     value: this.merchantId
                  }
               ],
               op: "and"
            }
         ]
      };

      const headers = {
         "accept": "application/json, text/plain, */*, application/vnd.journal.v1+json",
         "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
         "authentication-type": "go-id",
         "authorization": `Bearer ${this.token}`,
         "content-type": "application/json",
         "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
         "sec-ch-ua-mobile": "?0",
         "sec-ch-ua-platform": '"Linux"',
         "sec-fetch-dest": "empty",
         "sec-fetch-mode": "cors",
         "sec-fetch-site": "cross-site"
      };

      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(requestBody) });

      if (response.status === 401) {
         console.log('[GoPayMerchant] Token expired (Journal), login ulang...');
         this._initialized = false;
         this.token = null;
         await this.init();
         const retryResponse = await fetch(url, {
            method: "POST",
            headers: { ...headers, "authorization": `Bearer ${this.token}` },
            body: JSON.stringify(requestBody)
         });
         if (!retryResponse.ok) throw new Error(`HTTP Error Journal (retry): ${retryResponse.status} ${retryResponse.statusText}`);
         return await retryResponse.json();
      }

      if (!response.ok) {
         throw new Error(`HTTP Error Journal: ${response.status} ${response.statusText}`);
      }

      return await response.json();
   }
}

export class GoPayWatcher extends EventEmitter {
   constructor(merchant, intervalMs = 7_000) {
      super();
      this._merchant  = merchant;
      this._interval  = intervalMs;
      this._timer     = null;
      this._seenIds   = new Set();
      this._seeded    = false;
      this._listeners = 0;
      this._polling   = false;
   }

   _startPoller() {
      if (this._timer) return;
      console.log('[GoPayWatcher] Poller dimulai.');
      this._poll();
      this._timer = setInterval(() => this._poll(), this._interval);
   }

   _stopPoller() {
      if (!this._timer) return;
      clearInterval(this._timer);
      this._timer = null;
      console.log('[GoPayWatcher] Poller dihentikan (tidak ada listener aktif).');
   }

   async _poll() {
      if (this._polling) return;
      this._polling = true;

      try {
         const result = await this._merchant.getHistory({ days: 1, size: 30 });
         if (!result?.status || !Array.isArray(result?.data?.histories)) return;

         for (const entry of result.data.histories) {
            const raw  = entry.raw || {};
            const txId = raw.transaction_id
                      ?? raw.id
                      ?? raw.order_id
                      ?? `${entry.time}_${entry.amount?.displayed_text}`;

            if (!txId || this._seenIds.has(txId)) continue;
            this._seenIds.add(txId);

            if (!this._seeded) continue;

            const rawAmount = raw.gross_amount;
            const amount    = typeof rawAmount === 'number'
                           ? rawAmount / 100
                           : parseFloat(String(rawAmount ?? 0));

            console.log(`[GoPayWatcher] 💸 Transaksi baru: Rp ${amount.toLocaleString('id-ID')} | ID: ${txId}`);
            this.emit('payment', { amount, txId, entry });
         }

         if (!this._seeded) {
            this._seeded = true;
            console.log(`[GoPayWatcher] Seed selesai. ${this._seenIds.size} transaksi terdaftar sebagai "sudah dikenal".`);
         }

         if (this._seenIds.size > 500) {
            const arr = [...this._seenIds];
            this._seenIds = new Set(arr.slice(arr.length - 500));
         }
      } catch (e) {
         console.error('[GoPayWatcher] Error saat polling:', e.message);
      } finally {
         this._polling = false;
      }
   }

   /**
    * Tunggu pembayaran dengan nominal tertentu secara async.
    * @param {number} amount           - Nominal yang diharapkan (dalam Rupiah)
    * @param {object} [opts]
    * @param {number} [opts.timeout]   - Batas waktu (ms), default 5 menit
    * @param {number} [opts.tolerance] - Toleransi selisih nominal (Rp), default 0
    * @returns {Promise<{ amount, txId, entry }>}
    */
   waitForPayment(amount, { timeout = 5 * 60_000, tolerance = 0 } = {}) {
      return new Promise((resolve, reject) => {
         this._listeners++;
         this._startPoller();

         let timeoutHandle;

         const onPayment = (data) => {
            if (Math.abs(data.amount - amount) <= tolerance) {
               cleanup();
               resolve(data);
            }
         };

         const cleanup = () => {
            clearTimeout(timeoutHandle);
            this.off('payment', onPayment);
            this._listeners = Math.max(0, this._listeners - 1);
            if (this._listeners === 0) this._stopPoller();
         };

         timeoutHandle = setTimeout(() => {
            cleanup();
            reject(new Error(
               `[GoPayWatcher] Timeout: Pembayaran Rp ${amount.toLocaleString('id-ID')} tidak terdeteksi dalam ${timeout / 1000}s.`
            ));
         }, timeout);

         this.on('payment', onPayment);
      });
   }

   reset() {
      this._seenIds.clear();
      this._seeded = false;
      console.log('[GoPayWatcher] Seed direset.');
   }
}

let _sharedMerchant = null;
let _sharedWatcher  = null;

/**
 * Dapatkan instance GoPayWatcher singleton.
 * Semua plugin yang memanggil fungsi ini berbagi satu poller yang sama.
 * @param {number} [intervalMs=7000] - Interval polling (ms)
 * @returns {GoPayWatcher}
 */
export function getGoPayWatcher(intervalMs = 7_000) {
   if (!_sharedMerchant) _sharedMerchant = new GoPayMerchant();
   if (!_sharedWatcher)  _sharedWatcher  = new GoPayWatcher(_sharedMerchant, intervalMs);
   return _sharedWatcher;
}

/*
═══════════════════════════════════════════════════════════
CARA PENGGUNAAN — gopay.js
═══════════════════════════════════════════════════════════

Buat file .env di direktori yang sama dengan gopay.js:

  GOPAY_EMAIL=email@merchant.com
  GOPAY_PASSWORD=password_kamu

File .gopay_cache.json akan dibuat otomatis untuk menyimpan
token dan merchant ID agar tidak perlu login ulang setiap saat.

───────────────────────────────────────────────────────────
1. MENUNGGU PEMBAYARAN MASUK
───────────────────────────────────────────────────────────

  import { getGoPayWatcher } from './gopay.js';

  const watcher = getGoPayWatcher();

  watcher.waitForPayment(50000, { timeout: 5 * 60_000 })
    .then(tx => {
      console.log('Pembayaran diterima!');
      console.log('Nominal :', tx.amount);
      console.log('ID Transaksi:', tx.txId);
    })
    .catch(err => console.error(err.message));

  // Parameter waitForPayment:
  //   amount     {number} — nominal yang ditunggu (dalam Rupiah)
  //   timeout    {number} — batas waktu dalam ms (default: 300000 / 5 menit)
  //   tolerance  {number} — toleransi selisih nominal dalam Rupiah (default: 0)

───────────────────────────────────────────────────────────
2. MENGAMBIL RIWAYAT TRANSAKSI
───────────────────────────────────────────────────────────

  import GoPayMerchant from './gopay.js';

  const merchant = new GoPayMerchant();
  const result = await merchant.getHistory({ days: 1, size: 20 });

  if (result.status) {
    for (const tx of result.data.histories) {
      console.log(tx.amount.displayed_text, tx.time);
    }
  } else {
    console.error(result.message);
  }

  // Parameter getHistory:
  //   days  {number} — rentang hari ke belakang (default: 1)
  //   size  {number} — jumlah transaksi maks (default: 50)

───────────────────────────────────────────────────────────
3. INISIALISASI DENGAN TOKEN & MERCHANT ID MANUAL
───────────────────────────────────────────────────────────

  import GoPayMerchant from './gopay.js';

  const merchant = new GoPayMerchant({
    token: 'eyJhbGci...',     // opsional, jika sudah punya access token
    merchantId: 'M-XXXXXXXX' // opsional, jika sudah tahu merchant ID
  });

  // Jika tidak diisi, keduanya akan di-resolve otomatis
  // saat memanggil method apapun (login & deteksi merchant otomatis).

───────────────────────────────────────────────────────────
4. RESET WATCHER
───────────────────────────────────────────────────────────

  import { getGoPayWatcher } from './gopay.js';

  const watcher = getGoPayWatcher();
  watcher.reset();
  // Menghapus semua ID transaksi yang diingat dan memulai seed ulang.
  // Berguna saat testing agar transaksi lama terdeteksi kembali.

═══════════════════════════════════════════════════════════
*/

