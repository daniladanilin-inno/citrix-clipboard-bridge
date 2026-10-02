const liveMode = document.querySelector<HTMLInputElement>("#liveMode")!;
const status = document.querySelector<HTMLElement>("#status")!;
const detail = document.querySelector<HTMLElement>("#detail")!;
const statusDot = document.querySelector<HTMLElement>("#statusDot")!;
const preview = document.querySelector<HTMLElement>("#preview")!;
const keepOpen = document.querySelector<HTMLInputElement>("#keepOpen")!;
let lastPanelClipboard: string | undefined;

function render(enabled: boolean) {
  liveMode.checked = enabled;
  status.textContent = enabled ? "Automatic sync enabled" : "Automatic sync disabled";
  detail.textContent = enabled
    ? "Clipboard changes are monitored in the background."
    : "Turn on automatic sync to begin.";
  statusDot.className = `dot ${enabled ? "ok" : ""}`;
}

async function refresh() {
  const result = await chrome.storage.local.get(["liveMode", "keepOpen", "bridgeState"]);
  render(Boolean(result.liveMode));
  keepOpen.checked = Boolean(result.keepOpen);
  preview.textContent = result.bridgeState?.current?.text || "Nothing captured yet.";
}

refresh();

async function pollPanelClipboard() {
  if (!liveMode.checked) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && text !== lastPanelClipboard) {
      lastPanelClipboard = text;
      await chrome.runtime.sendMessage({ type: "clipboard-observed", text });
      preview.textContent = text;
    }
  } catch {
    detail.textContent = "Clipboard access is unavailable in this Chrome context.";
  }
}

window.setInterval(() => void pollPanelClipboard(), 500);

liveMode.addEventListener("change", async () => {
  const enabled = liveMode.checked;
  await chrome.runtime.sendMessage({ type: "set-live-mode", enabled });
  render(enabled);
});

keepOpen.addEventListener("change", async () => {
  await chrome.storage.local.set({ keepOpen: keepOpen.checked });
  if (keepOpen.checked) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tabs[0].windowId });
  }
});

chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>) => {
  if (changes.bridgeState?.newValue) preview.textContent = (changes.bridgeState.newValue as BridgeState).current?.text || "Nothing captured yet.";
});
