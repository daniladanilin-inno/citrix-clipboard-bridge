#!/home/user/.bun/bin/bun

// Clipboard sync between the Ubuntu host and the Citrix session: the most recent change wins.
//
// The extension reads the Citrix side through navigator.clipboard, so every "write" it sends is
// text that was already on the host clipboard at some point. If the host has moved on since then
// (new text, an image, a cleared clipboard), the write is a stale replay and must not clobber it.

import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Message = { type?: string; text?: string };
type Backend = "wayland" | "xclip" | "xsel";
type Snapshot = { kind: "text"; text: string } | { kind: "other"; types: string };

const POLL_MS = 400;
const HISTORY_LIMIT = 100;
const TEXT_TYPES = /^(UTF8_STRING|STRING|TEXT|text\/plain)/;
const LOG_FILE = join(homedir(), ".cache", "citrix-clipboard-host.log");

let backend: Backend | null = null;
let current: Snapshot | null = null;
let lastSent = "";
// Texts the host clipboard has held, oldest first. Anything here that is not current is superseded.
const seenOnHost: string[] = [];

function log(line: string) {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging is diagnostic only.
  }
}

function preview(text: string) {
  return JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);
}

function send(message: Message) {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, 4);
  process.stdout.write(frame);
}

async function run(command: string[], input?: string) {
  const writing = input !== undefined;
  // xclip/wl-copy fork a daemon that keeps inherited pipes open, so never wait on stdout for writes.
  const child = Bun.spawn(command, { stdin: writing ? "pipe" : "ignore", stdout: writing ? "ignore" : "pipe", stderr: "ignore" });
  if (writing) {
    await child.stdin.write(input);
    await child.stdin.end();
    return { code: await child.exited, text: "" };
  }
  const text = await new Response(child.stdout).text();
  return { code: await child.exited, text };
}

async function detectBackend(): Promise<Backend | null> {
  if (process.env.WAYLAND_DISPLAY && Bun.which("wl-paste") && Bun.which("wl-copy")) return "wayland";
  if (process.env.DISPLAY && Bun.which("xclip")) return "xclip";
  if (Bun.which("xsel")) return "xsel";
  if (Bun.which("wl-paste") && Bun.which("wl-copy")) return "wayland";
  if (Bun.which("xclip")) return "xclip";
  return null;
}

async function listTypes(): Promise<string[] | null> {
  if (backend === "xclip") return (await run(["xclip", "-selection", "clipboard", "-t", "TARGETS", "-o"])).text.split("\n").filter(Boolean);
  if (backend === "wayland") return (await run(["wl-paste", "--list-types"])).text.split("\n").filter(Boolean);
  return null; // xsel cannot list targets; treat the clipboard as text only.
}

async function readText() {
  if (backend === "xclip") return (await run(["xclip", "-selection", "clipboard", "-o"])).text;
  if (backend === "wayland") return (await run(["wl-paste", "--no-newline"])).text;
  if (backend === "xsel") return (await run(["xsel", "--clipboard", "--output"])).text;
  return "";
}

async function snapshot(): Promise<Snapshot> {
  const types = await listTypes();
  const meaningful = types?.filter(type => !["TARGETS", "TIMESTAMP", "MULTIPLE", "SAVE_TARGETS"].includes(type));
  if (meaningful && meaningful.length && !meaningful.some(type => TEXT_TYPES.test(type))) {
    return { kind: "other", types: meaningful.join(",") };
  }
  return { kind: "text", text: await readText() };
}

function same(a: Snapshot | null, b: Snapshot) {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "text" ? a.text === (b as { text: string }).text : a.types === (b as { types: string }).types;
}

function remember(text: string) {
  const index = seenOnHost.indexOf(text);
  if (index !== -1) seenOnHost.splice(index, 1);
  seenOnHost.push(text);
  if (seenOnHost.length > HISTORY_LIMIT) seenOnHost.shift();
}

async function poll() {
  const next = await snapshot();
  if (same(current, next)) return;
  current = next;
  if (next.kind === "other") {
    log(`host -> non-text (${next.types})`);
    return;
  }
  log(`host -> text ${preview(next.text)}`);
  if (!next.text) return;
  remember(next.text);
  if (next.text !== lastSent) {
    lastSent = next.text;
    send({ type: "clipboard", text: next.text });
  }
}

async function writeFromCitrix(text: string) {
  // Refresh first so the decision is made against what the host holds right now.
  await poll();
  if (current?.kind === "text" && current.text === text) return;
  if (seenOnHost.includes(text)) {
    log(`rejected stale citrix write ${preview(text)}`);
    return;
  }
  log(`citrix -> host ${preview(text)}`);
  if (backend === "xclip") await run(["xclip", "-selection", "clipboard", "-in"], text);
  else if (backend === "wayland") await run(["wl-copy"], text);
  else if (backend === "xsel") await run(["xsel", "--clipboard", "--input"], text);
  current = { kind: "text", text };
  lastSent = text;
  remember(text);
}

// Polls and writes share clipboard state, so run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
function serial(task: () => Promise<void>) {
  queue = queue.then(task).catch(error => log(`error ${String(error)}`));
  return queue;
}

async function readMessages() {
  const reader = Bun.stdin.stream().getReader();
  let buffer = new Uint8Array();
  while (true) {
    const next = await reader.read();
    if (next.done) process.exit(0);
    const merged = new Uint8Array(buffer.length + next.value.length);
    merged.set(buffer); merged.set(next.value, buffer.length); buffer = merged;
    while (buffer.length >= 4) {
      const length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, true);
      if (buffer.length < length + 4) break;
      const message = JSON.parse(new TextDecoder().decode(buffer.slice(4, length + 4))) as Message;
      buffer = buffer.slice(length + 4);
      if (message.type === "write" && typeof message.text === "string" && message.text) {
        const text = message.text;
        void serial(() => writeFromCitrix(text));
      }
    }
  }
}

backend = await detectBackend();
log(`started, backend=${backend}`);
void readMessages();
setInterval(() => void serial(poll), POLL_MS);
await serial(poll);
