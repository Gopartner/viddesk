# VIDGET — Video Devtools Window

[![CI](https://github.com/Gopartner/vidget/actions/workflows/ci.yml/badge.svg)](https://github.com/Gopartner/vidget/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-2b88d8)

Extension Chrome (Manifest V3) yang membuka **jendela mengambang bergaya Windows 11**
di atas halaman web. Jendela bisa digeser, diubah ukurannya, mengingat posisi
terakhir, dan dipakai untuk **mendeteksi, mengunduh, atau merekam video** yang
sedang diputar di halaman tersebut.

Semua UI dibangun dengan DOM API di dalam Shadow DOM — tanpa `innerHTML` — sehingga
tetap aman di situs yang mengaktifkan Trusted Types (YouTube, dan lain-lain).

## Fitur

- **Jendela mengambang**: drag pada titlebar, resize 8 arah, minimize, maximize,
  tombol close, serta readout status/ukuran/posisi.
- **Ingat tata letak**: ukuran dan posisi disimpan di `chrome.storage.local` dan
  dipulihkan saat jendela dibuka lagi.
- **Deteksi video otomatis** setiap 2,5 detik, termasuk pemindaian `iframe`
  same-origin (kedalaman 4).
- **Klasifikasi sumber**: `FILE` (URL file langsung), `STREAM` (HLS/DASH/blob/
  MediaSource), atau `DRM`.
- **Unduh langsung** ke folder `Downloads/VIDGET/` lewat `chrome.downloads`,
  lengkap dengan progress bar.
- **Rekam stream** memakai `captureStream()` + `MediaRecorder`, dengan pilihan
  "Rekam dari awal" atau "Rekam dari sini".
- **Penyimpanan fleksibel**: File System Access API (`showSaveFilePicker`) bila
  tersedia, fallback ke unduhan blob.
- **Pengaman**: blokir DRM, batas rekaman 512 MB, konfirmasi sebelum tab ditutup
  saat merekam, dan sanitasi nama file.

## Instalasi (mode pengembang)

1. Buka `chrome://extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** lalu pilih folder project ini
   (`D:\Video-Devtools-Window-chrome-extension`).
4. Pin extension **Video Devtools Window** ke toolbar.

Tidak perlu build step untuk memuat extension — file runtime ada langsung di root.

## Cara pakai

1. Buka halaman berisi video (YouTube, situs streaming, atau file video langsung).
2. Klik ikon extension di toolbar untuk membuka jendela VIDGET.
3. Kartu "Video di halaman ini" menampilkan sumber yang terdeteksi:
   - **FILE** → klik **Unduh video** (masuk ke `Downloads/VIDGET/`).
   - **STREAM** → klik **Rekam dari awal** atau **Rekam dari sini**, lalu
     **Stop & simpan**.
   - **DRM** → tidak bisa diunduh/direkam.
4. Klik ikon lagi (atau tombol close) untuk menutup jendela.

> Perekaman stream bersifat **real-time**: durasi rekaman sama dengan durasi
> pemutaran. Biarkan tab tetap aktif selama merekam.

## Izin & privasi

| Permission  | Dipakai untuk                                                        |
| ----------- | -------------------------------------------------------------------- |
| `activeTab` | Akses sementara ke tab aktif saat ikon diklik (untuk injeksi script) |
| `scripting` | Menyuntikkan `content.js` sesuai permintaan pengguna                 |
| `storage`   | Menyimpan posisi/ukuran jendela dan pemetaan progress unduhan        |
| `downloads` | Mengunduh file video dan memantau progress-nya                       |

Tidak ada `host_permissions` permanen, tidak ada `fetch`/XHR ke server mana pun,
dan tidak ada telemetri. Extension hanya bekerja setelah pengguna mengklik ikonnya.

## Struktur project

```
.
├── manifest.json              # deklarasi Manifest V3
├── background.js              # service worker: toggle, inject, unduhan
├── content.js                 # UI jendela + deteksi video + perekaman
├── icons/                     # ikon PNG (hasil generate) + icon.svg
├── scripts/
│   ├── generate-icons.mjs     # render ikon dari parameter desain
│   ├── validate-manifest.mjs  # cek manifest & file referensi
│   ├── package-extension.mjs  # zip rilis ke release/
│   └── lib/binary.mjs         # PNG & ZIP writer tanpa dependency
├── docs/ARCHITECTURE.md       # alur pesan, state, dan titik ekstensi
├── .github/workflows/         # CI + rilis otomatis
├── eslint.config.mjs
├── .prettierrc.json
└── package.json
```

## Pengembangan

```bash
npm install        # memasang ESLint & Prettier
npm run check      # format + lint + validasi manifest
npm run build      # membuat release/vidget-<version>.zip
npm run icons      # generate ulang icons/*.png dari scripts/generate-icons.mjs
```

Setelah mengubah `background.js`/`content.js`:

1. Buka `chrome://extensions` → klik **Reload** pada extension.
2. Refresh tab target (content script lama akan dibersihkan otomatis, tetapi
   refresh tetap disarankan).

Detail arsitektur dan alur pesan ada di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Batasan yang diketahui

- Hanya halaman `http(s)://`; `chrome://`, Chrome Web Store, dan `file://`
  tidak bisa disuntik.
- Player di **iframe cross-origin** tidak terdeteksi karena injeksi hanya di frame
  utama.
- Rekaman bersifat real-time dan bisa kehilangan frame bila tab di-background
  (pembatasan timer oleh browser).
- Video ber-DRM tidak didukung.
- Fallback blob (tanpa File System Access API) menyimpan rekaman di memori,
  dibatasi 512 MB.

## Roadmap

- Migrasi `content.js` ke modul TypeScript dengan bundler.
- Injeksi `all_frames` untuk player embed cross-origin.
- Unit test untuk logika pemilihan video dan sanitasi nama file.
- Opsi pengaturan (folder unduhan, kualitas rekaman, tema gelap).

## Lisensi

[MIT](LICENSE) © 2026 yudi billy (yudibilly)
