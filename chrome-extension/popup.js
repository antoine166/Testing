const DEFAULT_API_BASE = "https://testing-azure-eta.vercel.app";

const form = document.getElementById("clip-form");
const setupNotice = document.getElementById("setup");
const statusEl = document.getElementById("status");
const titleInput = document.getElementById("title");
const urlInput = document.getElementById("url");
const contentInput = document.getElementById("content");
const tagsInput = document.getElementById("tags");
const saveButton = document.getElementById("save");

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

async function init() {
  const { accessToken } = await chrome.storage.sync.get(["accessToken"]);

  if (!accessToken) {
    setupNotice.style.display = "block";
    form.style.display = "none";
    return;
  }

  const tab = await getActiveTab();
  if (tab) {
    titleInput.value = tab.title ?? "";
    urlInput.value = tab.url ?? "";
    if (tab.id) {
      contentInput.value = await getSelectionText(tab.id);
    }
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveButton.disabled = true;
  setStatus("Saving...");

  const { apiBase, accessToken } = await chrome.storage.sync.get(["apiBase", "accessToken"]);
  const base = apiBase || DEFAULT_API_BASE;

  const tags = tagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

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
        tags,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(body.error ?? `Failed to save (${res.status}).`, "error");
      saveButton.disabled = false;
      return;
    }

    setStatus("Saved to your Knowledge Library.", "success");
    setTimeout(() => window.close(), 900);
  } catch {
    setStatus("Couldn't reach Life OS — check your connection and settings.", "error");
    saveButton.disabled = false;
  }
});

init();
