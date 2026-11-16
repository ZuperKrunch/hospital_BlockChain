# Hospital dApp v2 — rekam medis on-chain

Pengembangan dari ZIP hospital-dapp yang diberikan, dengan React/Vite + ethers v6 + MetaMask. Bukan proyek baru dengan backend atau mode demo pengganti. Role admin/dokter/pasien dan persetujuan dokter tetap digunakan.

## Perubahan

- Dokter membuat pemeriksaan berisi nama pasien, tanggal lahir, jenis kelamin, golongan darah, tinggi badan, berat badan, riwayat penyakit, alergi, keluhan, diagnosis, obat/terapi, dan catatan.
- Seluruh isinya disimpan langsung di smart contract Sepolia. Tidak menggunakan IPFS atau database untuk isi pemeriksaan versi ini.
- Pasien membaca record wallet-nya sendiri di dashboard pasien.
- Dokter yang diizinkan membaca record pasien tersebut; hanya dokter pembuat yang dapat mengedit atau menonaktifkan record aktifnya.
- Tabel menampilkan ringkasan, dengan Lihat Detail untuk informasi lengkap. Edit punya form tersendiri di baris detail.
- Tambah record dan pergantian pasien dikunci selama mengedit agar data tidak tertukar.
- Halaman berisi 10 record, terbaru lebih dulu. ID asli tetap sama saat pindah halaman.
- Delete berarti nonaktif, bukan menghilangkan riwayat blockchain.
- Pencabutan/penggantian role membatalkan izin dokter lama. Jika role didaftarkan kembali, pasien perlu memberikan izin baru.

**Gunakan data pasien fiktif. Semua storage, calldata, dan riwayat transaksi Sepolia bersifat publik. Pemeriksaan akses smart contract tidak mengenkripsi atau menyembunyikan data dari pengamat blockchain.**

## File penting

- `contracts/hospital-v2.sol`: kode baru untuk Remix.
- `src/MedicalRecordSystem.json`: ABI yang sudah dihasilkan dari kontrak ini.
- `src/config.js`: mengambil alamat kontrak dari `.env`.
- `src/DoctorDashboard.jsx`: form dan CRUD pemeriksaan dokter.
- `src/PatientRecords.jsx`: riwayat milik pasien sendiri.
- `src/RecordsTable.jsx`: tabel, detail, pagination, dan form edit.
- `src/PatientDashboard.jsx`: izin dokter dan riwayat pasien.
- `src/AdminDashboard.jsx`: pendaftaran role seperti sebelumnya.
- `backups/`: salinan dashboard dokter, App, dan ABI dari ZIP lama untuk pembanding. Bukan file yang dipakai aplikasi v2.

## 1. Deploy kontrak baru di Remix

1. Simpan folder proyek lama sebagai cadangan. Ekstrak ZIP v2 ke folder berbeda.
2. Di Remix buat file baru bernama `hospital-v2.sol`. Copy seluruh isi `contracts/hospital-v2.sol` ke sana.
3. Pada Solidity Compiler pilih **0.8.30**, aktifkan optimizer dengan **runs 200**, dan pilih **EVM version paris** pada pengaturan lanjut. Ini sama dengan konfigurasi compiler pengujian.
4. Compile `hospital-v2.sol`. Nama contract tetap `MedicalRecordSystem`.
5. Di MetaMask pilih akun yang akan menjadi **Admin**, serta jaringan **Ethereum Sepolia**. Akun ini memerlukan Sepolia ETH.
6. Pada Deploy & Run pilih provider ekstensi browser MetaMask (Browser Extension / Injected Provider). Pastikan akun dan jaringan sesuai.
7. Pilih `MedicalRecordSystem` dari file `hospital-v2.sol`. Biarkan Value **0**; tidak ada parameter constructor.
8. Klik Deploy dan konfirmasi di MetaMask. Tunggu transaksi berhasil.
9. Copy alamat kontrak baru dari Deployed Contracts.

Deploy ini menghasilkan kontrak baru. Role, izin, serta record dari kontrak lama tidak otomatis pindah. Record lama tetap berada di kontrak lama. Jangan memasukkan alamat kontrak lama ke aplikasi v2.

## 2. Alamat kontrak sudah dipasang

Web ini sudah diarahkan ke kontrak Sepolia:

`0x437aB65B04dccFC3A30F35892E89F8dC7dA3F936`

Alamat tersebut menjadi default di `src/config.js`. Langsung lanjut ke langkah 3; tidak perlu membuat `.env`.

Jika sudah mempunyai `.env` dari pengaturan sebelumnya, pastikan `VITE_CONTRACT_ADDRESS` berisi alamat di atas, atau hapus variabel tersebut agar default digunakan. Nilai `.env` akan menggantikan default. Restart Vite setelah mengubah `.env`.

Jika suatu saat deploy kontrak lain, copy `.env.example` menjadi `.env` di folder yang berisi `package.json`, lalu ganti alamatnya. Tidak perlu memasukkan private key atau seed phrase.

ABI yang disertakan sesuai dengan `contracts/hospital-v2.sol`. Jika kontrak diubah, jalankan `npm run compile:contract` untuk memperbarui ABI, lalu deploy ulang bila diperlukan.

## 3. Jalankan web

Di folder yang berisi `package.json`:

```cmd
npm install
npm run dev
```

Buka URL yang muncul di terminal, biasanya `http://localhost:5173/`. Biarkan terminal berjalan. Pada PowerShell jika `npm.ps1` diblokir, gunakan `npm.cmd install` dan `npm.cmd run dev`.

