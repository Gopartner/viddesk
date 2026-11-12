"use strict";

/**
 * Service worker VIDGET.
 *
 * Klik ikon extension = buka/tutup jendela di tab aktif.
 * Content script disuntikkan hanya saat dibutuhkan.
 */
const SUPPORTED_PAGE = /^https?:\/\//i;
const DEFAULT_TITLE = "Buka/tutup jendela VIDGET";
const DOWNLOAD_TAB_PREFIX = "vidget-download-tab-";
const downloadTabs = new Map();

function sanitizeBaseName(value) {
  let base = String(value || "video")
    // eslint-disable-next-line no-control-regex -- buang karakter kontrol dari nama file
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "");

  if (!base) base = "video";
  if (base.length > 120) base = base.slice(0, 120).trim();

  return base || "video";
}

function sanitizeExtension(value) {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 5);
}

async function rememberDownloadTab(downloadId, tabId) {
  downloadTabs.set(downloadId, tabId);

  try {
    await chrome.storage.session.set({
      [DOWNLOAD_TAB_PREFIX + downloadId]: tabId,
    });
  } catch (error) {
    /* storage.session tidak tersedia — abaikan */
  }
}

async function findDownloadTab(downloadId) {
  if (downloadTabs.has(downloadId)) return downloadTabs.get(downloadId);

  try {
    const key = DOWNLOAD_TAB_PREFIX + downloadId;
    const data = await chrome.storage.session.get(key);
    const tabId = data[key];

    if (tabId !== undefined) downloadTabs.set(downloadId, tabId);

    return tabId;
  } catch (error) {
    return undefined;
  }
}

async function forgetDownloadTab(downloadId) {
  downloadTabs.delete(downloadId);

  try {
    await chrome.storage.session.remove(DOWNLOAD_TAB_PREFIX + downloadId);
  } catch (error) {
    /* abaikan */
  }
}

function sendDownloadProgress(tabId, item) {
  if (tabId === undefined || !item) return;

  try {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "VIDGET_DOWNLOAD_PROGRESS",
        downloadId: item.id,
        state: item.state,
        bytesReceived: item.bytesReceived || 0,
        totalBytes: item.totalBytes || 0,
        error: item.error || null,
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  } catch (error) {
    /* tab sudah ditutup */
  }
}

function searchDownload(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      void chrome.runtime.lastError;
      resolve(items && items[0] ? items[0] : null);
    });
  });
}

async function startDownload(message, sender) {
  const url = typeof message.url === "string" ? message.url : "";

  if (!/^(https?:|data:video\/)/i.test(url)) {
    throw new Error("URL video tidak didukung.");
  }

  let base = sanitizeBaseName(message.filename);
  const extension = sanitizeExtension(message.extension);

  if (extension) {
    base =
      base.replace(new RegExp("\\." + extension + "$", "i"), "").trim() ||
      "video";
  }

  const filename = "VIDGET/" + base + (extension ? "." + extension : "");

  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      },
      (id) => {
        const lastError = chrome.runtime.lastError;

        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (typeof id !== "number") {
          reject(new Error("Gagal memulai unduhan."));
          return;
        }

        resolve(id);
      }
    );
  });

  const tabId = sender && sender.tab ? sender.tab.id : undefined;

  if (tabId !== undefined) {
    await rememberDownloadTab(downloadId, tabId);

    const item = await searchDownload(downloadId);

    if (item) {
      sendDownloadProgress(tabId, item);

      if (item.state === "complete" || item.state === "interrupted") {
        forgetDownloadTab(downloadId).catch(() => {});
      }
    }
  }

  return { downloadId };
}

async function handleDownloadChanged(delta) {
  if (!delta || typeof delta.id !== "number") return;

  const tabId = await findDownloadTab(delta.id);

  if (tabId === undefined) return;

  const item = await searchDownload(delta.id);

  if (!item) return;

  sendDownloadProgress(tabId, item);

  if (item.state === "complete" || item.state === "interrupted") {
    await forgetDownloadTab(delta.id);
  }
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function showErrorBadge(tabId, reason) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#c42b1c" });
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setTitle({
      tabId,
      title: reason ? "VIDGET: " + reason : "VIDGET: gagal membuka jendela",
    });

    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
      chrome.action.setTitle({ tabId, title: DEFAULT_TITLE }).catch(() => {});
    }, 5000);
  } catch (error) {
    /* abaikan */
  }
}

async function toggleWindow(tab) {
  if (!tab || tab.id === undefined) return;

  // Kalau URL tidak tersedia (mis. akses situs dibatasi Chrome), tetap coba.
  const hasKnownUrl = typeof tab.url === "string" && tab.url.length > 0;

  if (hasKnownUrl && !SUPPORTED_PAGE.test(tab.url)) {
    showErrorBadge(
      tab.id,
      "halaman ini tidak mendukung content script (chrome://, Web Store, dll)"
    );
    return;
  }

  let response;

  try {
    response = await sendToTab(tab.id, { type: "VIDGET_TOGGLE" });
  } catch (error) {
    // Content script belum ada di tab ini → suntikkan lalu coba lagi.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });

      response = await sendToTab(tab.id, { type: "VIDGET_TOGGLE" });
    } catch (injectError) {
      console.error(
        "[VIDGET] Gagal menyuntikkan content script:",
        injectError,
        { tabUrl: tab.url }
      );

      showErrorBadge(
        tab.id,
        (injectError && injectError.message) || "gagal menyuntikkan script"
      );
      return;
    }
  }

  if (response && response.error) {
    console.error("[VIDGET] Gagal membuka jendela:", response.error);

    showErrorBadge(
      tab.id,
      response.error === "gagal" ? "gagal membuka jendela" : response.error
    );
  }
}

chrome.action.onClicked.addListener(toggleWindow);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "VIDGET_DOWNLOAD") {
    startDownload(message, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          error: (error && error.message) || String(error),
        });
      });

    return true;
  }

  return undefined;
});

chrome.downloads.onChanged.addListener((delta) => {
  handleDownloadChanged(delta).catch(() => {});
});
