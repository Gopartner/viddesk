"use strict";

/**
 * VIDGET — jendela mengambang bergaya Windows 11.
 *
 * Dimuat ke halaman oleh background.js saat ikon extension diklik.
 * Ukuran dan posisi disimpan di chrome.storage.local sehingga saat
 * jendela dibuka lagi nilainya kembali seperti terakhir diatur.
 *
 * Catatan: seluruh UI dibangun dengan DOM API (tanpa innerHTML) supaya
 * tetap berjalan di situs yang mengaktifkan Trusted Types (YouTube, dll).
 */
(() => {
  const STORAGE_KEY = "vidget-window-state-v1";
  const DEFAULT_WIDTH = 760;
  const DEFAULT_HEIGHT = 500;
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 260;
  const TITLEBAR_HEIGHT = 32;
  const EDGE_MARGIN = 24;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIDEO_REFRESH_MS = 2500;
  const MAX_RECORDING_BYTES = 512 * 1024 * 1024;

  // Setelah extension di-reload, listener lama di halaman ini mati. Bersihkan
  // sisa-sisanya supaya injeksi berikutnya bisa mendaftarkan listener baru
  // tanpa perlu refresh halaman.
  try {
    if (typeof window.__vidgetWindowListener === "function") {
      chrome.runtime.onMessage.removeListener(window.__vidgetWindowListener);
    }
  } catch (error) {
    /* konteks extension lama sudah tidak valid */
  }

  try {
    if (typeof window.__vidgetResizeListener === "function") {
      window.removeEventListener("resize", window.__vidgetResizeListener);
    }
  } catch (error) {
    /* abaikan */
  }

  try {
    if (typeof window.__vidgetCleanup === "function") {
      window.__vidgetCleanup();
    }
  } catch (error) {
    /* abaikan */
  }

  window.__vidgetWindowListener = null;
  window.__vidgetResizeListener = null;
  window.__vidgetCleanup = null;

  const staleHost = document.getElementById("vidget-window");
  if (staleHost) staleHost.remove();

  const STYLE = `
    :host {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      min-width: ${MIN_WIDTH}px;
      min-height: ${TITLEBAR_HEIGHT}px;
      overflow: hidden;
      color: #1b1b1b;
      background: #f3f3f3;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      box-shadow:
        0 32px 64px rgba(0, 0, 0, 0.24),
        0 2px 21px rgba(0, 0, 0, 0.14);
      font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color-scheme: light;
      -webkit-font-smoothing: antialiased;
    }

    :host([data-maximized="true"]) {
      border: 0;
      border-radius: 0;
    }

    :host([data-maximized="true"]) .resize-handle,
    :host([data-minimized="true"]) .resize-handle {
      display: none;
    }

    :host([data-minimized="true"]) .content {
      display: none;
    }

    .titlebar {
      position: relative;
      z-index: 2;
      display: flex;
      flex: 0 0 ${TITLEBAR_HEIGHT}px;
      height: ${TITLEBAR_HEIGHT}px;
      align-items: center;
      padding-left: 12px;
      background: transparent;
      user-select: none;
      cursor: default;
      touch-action: none;
    }

    .app-icon {
      display: inline-flex;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      color: #fff;
      background: linear-gradient(135deg, #2b88d8, #0067c0);
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
      line-height: 1;
    }

    .app-title {
      margin-left: 12px;
      overflow: hidden;
      color: #1b1b1b;
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.1px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .caption-buttons {
      display: flex;
      height: 100%;
      margin-left: auto;
      align-items: stretch;
    }

    .caption-button {
      display: flex;
      width: 46px;
      height: 100%;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      border-radius: 0;
      color: #1b1b1b;
      background: transparent;
      font: inherit;
      cursor: pointer;
      transition: background-color 0.1s ease;
    }

    .caption-button svg {
      display: block;
      width: 10px;
      height: 10px;
    }

    .caption-button:hover {
      background: rgba(0, 0, 0, 0.06);
    }

    .caption-button:active {
      background: rgba(0, 0, 0, 0.09);
    }

    .caption-button:focus-visible {
      outline: 2px solid #0067c0;
      outline-offset: -2px;
    }

    .caption-button.close:hover {
      color: #fff;
      background: #c42b1c;
    }

    .caption-button.close:active {
      background: #b02a1a;
    }

    .content {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 24px 24px 20px;
      background: #f9f9f9;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
    }

    .hero {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .hero-icon {
      display: flex;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      color: #fff;
      background: linear-gradient(135deg, #2b88d8, #0067c0);
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0, 103, 192, 0.25);
      font-size: 22px;
      font-weight: 600;
      line-height: 1;
    }

    h1 {
      margin: 0;
      color: #1b1b1b;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.2px;
      line-height: 1.2;
    }

    .hero p {
      margin: 2px 0 0;
      color: #5d5d5d;
      font-size: 13px;
    }

    .description {
      margin: 18px 0 20px;
      color: #5d5d5d;
      font-size: 12.5px;
      line-height: 1.6;
    }

    .card {
      overflow: hidden;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 11px 16px;
      font-size: 12.5px;
    }

    .card-row + .card-row {
      border-top: 1px solid rgba(0, 0, 0, 0.05);
    }

    .card-row .label {
      color: #5d5d5d;
    }

    .card-row .value {
      color: #1b1b1b;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      text-align: right;
    }

    [hidden] {
      display: none !important;
    }

    .card + .card {
      margin-top: 12px;
    }

    .video-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    }

    .video-head-title {
      color: #1b1b1b;
      font-size: 12px;
      font-weight: 600;
    }

    .video-badge {
      flex-shrink: 0;
      padding: 2px 7px;
      color: #005a9e;
      background: #e8f1fb;
      border-radius: 999px;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.4px;
      line-height: 1.5;
      text-transform: uppercase;
    }

    .video-badge[data-kind="stream"] {
      color: #8a5300;
      background: #fff4e5;
    }

    .video-badge[data-kind="drm"] {
      color: #a4262c;
      background: #fde7e9;
    }

    .video-badge[data-kind="none"] {
      color: #5d5d5d;
      background: #ededed;
    }

    .video-body {
      padding: 13px 16px 15px;
    }

    .video-title {
      overflow: hidden;
      color: #1b1b1b;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .video-meta {
      margin-top: 2px;
      color: #5d5d5d;
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
    }

    .video-hint {
      margin-top: 8px;
      color: #5d5d5d;
      font-size: 11.5px;
      line-height: 1.5;
    }

    .video-hint[data-tone="error"] {
      color: #c42b1c;
    }

    .video-hint[data-tone="success"] {
      color: #0f7b0f;
    }

    .video-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }

    .action-button {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      justify-content: center;
      padding: 0 14px;
      color: #fff;
      background: #0067c0;
      border: 1px solid transparent;
      border-radius: 4px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.1s ease;
    }

    .action-button:hover {
      background: #005a9e;
    }

    .action-button:active {
      background: #004f8a;
    }

    .action-button:focus-visible {
      outline: 2px solid #0067c0;
      outline-offset: 2px;
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .action-button.secondary {
      color: #1b1b1b;
      background: #fff;
      border-color: rgba(0, 0, 0, 0.12);
    }

    .action-button.secondary:hover {
      background: #f5f5f5;
    }

    .action-button.secondary:active {
      background: #ededed;
    }

    .progress {
      position: relative;
      height: 4px;
      margin-top: 10px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.08);
      border-radius: 2px;
    }

    .progress > span {
      display: block;
      width: 0;
      height: 100%;
      background: #0067c0;
      border-radius: inherit;
      transition: width 0.2s linear;
    }

    .progress[data-indeterminate="true"] > span {
      width: 35% !important;
      animation: vidget-progress 1.1s ease-in-out infinite;
    }

    @keyframes vidget-progress {
      from {
        transform: translateX(-110%);
      }
      to {
        transform: translateX(310%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .progress[data-indeterminate="true"] > span {
        width: 100% !important;
        opacity: 0.5;
        animation: none;
      }
    }

    .resize-handle {
      position: absolute;
      z-index: 6;
    }

    .resize-handle.n {
      top: 0;
      right: 12px;
      left: 12px;
      height: 5px;
      cursor: ns-resize;
    }

    .resize-handle.s {
      right: 12px;
      bottom: 0;
      left: 12px;
      height: 5px;
      cursor: ns-resize;
    }

    .resize-handle.e {
      top: 12px;
      right: 0;
      bottom: 12px;
      width: 5px;
      cursor: ew-resize;
    }

    .resize-handle.w {
      top: 12px;
      bottom: 12px;
      left: 0;
      width: 5px;
      cursor: ew-resize;
    }

    .resize-handle.ne {
      top: 0;
      right: 0;
      width: 14px;
      height: 14px;
      cursor: nesw-resize;
    }

    .resize-handle.nw {
      top: 0;
      left: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
    }

    .resize-handle.se {
      right: 0;
      bottom: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
    }

    .resize-handle.sw {
      bottom: 0;
      left: 0;
      width: 14px;
      height: 14px;
      cursor: nesw-resize;
    }
  `;

  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(STYLE);

  let host = null;
  let shadow = null;
  let ui = {};
  let state = null;
  let minimized = false;
  let drag = null;
  let resize = null;
  let opening = null;
  let videoRefreshTimer = null;
  let videoResetTimer = null;
  let currentVideoInfo = null;
  let recording = null;
  let downloadState = "idle";
  let activeDownloadId = null;
  let downloadFailed = false;
  let videoMessage = "";
  let videoTone = "";
  let beforeUnloadAttached = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  function element(tagName, className, text) {
    const node = document.createElement(tagName);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function svgNode(tagName, attributes) {
    const node = document.createElementNS(SVG_NS, tagName);

    Object.keys(attributes).forEach((name) => {
      node.setAttribute(name, attributes[name]);
    });

    return node;
  }

  function icon(kind) {
    const svg = svgNode("svg", {
      viewBox: "0 0 10 10",
      "aria-hidden": "true",
    });

    const stroke = {
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1",
    };

    if (kind === "minimize") {
      svg.appendChild(
        svgNode(
          "path",
          Object.assign({}, stroke, {
            d: "M1 5.5h8",
            "stroke-linecap": "round",
          })
        )
      );
    } else if (kind === "close") {
      svg.appendChild(
        svgNode(
          "path",
          Object.assign({}, stroke, {
            d: "M1.5 1.5l7 7M8.5 1.5l-7 7",
            "stroke-linecap": "round",
          })
        )
      );
    } else if (kind === "restore") {
      svg.appendChild(
        svgNode(
          "rect",
          Object.assign({}, stroke, {
            x: "1",
            y: "3",
            width: "6",
            height: "6",
            rx: "1",
          })
        )
      );

      svg.appendChild(
        svgNode(
          "path",
          Object.assign({}, stroke, {
            d: "M3.5 3V2.5A1.5 1.5 0 0 1 5 1h3.5A1.5 1.5 0 0 1 10 2.5V6a1.5 1.5 0 0 1-1.5 1.5H7",
          })
        )
      );
    } else {
      svg.appendChild(
        svgNode(
          "rect",
          Object.assign({}, stroke, {
            x: "1.5",
            y: "1.5",
            width: "7",
            height: "7",
            rx: "1",
          })
        )
      );
    }

    return svg;
  }

  function captionButton(action, label, kind) {
    const button = element(
      "button",
      "caption-button" + (action === "close" ? " close" : "")
    );

    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.appendChild(icon(kind));

    return button;
  }

  function cardRow(label, field) {
    const row = element("div", "card-row");
    const value = element("span", "value", field ? "—" : "Tersimpan otomatis");

    row.appendChild(element("span", "label", label));

    if (field) value.dataset.field = field;

    row.appendChild(value);

    return { row, value };
  }

  function formatDuration(value) {
    if (value === Infinity) return "LIVE";
    if (!Number.isFinite(value) || value < 0) return "—";

    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
      return (
        hours +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0")
      );
    }

    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function formatBytes(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }

    return size.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
  }

  function cleanVideoTitle(value) {
    const title = String(value || "Video")
      .replace(/\s*[-–—|]\s*YouTube(?:\s+Music)?\s*$/i, "")
      .replace(/\s*[-–—|]\s*Google Chrome\s*$/i, "")
      .trim();

    return title || "Video";
  }

  function extensionFromUrl(url) {
    try {
      const path = new URL(url, location.href).pathname;
      const match = path.match(/\.([a-z0-9]{2,5})$/i);

      if (!match) return "";

      const extension = match[1].toLowerCase();

      return ["mp4", "webm", "ogg", "ogv", "m4v", "mov", "mkv"].includes(
        extension
      )
        ? extension
        : "";
    } catch (error) {
      return "";
    }
  }

  function isStreamUrl(url) {
    if (!url) return true;
    if (/^(blob:|mediastream:|filesystem:)/i.test(url)) return true;

    try {
      const path = new URL(url, location.href).pathname.toLowerCase();

      return path.endsWith(".m3u8") || path.endsWith(".mpd");
    } catch (error) {
      return true;
    }
  }

  function collectVideos(root, out, depth) {
    if (!root || depth > 4) return;

    let videos;

    try {
      videos = root.querySelectorAll("video");
    } catch (error) {
      videos = [];
    }

    videos.forEach((video) => {
      if (!out.includes(video)) out.push(video);
    });

    let frames;

    try {
      frames = root.querySelectorAll("iframe");
    } catch (error) {
      frames = [];
    }

    frames.forEach((frame) => {
      try {
        const subdocument = frame.contentDocument;

        if (subdocument) collectVideos(subdocument, out, depth + 1);
      } catch (error) {
        /* iframe lintas situs tidak bisa diakses */
      }
    });
  }

  function videoArea(video) {
    const width = video.videoWidth || video.clientWidth || 0;
    const height = video.videoHeight || video.clientHeight || 0;

    return width * height;
  }

  function pickVideo(videos) {
    const usable = videos.filter((video) => {
      if (!video || video.tagName !== "VIDEO" || !video.isConnected) {
        return false;
      }

      if (!video.currentSrc && !video.src && !video.srcObject) {
        const source =
          video.querySelector && video.querySelector("source[src]");

        if (!source) return false;
      }

      const rect = video.getBoundingClientRect();

      if (rect.width < 40 && rect.height < 40) return false;

      return true;
    });

    if (!usable.length) return null;

    const playing = usable.filter(
      (video) => !video.paused && !video.ended && video.readyState >= 2
    );

    const pool = playing.length ? playing : usable;

    return pool.slice().sort((a, b) => videoArea(b) - videoArea(a))[0];
  }

  function getVideoInfo(video) {
    if (!video) return null;

    let src = video.currentSrc || video.src || "";

    if (!src && video.querySelector) {
      const source = video.querySelector("source[src]");

      if (source) src = source.src || source.getAttribute("src") || "";
    }

    const isDrm = Boolean(video.mediaKeys);
    const hasStreamSource =
      Boolean(video.srcObject) ||
      /^(blob:|mediastream:|filesystem:)/i.test(src) ||
      (!src && video.readyState > 0);

    const isStream = !isDrm && (hasStreamSource || isStreamUrl(src));
    const direct = !isDrm && !isStream && /^(https?:|data:video\/)/i.test(src);

    const title = cleanVideoTitle(
      video.getAttribute("title") ||
        video.getAttribute("aria-label") ||
        (video.ownerDocument && video.ownerDocument.title) ||
        document.title ||
        "Video"
    );

    return {
      video,
      src,
      title,
      isDrm,
      isStream,
      direct,
      extension: direct ? extensionFromUrl(src) : "",
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      duration: video.duration,
      canSeek: Boolean(video.seekable && video.seekable.length > 0),
      currentTime: video.currentTime || 0,
    };
  }

  function safeSuggestedName(title, extension) {
    let base = String(title || "video")
      // eslint-disable-next-line no-control-regex -- buang karakter kontrol dari nama file
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .replace(/[. ]+$/g, "");

    if (!base) base = "video";
    if (base.length > 100) base = base.slice(0, 100).trim();

    const suffix = "." + extension;

    if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
      base = base
        .slice(0, -suffix.length)
        .trim()
        .replace(/[. ]+$/g, "");
      if (!base) base = "video";
    }

    return base + suffix;
  }

  function pickRecordingMimeType() {
    const candidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(type)) return type;
      } catch (error) {
        /* lanjut ke kandidat berikutnya */
      }
    }

    return "";
  }

  function bitrateFor(video) {
    const pixels = Math.max(
      1,
      (video.videoWidth || 1280) * (video.videoHeight || 720)
    );

    return Math.min(20000000, Math.max(1500000, Math.round(pixels * 2.2)));
  }

  function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (ok) => {
        if (settled) return;

        settled = true;
        video.removeEventListener("seeked", onSeeked);
        clearTimeout(timer);

        if (ok) {
          resolve();
        } else {
          reject(new Error("Seek timeout"));
        }
      };

      const onSeeked = () => finish(true);
      const timer = setTimeout(() => finish(false), 3000);

      video.addEventListener("seeked", onSeeked);

      try {
        video.currentTime = time;
      } catch (error) {
        finish(false);
      }
    });
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    (document.body || document.documentElement).appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function buildUI() {
    const titlebar = element("header", "titlebar");
    titlebar.setAttribute("part", "titlebar");

    const appIcon = element("span", "app-icon", "V");
    appIcon.setAttribute("aria-hidden", "true");

    const captions = element("div", "caption-buttons");
    const minimize = captionButton("minimize", "Minimize", "minimize");
    const maximize = captionButton("maximize", "Maximize", "maximize");
    const close = captionButton("close", "Close", "close");

    captions.append(minimize, maximize, close);

    titlebar.append(appIcon, element("span", "app-title", "VIDGET"), captions);

    const hero = element("div", "hero");
    const heroIcon = element("div", "hero-icon", "V");
    heroIcon.setAttribute("aria-hidden", "true");

    const heroText = element("div");
    heroText.append(
      element("h1", null, "VIDGET"),
      element("p", null, "Video Finder")
    );

    hero.append(heroIcon, heroText);

    const description = element(
      "p",
      "description",
      "Geser title bar untuk memindahkan jendela. Tarik tepi atau sudut jendela untuk mengubah ukurannya."
    );

    const videoCard = element("section", "card video-card");
    videoCard.setAttribute("aria-label", "Unduh video");

    const videoHead = element("div", "video-head");
    const videoBadge = element("span", "video-badge", "—");
    videoBadge.dataset.kind = "none";

    videoHead.append(
      element("span", "video-head-title", "Video di halaman ini"),
      videoBadge
    );

    const videoBody = element("div", "video-body");
    const videoTitle = element("div", "video-title", "Mendeteksi video…");
    const videoMeta = element("div", "video-meta", "—");
    const videoHint = element("div", "video-hint", "");
    const videoActions = element("div", "video-actions");

    const videoButton = element("button", "action-button", "Unduh video");
    videoButton.type = "button";
    videoButton.dataset.action = "video-primary";

    const videoSecondary = element(
      "button",
      "action-button secondary",
      "Rekam dari sini"
    );
    videoSecondary.type = "button";
    videoSecondary.dataset.action = "video-secondary";
    videoSecondary.hidden = true;

    videoActions.append(videoButton, videoSecondary);

    const videoProgress = element("div", "progress");
    videoProgress.hidden = true;

    const videoProgressBar = element("span");
    videoProgress.appendChild(videoProgressBar);

    videoBody.append(
      videoTitle,
      videoMeta,
      videoHint,
      videoActions,
      videoProgress
    );

    videoCard.append(videoHead, videoBody);

    const infoCard = element("section", "card");
    infoCard.setAttribute("aria-label", "Informasi jendela");

    const statusRow = cardRow("Status", "status");
    const sizeRow = cardRow("Ukuran", "size");
    const positionRow = cardRow("Posisi", "position");
    const storageRow = cardRow("Penyimpanan", null);

    infoCard.append(
      statusRow.row,
      sizeRow.row,
      positionRow.row,
      storageRow.row
    );

    const content = element("main", "content");
    content.append(hero, description, videoCard, infoCard);

    const fragment = document.createDocumentFragment();
    fragment.append(titlebar, content);

    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((direction) => {
      const handle = element("div", "resize-handle " + direction);
      handle.dataset.dir = direction;
      fragment.appendChild(handle);
    });

    return {
      fragment,
      titlebar,
      captions,
      maximize,
      status: statusRow.value,
      size: sizeRow.value,
      position: positionRow.value,
      videoBadge,
      videoTitle,
      videoMeta,
      videoHint,
      videoActions,
      videoButton,
      videoSecondary,
      videoProgress,
      videoProgressBar,
    };
  }

  function normalize(saved) {
    const vp = viewport();
    const maxWidth = Math.max(MIN_WIDTH, vp.width - EDGE_MARGIN);
    const maxHeight = Math.max(MIN_HEIGHT, vp.height - EDGE_MARGIN);

    const width = clamp(
      saved ? saved.width : DEFAULT_WIDTH,
      MIN_WIDTH,
      maxWidth
    );

    const height = clamp(
      saved ? saved.height : DEFAULT_HEIGHT,
      MIN_HEIGHT,
      maxHeight
    );

    const left = clamp(
      saved ? saved.left : Math.round((vp.width - width) / 2),
      0,
      Math.max(0, vp.width - width)
    );

    const top = clamp(
      saved ? saved.top : Math.round((vp.height - height) / 2),
      0,
      Math.max(0, vp.height - TITLEBAR_HEIGHT)
    );

    return {
      left,
      top,
      width,
      height,
      maximized: saved ? saved.maximized === true : false,
    };
  }

  async function loadState() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const saved = stored && stored[STORAGE_KEY];

      if (
        saved &&
        Number.isFinite(saved.width) &&
        Number.isFinite(saved.height) &&
        Number.isFinite(saved.left) &&
        Number.isFinite(saved.top)
      ) {
        return saved;
      }
    } catch (error) {
      console.warn("[VIDGET] Gagal membaca ukuran/posisi tersimpan:", error);
    }

    return null;
  }

  async function persist() {
    if (!state) return;

    const payload = {
      left: Math.round(state.left),
      top: Math.round(state.top),
      width: Math.round(state.width),
      height: Math.round(state.height),
      maximized: state.maximized === true,
    };

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } catch (error) {
      console.warn("[VIDGET] Gagal menyimpan ukuran/posisi:", error);
    }
  }

  function updateCaption() {
    if (!ui.maximize) return;

    const maximized = state.maximized === true;

    ui.maximize.replaceChildren(icon(maximized ? "restore" : "maximize"));

    ui.maximize.title = maximized ? "Restore" : "Maximize";
    ui.maximize.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
  }

  function updateReadout() {
    if (!ui.size) return;

    const vp = viewport();
    const shownWidth = state.maximized ? vp.width : state.width;
    const shownHeight = state.maximized
      ? vp.height
      : minimized
        ? TITLEBAR_HEIGHT
        : state.height;

    ui.size.textContent =
      Math.round(shownWidth) + " × " + Math.round(shownHeight) + " px";

    ui.position.textContent =
      Math.round(state.left) + ", " + Math.round(state.top) + " px";

    ui.status.textContent = state.maximized
      ? "Maximized"
      : minimized
        ? "Minimized"
        : "Normal";
  }

  function applyGeometry() {
    if (!host || !state) return;

    const vp = viewport();

    if (state.maximized) {
      host.style.left = "0px";
      host.style.top = "0px";
      host.style.width = vp.width + "px";
      host.style.height = vp.height + "px";
    } else {
      host.style.left = Math.round(state.left) + "px";
      host.style.top = Math.round(state.top) + "px";
      host.style.width = Math.round(state.width) + "px";
      host.style.height =
        (minimized ? TITLEBAR_HEIGHT : Math.round(state.height)) + "px";
    }

    host.dataset.maximized = state.maximized ? "true" : "false";
    host.dataset.minimized = minimized ? "true" : "false";

    updateCaption();
    updateReadout();
  }

  function allHandles() {
    return shadow.querySelectorAll(".resize-handle");
  }

  function toggleMaximize() {
    state.maximized = !state.maximized;
    minimized = false;
    applyGeometry();
    persist();
  }

  function toggleMinimize() {
    minimized = !minimized;

    if (minimized) {
      state.maximized = false;
    }

    applyGeometry();
  }

  function closeWindow() {
    if (!host) return;

    persist();
    dispose();
  }

  function setVideoProgress(value) {
    if (!ui.videoProgress || !ui.videoProgressBar) return;

    ui.videoProgress.hidden = false;

    if (value === null) {
      ui.videoProgress.dataset.indeterminate = "true";
      ui.videoProgressBar.style.width = "35%";
      return;
    }

    delete ui.videoProgress.dataset.indeterminate;
    ui.videoProgressBar.style.width =
      Math.max(0, Math.min(100, value * 100)) + "%";
  }

  function hideVideoProgress() {
    if (!ui.videoProgress) return;

    ui.videoProgress.hidden = true;
    delete ui.videoProgress.dataset.indeterminate;

    if (ui.videoProgressBar) ui.videoProgressBar.style.width = "0%";
  }

  function scheduleVideoReset(delay) {
    if (videoResetTimer) clearTimeout(videoResetTimer);

    videoResetTimer = setTimeout(() => {
      videoResetTimer = null;

      if (recording) return;

      downloadState = "idle";
      videoMessage = "";
      videoTone = "";
      hideVideoProgress();
      renderVideoCard();
    }, delay);
  }

  function setVideoError(message) {
    downloadState = "error";
    videoMessage = message;
    videoTone = "error";
    hideVideoProgress();
    renderVideoCard();
    scheduleVideoReset(8000);
  }

  function renderVideoCard() {
    if (!ui.videoTitle) return;

    const info = currentVideoInfo;
    const isRecording = Boolean(recording) && downloadState === "recording";
    const isDownloading = downloadState === "downloading";
    const isSaving = downloadState === "saving";
    const isDone = downloadState === "done";
    const isError = downloadState === "error";

    let badge = "—";
    let kind = "none";
    let title = "Tidak ada video terdeteksi";
    let meta = "Putar video di halaman ini.";
    let hint;
    let tone = "";
    let primaryLabel = "Unduh video";
    let primaryDisabled = true;
    let secondaryVisible = false;

    if (info) {
      title = info.title;
      badge = info.isDrm
        ? "DRM"
        : info.direct
          ? "FILE"
          : info.isStream
            ? "STREAM"
            : "—";

      kind = info.isDrm
        ? "drm"
        : info.direct
          ? "file"
          : info.isStream
            ? "stream"
            : "none";

      const metaParts = [];

      if (info.width && info.height) {
        metaParts.push(info.width + "×" + info.height);
      }

      metaParts.push(
        Number.isFinite(info.duration)
          ? formatDuration(info.duration)
          : info.duration === Infinity
            ? "LIVE"
            : "—"
      );

      if (info.isDrm) {
        metaParts.push("DRM");
      } else if (info.direct) {
        metaParts.push(info.extension ? info.extension.toUpperCase() : "File");
      } else if (info.isStream) {
        metaParts.push("Stream");
      }

      meta = metaParts.join(" · ");

      const canStartFromBeginning =
        info.isStream &&
        !info.isDrm &&
        Number.isFinite(info.duration) &&
        info.duration > 0 &&
        info.canSeek;

      if (info.isDrm) {
        hint =
          "Video ini dilindungi DRM sehingga tidak bisa diunduh atau direkam.";
        primaryLabel = "Tidak bisa diunduh";
      } else if (info.direct) {
        primaryLabel = "Unduh video";
        primaryDisabled = false;
        hint = "File asli akan diunduh ke folder Unduhan/VIDGET.";

        if (downloadFailed) {
          hint =
            "Unduhan langsung gagal. Gunakan “Rekam dari sini” sebagai alternatif.";
          secondaryVisible = true;
        }
      } else if (info.isStream) {
        primaryDisabled = false;

        if (canStartFromBeginning) {
          primaryLabel = "Rekam dari awal";
          secondaryVisible = info.currentTime > 0.5;
          hint =
            "Stream direkam real-time. “Dari awal” memutar ulang video; “Dari sini” mulai dari posisi sekarang.";
        } else {
          primaryLabel =
            info.duration === Infinity ? "Rekam live" : "Rekam dari sini";
          hint =
            info.duration === Infinity
              ? "Live stream direkam real-time. Tekan Stop & simpan saat selesai."
              : "Stream direkam real-time dari posisi saat ini. Jangan geser video saat merekam.";
        }
      } else {
        hint = "Jenis video ini belum didukung untuk diunduh.";
        primaryLabel = "Tidak didukung";
      }

      if (downloadFailed) secondaryVisible = true;
    } else {
      hint =
        "Tidak ada video di halaman ini. Video akan terdeteksi otomatis saat diputar.";
    }

    if (isRecording) {
      primaryLabel = "Stop & simpan";
      primaryDisabled = false;
      secondaryVisible = false;
      hint = videoMessage || "Merekam…";
      tone = videoTone;
    } else if (isDownloading) {
      primaryLabel = "Mengunduh…";
      primaryDisabled = true;
      secondaryVisible = false;
      hint = videoMessage || "Mengunduh…";
      tone = videoTone;
    } else if (isSaving) {
      primaryLabel = "Menyimpan…";
      primaryDisabled = true;
      secondaryVisible = false;
      hint = videoMessage || "Menyimpan rekaman…";
      tone = videoTone;
    } else if (isDone) {
      hint = videoMessage || "Selesai.";
      tone = videoTone || "success";
    } else if (isError) {
      hint = videoMessage || "Terjadi kesalahan.";
      tone = "error";
    } else {
      if (videoMessage) {
        hint = videoMessage;
        tone = videoTone;
      }

      if (ui.videoProgress && !ui.videoProgress.hidden) hideVideoProgress();
    }

    ui.videoBadge.textContent = badge;
    ui.videoBadge.dataset.kind = kind;
    ui.videoTitle.textContent = title;
    ui.videoMeta.textContent = meta;
    ui.videoHint.textContent = hint;

    if (tone) {
      ui.videoHint.dataset.tone = tone;
    } else {
      delete ui.videoHint.dataset.tone;
    }

    ui.videoButton.textContent = primaryLabel;
    ui.videoButton.disabled = primaryDisabled;
    ui.videoSecondary.hidden = !secondaryVisible;
    ui.videoSecondary.disabled = isDownloading || isSaving || isRecording;
  }

  function refreshVideo() {
    if (!host) return;
    if (
      recording ||
      downloadState === "downloading" ||
      downloadState === "saving"
    ) {
      return;
    }

    const previousInfo = currentVideoInfo;
    const videos = [];

    collectVideos(document, videos, 0);

    const nextVideo = pickVideo(videos);

    currentVideoInfo = nextVideo ? getVideoInfo(nextVideo) : null;

    const changed =
      (previousInfo && !currentVideoInfo) ||
      (previousInfo &&
        currentVideoInfo &&
        (previousInfo.video !== currentVideoInfo.video ||
          previousInfo.src !== currentVideoInfo.src));

    if (changed) {
      downloadFailed = false;

      if (downloadState === "error" || downloadState === "done") {
        downloadState = "idle";
        videoMessage = "";
        videoTone = "";
        hideVideoProgress();
      }
    }

    renderVideoCard();
  }

  function startVideoWatcher() {
    stopVideoWatcher();
    refreshVideo();
    videoRefreshTimer = window.setInterval(refreshVideo, VIDEO_REFRESH_MS);
  }

  function stopVideoWatcher() {
    if (videoRefreshTimer !== null) {
      clearInterval(videoRefreshTimer);
      videoRefreshTimer = null;
    }
  }

  function onDownloadProgress(message) {
    if (!message || message.type !== "VIDGET_DOWNLOAD_PROGRESS") return;
    if (downloadState !== "downloading" && downloadState !== "done") return;
    if (downloadState === "done" && message.state === "in_progress") return;
    if (activeDownloadId !== null && message.downloadId !== activeDownloadId) {
      return;
    }

    if (activeDownloadId === null) activeDownloadId = message.downloadId;

    if (message.state === "in_progress") {
      downloadState = "downloading";

      const total = Number(message.totalBytes) || 0;
      const received = Number(message.bytesReceived) || 0;

      if (total > 0) {
        const fraction = Math.min(1, received / total);
        const percent = Math.round(fraction * 100);

        videoMessage =
          "Mengunduh… " +
          percent +
          "% (" +
          formatBytes(received) +
          " / " +
          formatBytes(total) +
          ")";

        setVideoProgress(fraction);
      } else {
        videoMessage = "Mengunduh… " + formatBytes(received);
        setVideoProgress(null);
      }

      videoTone = "";
    } else if (message.state === "complete") {
      downloadState = "done";
      downloadFailed = false;
      videoMessage = "Selesai diunduh.";
      videoTone = "success";
      setVideoProgress(1);
      scheduleVideoReset(5000);
    } else if (message.state === "interrupted") {
      downloadState = "error";
      downloadFailed = true;
      videoMessage =
        "Unduhan gagal" +
        (message.error ? ": " + message.error : ".") +
        " Coba rekam dari sini.";
      videoTone = "error";
      hideVideoProgress();
      scheduleVideoReset(8000);
    }

    if (host) renderVideoCard();
  }

  function onVideoClick(event) {
    const button = event.target.closest(".action-button");

    if (!button || button.disabled) return;

    if (downloadState === "recording") {
      if (button.dataset.action === "video-primary") stopRecording();
      return;
    }

    if (downloadState === "downloading" || downloadState === "saving") return;

    const info = currentVideoInfo;

    if (!info) return;

    if (button.dataset.action === "video-secondary") {
      downloadFailed = false;
      startRecording(info, false);
      return;
    }

    if (button.dataset.action !== "video-primary") return;
    if (info.isDrm) return;

    if (info.direct) {
      startVideoDownload(info);
      return;
    }

    if (info.isStream) {
      downloadFailed = false;
      startRecording(
        info,
        Number.isFinite(info.duration) && info.duration > 0 && info.canSeek
      );
    }
  }

  async function startVideoDownload(info) {
    if (!info || !info.direct || !info.src) return;

    downloadFailed = false;
    downloadState = "downloading";
    activeDownloadId = null;
    videoMessage = "Mengunduh…";
    videoTone = "";
    setVideoProgress(null);
    renderVideoCard();

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "VIDGET_DOWNLOAD",
            url: info.src,
            filename: info.title,
            extension: info.extension,
          },
          (result) => {
            const lastError = chrome.runtime.lastError;

            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }

            resolve(result);
          }
        );
      });

      if (!response || response.error) {
        throw new Error(
          (response && response.error) || "Gagal memulai unduhan."
        );
      }

      activeDownloadId = response.downloadId;
    } catch (error) {
      downloadFailed = true;
      downloadState = "error";
      videoMessage =
        "Gagal mengunduh: " +
        ((error && error.message) || "tidak diketahui") +
        " Coba rekam dari sini.";
      videoTone = "error";
      hideVideoProgress();
      renderVideoCard();
      scheduleVideoReset(8000);
    }
  }

  async function startRecording(info, fromBeginning) {
    if (!info || !info.video || recording) return;

    if (info.isDrm) {
      setVideoError("Video ini dilindungi DRM sehingga tidak bisa direkam.");
      return;
    }

    if (
      typeof MediaRecorder === "undefined" ||
      typeof info.video.captureStream !== "function"
    ) {
      setVideoError("Browser ini tidak mendukung perekaman video.");
      return;
    }

    const video = info.video;
    const requestedPosition = video.currentTime;
    const mimeType = pickRecordingMimeType();
    const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const filename = safeSuggestedName(info.title, extension);
    let writable = null;

    if (
      window.isSecureContext &&
      typeof window.showSaveFilePicker === "function"
    ) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: extension === "mp4" ? "Video MP4" : "Video WebM",
              accept: {
                [extension === "mp4" ? "video/mp4" : "video/webm"]: [
                  "." + extension,
                ],
              },
            },
          ],
        });

        writable = await handle.createWritable();
      } catch (error) {
        if (error && error.name === "AbortError") {
          downloadState = "idle";
          videoMessage = "Dibatalkan.";
          videoTone = "";
          renderVideoCard();
          scheduleVideoReset(2000);
          return;
        }

        // Picker tidak tersedia/ditolak: lanjutkan dengan unduhan blob.
        writable = null;
      }
    }

    const canSeek =
      Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.seekable &&
      video.seekable.length > 0;

    if (fromBeginning && canSeek && video.currentTime > 0.25) {
      try {
        await seekVideo(video, 0);
      } catch (error) {
        /* lanjut dari posisi saat ini */
      }
    } else if (
      !fromBeginning &&
      canSeek &&
      Math.abs(video.currentTime - requestedPosition) > 1
    ) {
      try {
        await seekVideo(video, requestedPosition);
      } catch (error) {
        /* lanjut dari posisi saat ini */
      }
    }

    if (video.paused) {
      try {
        await video.play();
      } catch (error) {
        if (writable) {
          try {
            await writable.abort();
          } catch (abortError) {
            /* abaikan */
          }
        }

        setVideoError(
          "Tidak bisa memutar video. Tekan play pada video lalu coba lagi."
        );
        return;
      }
    }

    let stream;

    try {
      stream = video.captureStream();
    } catch (error) {
      if (writable) {
        try {
          await writable.abort();
        } catch (abortError) {
          /* abaikan */
        }
      }

      setVideoError(
        "Video ini tidak bisa direkam (mungkin beda origin atau dilindungi DRM)."
      );
      return;
    }

    if (!stream || stream.getVideoTracks().length === 0) {
      if (writable) {
        try {
          await writable.abort();
        } catch (abortError) {
          /* abaikan */
        }
      }

      setVideoError("Tidak ada track video yang bisa direkam.");
      return;
    }

    const recorderOptions = {
      videoBitsPerSecond: bitrateFor(video),
      audioBitsPerSecond: 128000,
    };

    if (mimeType) recorderOptions.mimeType = mimeType;

    let recorder;

    try {
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch (error) {
      if (writable) {
        try {
          await writable.abort();
        } catch (abortError) {
          /* abaikan */
        }
      }

      setVideoError("Gagal membuat perekam: " + (error.message || "unknown"));
      return;
    }

    const record = {
      video,
      recorder,
      stream,
      chunks: [],
      writable,
      mimeType,
      extension,
      filename,
      startPosition: video.currentTime,
      targetDuration: Number.isFinite(video.duration)
        ? Math.max(0, video.duration - video.currentTime)
        : Infinity,
      startedAt: performance.now(),
      bytes: 0,
      sizeTimer: null,
      listeners: [],
      writeQueue: Promise.resolve(),
      writeError: null,
      discard: false,
      errorMessage: "",
      limitReached: false,
      finalized: false,
      stopping: false,
    };

    recording = record;
    downloadState = "recording";
    videoMessage = "";
    videoTone = "";
    setVideoProgress(0);
    renderVideoCard();
    addBeforeUnload();

    const onPause = () => {
      try {
        if (recorder.state === "recording") recorder.pause();
      } catch (error) {
        /* abaikan */
      }

      updateRecordingStatus();
    };

    const onPlay = () => {
      try {
        if (recorder.state === "paused") recorder.resume();
      } catch (error) {
        /* abaikan */
      }

      updateRecordingStatus();
    };

    const onEnded = () => stopRecording();

    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("ended", onEnded);
    record.listeners = [
      ["pause", onPause],
      ["play", onPlay],
      ["ended", onEnded],
    ];

    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data || !event.data.size) return;

      record.bytes += event.data.size;

      if (record.writable) {
        const chunk = event.data;

        record.writeQueue = record.writeQueue
          .then(() => record.writable.write(chunk))
          .catch((error) => {
            record.writeError = error;
          });
      } else {
        record.chunks.push(event.data);

        if (record.bytes > MAX_RECORDING_BYTES && recording === record) {
          record.limitReached = true;
          stopRecording();
        }
      }
    });

    recorder.addEventListener("error", (event) => {
      const message =
        (event.error && event.error.message) || "MediaRecorder error";

      record.discard = true;
      record.errorMessage = "Perekaman gagal: " + message;
      stopRecording({ discard: true });
    });

    recorder.addEventListener("stop", () => {
      finalizeRecording(record);
    });

    try {
      recorder.start(1000);
    } catch (error) {
      cleanupRecordingListeners(record);
      recording = null;
      removeBeforeUnload();

      if (writable) {
        try {
          await writable.abort();
        } catch (abortError) {
          /* abaikan */
        }
      }

      setVideoError("Gagal memulai perekaman: " + (error.message || "unknown"));
      return;
    }

    record.sizeTimer = setInterval(updateRecordingStatus, 500);
    updateRecordingStatus();
  }

  function stopRecording(options = {}) {
    const record = recording;

    if (!record) return;
    if (record.stopping) return;

    record.stopping = true;

    if (options.discard) record.discard = true;

    downloadState = "saving";
    videoMessage = "Menyimpan rekaman…";
    videoTone = "";
    renderVideoCard();

    try {
      if (record.recorder.state !== "inactive") {
        record.recorder.stop();
      } else {
        finalizeRecording(record);
      }
    } catch (error) {
      record.discard = true;
      record.errorMessage =
        "Gagal menghentikan perekaman: " + (error.message || "unknown");
      finalizeRecording(record);
    }
  }

  function cleanupRecordingListeners(record) {
    if (!record) return;

    record.listeners.forEach(([name, handler]) => {
      try {
        record.video.removeEventListener(name, handler);
      } catch (error) {
        /* abaikan */
      }
    });

    record.listeners = [];
  }

  async function finalizeRecording(record) {
    if (!record || record.finalized) return;

    record.finalized = true;

    if (record.sizeTimer) {
      clearInterval(record.sizeTimer);
      record.sizeTimer = null;
    }

    cleanupRecordingListeners(record);

    if (recording === record) recording = null;

    if (record.discard) {
      if (record.writable) {
        try {
          await record.writable.abort();
        } catch (error) {
          /* abaikan */
        }
      }

      removeBeforeUnload();
      setVideoError(record.errorMessage || "Perekaman gagal.");
      return;
    }

    downloadState = "saving";
    videoMessage = "Menyimpan rekaman…";
    videoTone = "";
    renderVideoCard();

    if (record.writable) {
      try {
        await record.writeQueue;

        if (record.writeError) {
          try {
            await record.writable.abort();
          } catch (error) {
            /* abaikan */
          }

          throw record.writeError;
        }

        await record.writable.close();

        downloadState = "done";
        videoMessage =
          "Rekaman disimpan" +
          (record.limitReached ? " (batas ukuran tercapai)" : "") +
          " (" +
          formatBytes(record.bytes) +
          ").";
        videoTone = "success";
        setVideoProgress(1);
      } catch (error) {
        downloadState = "error";
        videoMessage =
          "Gagal menyimpan rekaman: " +
          ((error && error.message) || "tidak diketahui");
        videoTone = "error";
        hideVideoProgress();
      }
    } else {
      try {
        const blob = new Blob(record.chunks, {
          type: record.mimeType.split(";")[0] || "video/webm",
        });

        triggerBlobDownload(blob, record.filename);

        downloadState = "done";
        videoMessage =
          "Rekaman disimpan" +
          (record.limitReached ? " (batas ukuran tercapai)" : "") +
          " (" +
          formatBytes(blob.size) +
          ").";
        videoTone = "success";
        setVideoProgress(1);
      } catch (error) {
        downloadState = "error";
        videoMessage =
          "Gagal menyimpan rekaman: " +
          ((error && error.message) || "tidak diketahui");
        videoTone = "error";
        hideVideoProgress();
      }
    }

    removeBeforeUnload();

    if (host) renderVideoCard();

    scheduleVideoReset(6000);
  }

  function updateRecordingStatus() {
    if (!recording || downloadState !== "recording") return;

    const record = recording;

    if (!record.video.isConnected) {
      stopRecording();
      return;
    }

    const elapsed = Math.max(
      0,
      record.video.currentTime - record.startPosition
    );

    const total = Number.isFinite(record.targetDuration)
      ? record.targetDuration
      : null;

    const paused = record.video.paused || record.recorder.state === "paused";
    const size = formatBytes(record.bytes);

    if (paused) {
      videoMessage = "Dijeda — tekan play untuk melanjutkan rekaman.";
    } else if (total && total > 0) {
      videoMessage =
        "Merekam " +
        formatDuration(elapsed) +
        " / " +
        formatDuration(total) +
        " · " +
        size;
    } else {
      videoMessage = "Merekam " + formatDuration(elapsed) + " · " + size;
    }

    if (record.limitReached) {
      videoMessage += " · batas ukuran tercapai";
    }

    videoTone = "";

    if (total && total > 0) {
      setVideoProgress(Math.min(1, elapsed / total));
    } else {
      setVideoProgress(null);
    }

    renderVideoCard();
  }

  function onBeforeUnload(event) {
    if (!recording) return;

    event.preventDefault();
    event.returnValue = "";
  }

  function addBeforeUnload() {
    if (beforeUnloadAttached) return;

    window.addEventListener("beforeunload", onBeforeUnload);
    beforeUnloadAttached = true;
  }

  function removeBeforeUnload() {
    if (!beforeUnloadAttached) return;

    window.removeEventListener("beforeunload", onBeforeUnload);
    beforeUnloadAttached = false;
  }

  function dispose() {
    stopVideoWatcher();

    if (recording) {
      try {
        stopRecording();
      } catch (error) {
        /* abaikan */
      }
    }

    removeBeforeUnload();

    if (host) host.remove();

    host = null;
    shadow = null;
    ui = {};
    drag = null;
    resize = null;
    minimized = false;
    state = null;
  }

  function startDrag(event) {
    if (event.button !== 0) return;
    if (event.target.closest(".caption-button")) return;

    event.preventDefault();

    if (state.maximized) {
      const vp = viewport();
      const ratio = vp.width ? event.clientX / vp.width : 0.5;

      state.maximized = false;
      minimized = false;
      state.left = clamp(
        Math.round(event.clientX - state.width * ratio),
        0,
        Math.max(0, vp.width - state.width)
      );
      state.top = clamp(
        Math.round(event.clientY - TITLEBAR_HEIGHT / 2),
        0,
        Math.max(0, vp.height - TITLEBAR_HEIGHT)
      );
      applyGeometry();
    }

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: state.left,
      top: state.top,
    };

    host.dataset.dragging = "true";

    try {
      ui.titlebar.setPointerCapture(event.pointerId);
    } catch (error) {
      /* pointer sintetis / tidak aktif */
    }
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const vp = viewport();
    const maxLeft = Math.max(0, vp.width - state.width);
    const maxTop = Math.max(0, vp.height - TITLEBAR_HEIGHT);

    state.left = Math.round(
      clamp(drag.left + event.clientX - drag.startX, 0, maxLeft)
    );

    state.top = Math.round(
      clamp(drag.top + event.clientY - drag.startY, 0, maxTop)
    );

    host.style.left = state.left + "px";
    host.style.top = state.top + "px";

    updateReadout();
  }

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;

    drag = null;
    delete host.dataset.dragging;
    persist();
  }

  function startResize(event) {
    if (event.button !== 0 || state.maximized || minimized) return;

    const handle = event.currentTarget;

    event.preventDefault();
    event.stopPropagation();

    resize = {
      pointerId: event.pointerId,
      direction: handle.dataset.dir,
      startX: event.clientX,
      startY: event.clientY,
      bounds: {
        left: state.left,
        top: state.top,
        width: state.width,
        height: state.height,
      },
    };

    host.dataset.resizing = "true";

    try {
      handle.setPointerCapture(event.pointerId);
    } catch (error) {
      /* pointer sintetis / tidak aktif */
    }
  }

  function moveResize(event) {
    if (!resize || event.pointerId !== resize.pointerId) return;

    const vp = viewport();
    const direction = resize.direction;
    const start = resize.bounds;

    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;

    let left = start.left;
    let top = start.top;
    let width = start.width;
    let height = start.height;

    if (direction.includes("e")) {
      width = clamp(
        start.width + dx,
        MIN_WIDTH,
        Math.max(MIN_WIDTH, vp.width - start.left)
      );
    }

    if (direction.includes("s")) {
      height = clamp(
        start.height + dy,
        MIN_HEIGHT,
        Math.max(MIN_HEIGHT, vp.height - start.top)
      );
    }

    if (direction.includes("w")) {
      const right = start.left + start.width;

      width = clamp(start.width - dx, MIN_WIDTH, Math.max(MIN_WIDTH, right));

      left = right - width;
    }

    if (direction.includes("n")) {
      const bottom = start.top + start.height;

      height = clamp(
        start.height - dy,
        MIN_HEIGHT,
        Math.max(MIN_HEIGHT, bottom)
      );

      top = bottom - height;
    }

    state.left = Math.round(left);
    state.top = Math.round(top);
    state.width = Math.round(width);
    state.height = Math.round(height);

    applyGeometry();
  }

  function endResize(event) {
    if (!resize || (event && event.pointerId !== resize.pointerId)) return;

    resize = null;
    delete host.dataset.resizing;
    persist();
  }

  function onTitlebarDoubleClick(event) {
    if (event.target.closest(".caption-button")) return;

    minimized = false;
    toggleMaximize();
  }

  function onCaptionClick(event) {
    const button = event.target.closest(".caption-button");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "minimize") {
      toggleMinimize();
      return;
    }

    if (action === "maximize") {
      toggleMaximize();
      return;
    }

    if (action === "close") {
      closeWindow();
    }
  }

  function bindEvents() {
    ui.titlebar.addEventListener("pointerdown", startDrag);
    ui.titlebar.addEventListener("pointermove", moveDrag);
    ui.titlebar.addEventListener("pointerup", endDrag);
    ui.titlebar.addEventListener("pointercancel", endDrag);
    ui.titlebar.addEventListener("lostpointercapture", endDrag);
    ui.titlebar.addEventListener("dblclick", onTitlebarDoubleClick);

    ui.captions.addEventListener("click", onCaptionClick);

    if (ui.videoActions) {
      ui.videoActions.addEventListener("click", onVideoClick);
    }

    allHandles().forEach((handle) => {
      handle.addEventListener("pointerdown", startResize);
      handle.addEventListener("pointermove", moveResize);
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
      handle.addEventListener("lostpointercapture", endResize);
    });
  }

  function onViewportResize() {
    if (!host || !state) return;

    if (state.maximized) {
      applyGeometry();
      return;
    }

    const vp = viewport();

    state.width = clamp(
      state.width,
      MIN_WIDTH,
      Math.max(MIN_WIDTH, vp.width - EDGE_MARGIN)
    );

    state.height = clamp(
      state.height,
      MIN_HEIGHT,
      Math.max(MIN_HEIGHT, vp.height - EDGE_MARGIN)
    );

    state.left = clamp(state.left, 0, Math.max(0, vp.width - state.width));
    state.top = clamp(state.top, 0, Math.max(0, vp.height - TITLEBAR_HEIGHT));

    applyGeometry();
    persist();
  }

  function mount(saved) {
    state = normalize(saved);

    // Bersihkan host lama yang tertinggal (mis. extension di-reload).
    const stale = document.getElementById("vidget-window");
    if (stale) stale.remove();

    host = document.createElement("div");
    host.id = "vidget-window";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-label", "VIDGET");

    shadow = host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];

    const parts = buildUI();
    shadow.appendChild(parts.fragment);

    ui = {
      titlebar: parts.titlebar,
      captions: parts.captions,
      maximize: parts.maximize,
      status: parts.status,
      size: parts.size,
      position: parts.position,
      videoBadge: parts.videoBadge,
      videoTitle: parts.videoTitle,
      videoMeta: parts.videoMeta,
      videoHint: parts.videoHint,
      videoActions: parts.videoActions,
      videoButton: parts.videoButton,
      videoSecondary: parts.videoSecondary,
      videoProgress: parts.videoProgress,
      videoProgressBar: parts.videoProgressBar,
    };

    bindEvents();
    applyGeometry();

    document.body
      ? document.body.appendChild(host)
      : document.documentElement.appendChild(host);

    startVideoWatcher();
  }

  async function openWindow() {
    const saved = await loadState();
    mount(saved);
    persist();
  }

  async function toggle() {
    if (host) {
      closeWindow();
      return false;
    }

    if (!opening) {
      opening = openWindow().finally(() => {
        opening = null;
      });
    }

    await opening;
    return Boolean(host);
  }

  const messageListener = (message, sender, sendResponse) => {
    if (message && message.type === "VIDGET_DOWNLOAD_PROGRESS") {
      onDownloadProgress(message);
      return undefined;
    }

    if (!message || message.type !== "VIDGET_TOGGLE") return undefined;

    toggle()
      .then((open) => {
        sendResponse({ open });
      })
      .catch((error) => {
        console.error("[VIDGET] Gagal membuka jendela:", error);
        sendResponse({
          open: Boolean(host),
          error: (error && error.message) || String(error),
        });
      });

    return true;
  };

  window.__vidgetWindowListener = messageListener;
  window.__vidgetResizeListener = onViewportResize;
  window.__vidgetCleanup = dispose;

  chrome.runtime.onMessage.addListener(messageListener);
  window.addEventListener("resize", onViewportResize);
})();
