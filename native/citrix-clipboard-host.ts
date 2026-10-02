#!/home/user/.bun/bin/bun

type Message = { type?: string; text?: string };
let lastClipboard = "";
let backend: "wayland" | "xclip" | "xsel" | null = null;

function send(message: Message) {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, 4);
  process.stdout.write(frame);
}

async function run(command: string[], input?: string) {
  const child = Bun.spawn(command, { stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "ignore" });
  if (input !== undefined) {
    await child.stdin.write(input);
    await child.stdin.end();
  }
  return { code: await child.exited, text: await new Response(child.stdout).text() };
}

async function detectBackend() {
  if (process.env.WAYLAND_DISPLAY && Bun.which("wl-paste") && Bun.which("wl-copy")) return "wayland" as const;
  if (process.env.DISPLAY && Bun.which("xclip")) return "xclip" as const;
  if (Bun.which("xsel")) return "xsel" as const;
  if (Bun.which("wl-paste") && Bun.which("wl-copy")) return "wayland" as const;
  if (Bun.which("xclip")) return "xclip" as const;
  return null;
}

async function readClipboard() {
  if (!backend) backend = await detectBackend();
  if (backend === "wayland") return (await run(["wl-paste", "--no-newline"])).text;
  if (backend === "xclip") return (await run(["xclip", "-selection", "clipboard", "-o"])).text;
  if (backend === "xsel") return (await run(["xsel", "--clipboard", "--output"])).text;
  return "";
}

async function writeClipboard(text: string) {
  if (!backend) backend = await detectBackend();
  if (backend === "wayland") await run(["wl-copy"], text);
  else if (backend === "xclip") await run(["xclip", "-selection", "clipboard", "-in"], text);
  else if (backend === "xsel") await run(["xsel", "--clipboard", "--input"], text);
  lastClipboard = text;
}

async function poll() {
  const text = await readClipboard();
  if (text && text !== lastClipboard) {
    lastClipboard = text;
    send({ type: "clipboard", text });
  }
}

async function readMessages() {
  const reader = Bun.stdin.stream().getReader();
  let buffer = new Uint8Array();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const merged = new Uint8Array(buffer.length + next.value.length);
    merged.set(buffer); merged.set(next.value, buffer.length); buffer = merged;
    while (buffer.length >= 4) {
      const length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, true);
      if (buffer.length < length + 4) break;
      const message = JSON.parse(new TextDecoder().decode(buffer.slice(4, length + 4))) as Message;
      buffer = buffer.slice(length + 4);
      if (message.type === "write" && typeof message.text === "string") await writeClipboard(message.text);
    }
  }
}

backend = await detectBackend();
void readMessages();
setInterval(() => void poll(), 400);
await poll();
