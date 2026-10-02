let timer: number | undefined;
let lastText: string | undefined;

async function poll() {
  try {
    const text = await navigator.clipboard.readText();
    if (text !== lastText) {
      lastText = text;
      if (text) await chrome.runtime.sendMessage({ type: "clipboard-observed", text });
    }
  } catch {
    // Clipboard access can be temporarily denied while Chrome changes focus; retry next tick.
  }
}

function setLive(enabled: boolean) {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  if (enabled) {
    void poll();
    timer = window.setInterval(() => void poll(), 700);
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string; enabled?: boolean }) => {
  if (message.type === "offscreen-live") setLive(Boolean(message.enabled));
  if (message.type === "write-host-clipboard" && typeof (message as { text?: string }).text === "string") {
    const text = (message as { text: string }).text;
    lastText = text;
    void navigator.clipboard.writeText(text);
  }
});

chrome.storage.local.get("liveMode").then((result: { liveMode?: boolean }) => setLive(Boolean(result.liveMode)));
