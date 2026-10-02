import { PORTAL_ORIGIN } from "./config";

chrome.commands.onCommand.addListener(async (command: string) => {
  if (command === "open-bridge") await chrome.action.openPopup();
});

let offscreenReady = false;
let nativePort: any = null;

function connectNative() {
  if (nativePort) return;
  try {
    nativePort = chrome.runtime.connectNative("com.valantic.citrix_clipboard");
    nativePort.onMessage.addListener((message: { type?: string; text?: string }) => {
      if (message.type === "clipboard" && typeof message.text === "string" && message.text) {
        void saveClipboard(message.text, "citrix", "Copied!");
      }
    });
    nativePort.onDisconnect.addListener(() => { nativePort = null; });
  } catch {
    nativePort = null;
  }
}

async function saveClipboard(text: string, source: ClipboardRecord["source"], toast: string) {
  const result = await chrome.storage.local.get("bridgeState");
  const state: BridgeState = result.bridgeState ?? { current: null, history: [], lastAction: "", lastError: null };
  if (state.current?.text === text && state.current.source === source) return;
  const item: ClipboardRecord = { text, source, createdAt: Date.now() };
  state.current = item;
  state.history = [item, ...state.history.filter((old: ClipboardRecord) => old.text !== text || old.source !== source)].slice(0, 8);
  state.lastAction = "Automatic clipboard sync";
  state.lastError = null;
  await chrome.storage.local.set({ bridgeState: state });
  const tabs = await chrome.tabs.query({ url: `${PORTAL_ORIGIN}/*` });
  for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "clipboard-toast", message: toast }).catch(() => undefined);
}

async function ensureOffscreen() {
  if (offscreenReady) return;
  const contexts = await chrome.runtime.getContexts?.({ contextTypes: ["OFFSCREEN_DOCUMENT"] }) ?? [];
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "Poll the system clipboard for explicit Citrix clipboard synchronization."
    });
  }
  offscreenReady = true;
}

chrome.runtime.onMessage.addListener(async (message: { type?: string; enabled?: boolean; text?: string }) => {
  if (message.type === "set-live-mode") {
    await chrome.storage.local.set({ liveMode: Boolean(message.enabled) });
    if (message.enabled) connectNative();
    if (message.enabled) {
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ type: "offscreen-live", enabled: true });
    } else if (offscreenReady) {
      await chrome.runtime.sendMessage({ type: "offscreen-live", enabled: false });
    }
    const tabs = await chrome.tabs.query({ url: `${PORTAL_ORIGIN}/*` });
    for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "live-content", enabled: Boolean(message.enabled) }).catch(() => undefined);
  }
  if (message.type === "clipboard-observed" && typeof message.text === "string") {
    await saveClipboard(message.text, "host", "Host clipboard updated");
  }
  if (message.type === "remote-copy" && typeof message.text === "string" && message.text) {
    await saveClipboard(message.text, "citrix", "Copied!");
    if (nativePort) nativePort.postMessage({ type: "write", text: message.text });
    else if (offscreenReady) await chrome.runtime.sendMessage({ type: "write-host-clipboard", text: message.text });
  }
});

chrome.storage.local.get("liveMode").then((result: { liveMode?: boolean }) => { if (result.liveMode) connectNative(); });
