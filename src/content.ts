let toastTimer: number | undefined;
let clipboardTimer: number | undefined;
let lastObservedClipboard: string | undefined;

function showToast(message: string) {
  let toast = document.getElementById("citrix-clipboard-bridge-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "citrix-clipboard-bridge-toast";
    document.documentElement.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove("visible"), 5000);
}

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === "host-ready") {
    showToast("Host clipboard is ready. Focus the remote app and press Ctrl+V.");
  }
  if (message.type === "clipboard-toast") showToast((message as { message?: string }).message ?? "Copied!");
  if (message.type === "live-content") setClipboardObserver(Boolean((message as { enabled?: boolean }).enabled));
});

document.addEventListener("keydown", event => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return;
  window.setTimeout(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) await chrome.runtime.sendMessage({ type: "remote-copy", text });
    } catch {
      // Citrix may take longer to publish the clipboard; the manual button remains available.
    }
  }, 120);
}, true);

async function observeClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text !== lastObservedClipboard) {
      lastObservedClipboard = text;
      await chrome.runtime.sendMessage({ type: "remote-copy", text });
    }
  } catch {
    // Chrome can deny a read while focus is changing; the next poll retries it.
  }
}

function setClipboardObserver(enabled: boolean) {
  if (clipboardTimer !== undefined) window.clearInterval(clipboardTimer);
  clipboardTimer = undefined;
  if (enabled && window.top === window.self) {
    void observeClipboard();
    clipboardTimer = window.setInterval(() => void observeClipboard(), 500);
  }
}

chrome.storage.local.get("liveMode").then((result: { liveMode?: boolean }) => setClipboardObserver(Boolean(result.liveMode)));