Jika `.env` diubah ketika Vite sedang berjalan, hentikan dengan Ctrl+C lalu jalankan lagi. Jangan membuka `index.html` langsung lewat File Explorer.

Remix boleh ditutup setelah deploy. Aplikasi berkomunikasi dengan kontrak yang sudah ada di Sepolia.

## 4. Daftarkan akun dan izin lagi

1. Hubungkan akun admin yang melakukan deploy. Dashboard menampilkan role Admin.
2. Daftarkan alamat wallet dokter sebagai Dokter.
3. Daftarkan alamat wallet pasien sebagai Pasien.
4. Ganti ke akun pasien di MetaMask. Jika akun belum tersedia di situs, izinkan koneksinya melalui MetaMask.
5. Di Dashboard Pasien masukkan alamat dokter, klik Berikan Izin, lalu konfirmasi transaksi.
6. Pasien dan dokter masing-masing perlu saldo Sepolia ETH untuk transaksi mereka sendiri.

Alamat pasien adalah identitas penghubung setiap record. Nama yang dokter isi merupakan data pada pemeriksaan tersebut. Perubahan nama atau pengukuran pada pemeriksaan baru tidak mengubah record sebelumnya.

## 5. Tes tambah, lihat, edit, dan delete

### Dokter

1. Pilih akun dokter. Isi wallet pasien yang sudah memberikan izin.
2. Klik Lihat / Refresh Record. Daftar awal kosong.
3. Buka Tambah pemeriksaan baru.
4. Isi contoh fiktif: nama `Pasien Demo`, tinggi `170.5`, berat `65.2`, diagnosis `Pemeriksaan simulasi`. Nama dan diagnosis wajib; kolom lainnya boleh kosong.
5. Lengkapi riwayat penyakit, alergi, keluhan, obat, dan catatan bila diperlukan.
6. Klik Tambah Record ke Blockchain, lalu konfirmasi MetaMask. Setelah transaksi berhasil tabel dimuat ulang.
7. Klik Lihat Detail untuk membaca isi lengkap.
8. Klik Edit pada record sendiri, ubah data dalam form edit, lalu Simpan Perubahan. Tambah record sementara dinonaktifkan selama edit.
9. Delete menonaktifkan record setelah konfirmasi browser dan transaksi MetaMask. Status menjadi Deleted dan tombol edit/delete hilang.

### Pasien

1. Ganti ke akun pasien yang sama.
2. Klik Lihat / Refresh Record Saya.
3. Tabel menampilkan record dokter untuk wallet pasien ini. Klik Lihat Detail untuk nama, pengukuran, riwayat, alergi, dan informasi lengkap.
4. Pasien tidak punya tombol edit/delete. Record Deleted tetap ditampilkan dengan statusnya.
5. Jika lebih dari 10 record, gunakan Berikutnya/Sebelumnya.

### Akses

- Dokter lain yang belum diberi izin tidak dapat memanggil fungsi baca/tulis aplikasi untuk pasien itu.
- Dokter kedua yang diberi izin dapat membaca dan membuat record sendiri, tetapi tidak mengedit/menghapus record dokter pertama.
- Admin mengelola role; tidak diberikan fungsi baca klinis melalui kontrak/aplikasi.
- Pasien kedua hanya melihat record wallet-nya sendiri.
- Coba cabut izin dokter dari akun pasien, lalu refresh sebagai dokter; akses harus ditolak.
- Larangan di atas adalah aturan akses fungsi aplikasi. Isi blockchain tetap publik.

## Cara data disimpan

`MedicalData` disimpan di setiap `Record`, di dalam mapping berdasarkan alamat pasien. Dokter pembuat, waktu dibuat, waktu diubah, dan status aktif disimpan bersama record. Waktu dibuat adalah waktu blok saat record ditambahkan; versi ini belum memiliki tanggal kunjungan terpisah.

Tinggi/berat memakai bilangan bulat dengan skala 10: `1705` berarti 170.5 cm; `652` berarti 65.2 kg. Web otomatis mengonversi satuan. Nilai nol berarti belum diukur, ditampilkan sebagai “Belum diukur”. Teks kosong berarti “Belum dicatat”, bukan otomatis “Tidak ada”.

Data panjang memerlukan gas lebih besar dibanding referensi singkat versi lama. Form membatasi panjang teks; batas kontrak dihitung dalam byte UTF-8. Satu karakter non-ASCII dapat memerlukan lebih dari satu byte. Field wajib: nama pasien dan diagnosis.

## Pemeriksaan otomatis

```cmd
npm test
npm run lint
npm run build
```

`npm test` mengompilasi kontrak, menghasilkan ABI, menjalankan pengujian smart contract pada blockchain lokal sementara, dan menguji validasi/render komponen React. Pengujian ini tidak membutuhkan saldo Sepolia atau MetaMask.

Sudah diverifikasi: 41 pemeriksaan kontrak serta 36 pemeriksaan validasi/render frontend; production build dan lint. Pengujian lokal ini bukan pengujian transaksi langsung dengan MetaMask di Sepolia. Lakukan urutan manual di atas setelah deploy ke alamat milik Anda.

Di beberapa versi Node, Ganache dapat menampilkan peringatan µWS lalu memakai implementasi JavaScript. Jika pengujian berakhir PASS, peringatan tersebut tidak menggagalkan tes.

Versi ini mengikuti tambahan rekam medis yang diminta. Belum menambahkan database/off-chain CRUD, jadwal kunjungan, atau akses darurat.
