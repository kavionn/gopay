import 'dotenv/config';
import crc from 'crc';
import QRCode from 'qrcode';
import GoPayMerchant, { GoPayWatcher } from './gobiz.js';

const QRIS_STRING = process.env.QRIS_STRING;
const AMOUNT = parseInt(process.argv[2] || process.env.PRICE_AMOUNT || '2000', 10);

function convertCRC16(str) {
   const crc16 = crc.crc16ccitt(Buffer.from(str, 'utf8')).toString(16).toUpperCase();
   return ('0000' + crc16).slice(-4);
}

function buildDynamicQris(staticQris, amount) {
   const data = staticQris.endsWith('6304') ? staticQris : staticQris.slice(0, -4);
   const step1 = data.replace('010211', '010212');

   if (!step1.includes('5802ID')) {
      throw new Error('Format QRIS tidak valid — pastikan QRIS_STRING benar.');
   }

   const [before, after] = step1.split('5802ID');
   const nominalField = '54' + String(amount.toString().length).padStart(2, '0') + amount;
   const raw = before + nominalField + '5802ID' + after;

   return raw + convertCRC16(raw);
}

async function generateQrisImage(qrisString) {
   const dataUrl = await QRCode.toDataURL(qrisString, { scale: 8, errorCorrectionLevel: 'M' });
   return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function uploadImage(buffer, filename = 'qris.jpg') {
   const formData = new FormData();
   formData.append('file', new Blob([buffer], { type: 'image/jpeg' }), filename);

   const response = await fetch('https://ken4-tmp.hf.space/api/upload', {
      method: 'POST',
      body: formData,
   });

   if (!response.ok) {
      throw new Error(`Upload gagal: HTTP ${response.status} ${response.statusText}`);
   }

   const json = await response.json();
   const url = json?.data?.url;
   if (!url) throw new Error('Upload berhasil tapi URL tidak ditemukan di respons.');
   return url;
}

async function main() {
   console.log('━'.repeat(50));
   console.log('  Contoh Alur Pembayaran QRIS via GoBiz');
   console.log('━'.repeat(50));

   if (!QRIS_STRING) {
      console.error('\nError: QRIS_STRING belum diisi di file .env');
      console.error('   Isi dengan string QRIS statis dari akun GoPay Merchant kamu.\n');
      process.exit(1);
   }

   console.log('\nAutentikasi ke GoBiz...');
   const merchant = new GoPayMerchant();
   try {
      await merchant.init();
      console.log('   ✅ Autentikasi berhasil.');
   } catch (err) {
      console.error('   Gagal:', err.message);
      process.exit(1);
   }

   console.log(`\nNominal pembayaran : Rp ${AMOUNT.toLocaleString('id-ID')}`);

   console.log('\nMenyisipkan nominal ke QRIS...');
   let dynamicQris;
   try {
      dynamicQris = buildDynamicQris(QRIS_STRING, AMOUNT);
      console.log('   ✅ QRIS dinamis berhasil dibuat.');
   } catch (err) {
      console.error('   Gagal membuat QRIS dinamis:', err.message);
      process.exit(1);
   }

   console.log('\nMembuat gambar QR Code...');
   const imageBuffer = await generateQrisImage(dynamicQris);
   console.log('   ✅ Gambar QR Code berhasil dibuat.');

   console.log('\nMengupload gambar QRIS...');
   let qrisUrl;
   try {
      qrisUrl = await uploadImage(imageBuffer);
      console.log('   ✅ Upload berhasil.');
   } catch (err) {
      console.error('   Gagal upload:', err.message);
      process.exit(1);
   }

   console.log('\n' + '─'.repeat(50));
   console.log('Scan QRIS berikut untuk membayar:');
   console.log(`\n    ${qrisUrl}\n`);
   console.log(`    Nominal : Rp ${AMOUNT.toLocaleString('id-ID')}`);
   console.log('─'.repeat(50));

   const TIMEOUT_MS = 10 * 60_000;
   console.log(`\nMenunggu pembayaran (timeout: ${TIMEOUT_MS / 60000} menit)...\n`);

   const watcher = new GoPayWatcher(merchant, 7_000);

   try {
      const tx = await watcher.waitForPayment(AMOUNT, {
         timeout: TIMEOUT_MS,
         tolerance: 0,
      });

      console.log('\n' + '━'.repeat(50));
      console.log('  ✅  PEMBAYARAN BERHASIL DITERIMA!');
      console.log('━'.repeat(50));
      console.log(`  Nominal      : Rp ${tx.amount.toLocaleString('id-ID')}`);
      console.log(`  ID Transaksi : ${tx.txId}`);
      console.log(`  Waktu        : ${tx.entry?.time || '-'}`);
      console.log('━'.repeat(50) + '\n');
      process.exit(0);

   } catch (err) {
      console.error('\nPembayaran tidak terdeteksi:', err.message);
      process.exit(1);
   }
}

main().catch((err) => {
   console.error('\nError tidak terduga:', err.message);
   process.exit(1);
});