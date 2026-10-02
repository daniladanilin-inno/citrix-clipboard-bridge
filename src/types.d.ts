declare const chrome: any;

interface ClipboardRecord {
  text: string;
  source: "host" | "citrix";
  createdAt: number;
}

interface BridgeState {
  current: ClipboardRecord | null;
  history: ClipboardRecord[];
  lastAction: string;
  lastError: string | null;
}
