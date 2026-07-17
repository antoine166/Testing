const DEFAULT_API_BASE = "https://testing-azure-eta.vercel.app";

const form = document.getElementById("clip-form");
const setupNotice = document.getElementById("setup");
const statusEl = document.getElementById("status");
const titleInput = document.getElementById("title");
const urlInput = document.getElementById("url");
const contentInput = document.getElementById("content");
const saveButton = document.getElementById("save");
const screenshotRow = document.getElementById("screenshot-row");
const screenshotPreview = document.getElementById("screenshot-preview");
const includeScreenshotCheckbox = document.getElementById("include-screenshot");

let screenshotDataUrl = null;

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(text, tone) {
  statusEl.textContent = text;
  statusEl.className = tone ?? "";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSelectionText(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString(),
    });
    return result || "";
  } catch {
    // Some pages (chrome://, the Web Store, etc.) don't allow script
    // injection — just skip prefilling notes in that case.
    return "";
  }
}

// Runs Mozilla's Readability (vendor/readability.js) against a clone of the
// page's DOM to extract clean article text — the same extraction Firefox's
// Reader View uses. Injected as a separate file first so it registers a
// plain `Readability` global in the tab's isolated world (module.exports is
// skipped there since there's no CommonJS `module`), then invoked from a
// second injected function. Both run in the same persistent isolated world
// for this tab, so the global set by the first call is visible to the
// second, as long as the page hasn't navigated in between.
async function extractArticle(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/readability.js"],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const article = new window.Readability(document.cloneNode(true)).parse();
          return article?.textContent ? { title: article.title, textContent: article.textContent.trim() } : null;
        } catch {
          return null;
        }
      },
    });
    return result;
  } catch {
    return null;
  }
}

async function captureScreenshot(tab) {
  try {
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    screenshotPreview.src = screenshotDataUrl;
    screenshotRow.style.display = "flex";
  } catch {
    // Restricted pages (chrome://, PDF viewer, etc.) can't be captured —
    // just skip it, same as selection/article extraction.
    screenshotDataUrl = null;
    screenshotRow.style.display = "none";
  }
}

async function init() {
  const { accessToken } = await chrome.storage.sync.get(["accessToken"]);

  if (!accessToken) {
    setupNotice.style.display = "block";
    form.style.display = "none";
    return;
  }

  const tab = await getActiveTab();
  if (!tab) return;

  titleInput.value = tab.title ?? "";
  urlInput.value = tab.url ?? "";

  if (tab.id) {
    const selection = await getSelectionText(tab.id);
    if (selection) {
      contentInput.value = selection;
    } else {
      setStatus("Extracting article text…");
      const article = await extractArticle(tab.id);
      if (article) {
        contentInput.value = article.textContent;
        if (article.title) titleInput.value = article.title;
      }
      setStatus("");
    }

    await captureScreenshot(tab);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveButton.disabled = true;
  setStatus("Saving...");

  const { apiBase, accessToken } = await chrome.storage.sync.get(["apiBase", "accessToken"]);
  const base = apiBase || DEFAULT_API_BASE;
  const includeScreenshot = includeScreenshotCheckbox.checked && Boolean(screenshotDataUrl);

  try {
    const res = await fetch(`${base}/api/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: titleInput.value,
        url: urlInput.value,
        content: contentInput.value,
        screenshot: includeScreenshot ? screenshotDataUrl : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(body.error ?? `Failed to save (${res.status}).`, "error");
      saveButton.disabled = false;
      return;
    }

    const saved = await res.json().catch(() => ({}));
    setStatus(saved.attachment_error ? `Saved, but screenshot failed: ${saved.attachment_error}` : "Saved to your Inbox.", saved.attachment_error ? "error" : "success");
    setTimeout(() => window.close(), saved.attachment_error ? 2000 : 900);
  } catch {
    setStatus("Couldn't reach Life OS — check your connection and settings.", "error");
    saveButton.disabled = false;
  }
});

init();
