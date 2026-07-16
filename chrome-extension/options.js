const DEFAULT_API_BASE = "https://testing-azure-eta.vercel.app";

const apiBaseInput = document.getElementById("api-base");
const accessTokenInput = document.getElementById("access-token");
const statusEl = document.getElementById("status");

async function load() {
  const { apiBase, accessToken } = await chrome.storage.sync.get(["apiBase", "accessToken"]);
  apiBaseInput.value = apiBase || DEFAULT_API_BASE;
  accessTokenInput.value = accessToken || "";
}

document.getElementById("save").addEventListener("click", async () => {
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  const accessToken = accessTokenInput.value.trim();

  await chrome.storage.sync.set({ apiBase, accessToken });
  statusEl.textContent = "Saved.";
  setTimeout(() => (statusEl.textContent = ""), 2000);
});

load();
