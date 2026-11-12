# Changelog

Semua perubahan penting pada project ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/)
dan project ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

### Rencana

- Migrasi `content.js` ke modul TypeScript + bundler (Vite/Rollup).
- Dukungan deteksi player di iframe cross-origin lewat `all_frames`.
- Unit test untuk pemilihan video, sanitasi nama file, dan klasifikasi stream.

## [2.1.0] - 2026-10-30

### Ditambahkan

- Jendela mengambang bergaya Windows 11 di dalam halaman (Shadow DOM).
- Geser, ubah ukuran 8 arah, minimize, maximize, dan ingat posisi/ukuran.
- Deteksi video otomatis tiap 2,5 detik dengan klasifikasi `FILE` / `STREAM` / `DRM`.
- Unduh file video langsung ke `Downloads/VIDGET/` beserta progress bar.
- Rekam stream (HLS/DASH/blob) memakai `MediaRecorder`, opsi "dari awal" atau "dari sini".
- Penyimpanan rekaman via File System Access API dengan fallback unduhan blob.
- Guard DRM, batas rekaman 512 MB, dan pencegahan tab tertutup saat merekam.

### Diubah

- Injeksi content script dilakukan saat ikon diklik, bukan lewat `content_scripts`.
- Pembersihan listener/host lama agar aman saat extension di-reload.

### Keamanan

- `host_permissions` dihapus; akses halaman memakai `activeTab` saat ikon diklik.
- UI dibangun tanpa `innerHTML`, aman untuk situs dengan Trusted Types.
