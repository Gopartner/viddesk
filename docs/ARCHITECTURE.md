# Arsitektur

Dokumen ini menjelaskan bagaimana VIDGET bekerja dan di mana harus menambah kode
saat mengembangkan fitur baru.

## Komponen

| Komponen       | File            | Tanggung jawab                                                                      |
| -------------- | --------------- | ----------------------------------------------------------------------------------- |
| Service worker | `background.js` | Menerima klik ikon, menyuntikkan `content.js`, memulai unduhan, meneruskan progress |
| Content script | `content.js`    | Membangun jendela (Shadow DOM), mendeteksi video, mengunduh/merekam                 |
| Manifest       | `manifest.json` | Permission, service worker, ikon, aksi toolbar                                      |

`content.js` **tidak** dideklarasikan di `content_scripts`. Service worker
menyuntiknya hanya saat pengguna mengklik ikon, sehingga `activeTab` cukup dan
tidak perlu host permission permanen.

## Alur pesan

```
[klik ikon toolbar]
        │
        ▼
background.js  ── chrome.action.onClicked ──► toggleWindow(tab)
        │
        │ 1. chrome.tabs.sendMessage({ type: "VIDGET_TOGGLE" })
        │        └─ gagal? (content script belum ada)
        │ 2. chrome.scripting.executeScript({ files: ["content.js"] })
        │ 3. kirim VIDGET_TOGGLE ulang
        ▼
content.js  toggle() ──► openWindow() / closeWindow()
        │
        │ response: { open: boolean, error?: string }
        ▼
background.js  ── gagal? ──► badge merah "!" + tooltip alasan (5 detik)

[unduh file langsung]
content.js  startVideoDownload()
        │  chrome.runtime.sendMessage({ type: "VIDGET_DOWNLOAD", url, filename, extension })
        ▼
background.js  startDownload() ──► chrome.downloads.download({ filename: "VIDGET/..." })
        │  catat pemetaan downloadId ➜ tabId (chrome.storage.session + Map)
        ▼
chrome.downloads.onChanged ──► background.js  sendDownloadProgress()
        │  chrome.tabs.sendMessage({ type: "VIDGET_DOWNLOAD_PROGRESS", ... })
        ▼
content.js  onDownloadProgress() ──► progress bar
```

## State di `content.js`

Semua state hidup di closure IIFE dan di-reset oleh `dispose()`.

| Variabel           | Isi                                                                     |
| ------------------ | ----------------------------------------------------------------------- |
| `host` / `shadow`  | Elemen `#vidget-window` dan ShadowRoot-nya                              |
| `state`            | `{ left, top, width, height, maximized }` (dipersist)                   |
| `minimized`        | Status minimize (tidak dipersist)                                       |
| `currentVideo`     | Elemen `<video>` terpilih                                               |
| `currentVideoInfo` | Hasil `getVideoInfo()`: `direct`, `isStream`, `isDrm`, metadata         |
| `downloadState`    | `idle` \| `downloading` \| `recording` \| `saving` \| `done` \| `error` |
| `recording`        | Objek rekaman aktif (recorder, writable, chunk, listener)               |

## Penyimpanan

| Key                        | Media                    | Isi                     |
| -------------------------- | ------------------------ | ----------------------- |
| `vidget-window-state-v1`   | `chrome.storage.local`   | posisi & ukuran jendela |
| `vidget-download-tab-<id>` | `chrome.storage.session` | `downloadId` ➜ `tabId`  |

## Keputusan unduh vs rekam

`getVideoInfo(video)` mengklasifikasikan sumber:

| Kondisi                                                                   | Klasifikasi    | Aksi                         |
| ------------------------------------------------------------------------- | -------------- | ---------------------------- |
| `video.mediaKeys` ada                                                     | `DRM`          | diblokir                     |
| URL `http(s)` / `data:video/*` dengan ekstensi media                      | `FILE`         | unduh via `chrome.downloads` |
| `blob:`, `mediastream:`, `filesystem:`, `.m3u8`, `.mpd`, atau `srcObject` | `STREAM`       | rekam via `MediaRecorder`    |
| Selain itu                                                                | tidak didukung | tombol disabled              |

Rekaman memakai `video.captureStream()`, sehingga hanya track yang sedang
diputar yang tertangkap (real-time). Untuk "rekam dari awal", video di-seek ke 0
lebih dulu; jika `seekable` tidak tersedia, rekaman dimulai dari posisi sekarang.

## Titik ekstensi

- **Situs/player baru**: perbaiki `collectVideos()` dan `pickVideo()` di
  `content.js` (bukan menambah manifest).
- **Format stream baru**: tambahkan pola di `isStreamUrl()` dan
  `extensionFromUrl()`.
- **Format rekaman baru**: tambahkan kandidat MIME di `pickRecordingMimeType()`.
- **Perubahan UI**: `buildUI()` + `renderVideoCard()`; jangan pakai `innerHTML`
  agar tetap kompatibel dengan Trusted Types.
- **Perubahan alur unduhan**: `background.js` (`startDownload`, `handleDownloadChanged`)
  dan `onDownloadProgress()` di `content.js`.
- **Permission**: `manifest.json`, lalu sesuaikan allow-list di
  `scripts/validate-manifest.mjs`.

## Siklus hidup injeksi

`content.js` aman disuntik berulang kali:

1. Listener `chrome.runtime.onMessage` dan `window.addEventListener("resize")`
   versi lama dilepas lewat referensi `window.__vidget*`.
2. `window.__vidgetCleanup` (fungsi `dispose`) dipanggil untuk menghentikan
   watcher dan rekaman serta menghapus host lama.
3. Host `#vidget-window` yang tertinggal dihapus, lalu UI dibangun ulang.

## Konvensi kode

- Target: Chrome MV3, ES2022, tanpa build step untuk runtime.
- Gaya: Prettier (80 kolom, double quotes, semicolon) + ESLint `recommended`.
- Scoping: seluruh logika `content.js` dibungkus IIFE; jangan menambah global
  baru kecuali referensi `window.__vidget*` untuk keperluan cleanup.
- Semua teks UI berbahasa Indonesia; komentar kode berbahasa Indonesia.
- Jalankan `npm run check` sebelum commit.
