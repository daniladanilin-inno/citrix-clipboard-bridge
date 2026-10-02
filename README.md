# Citrix Clipboard Bridge

Manifest V3 Chrome extension for explicit, retryable text clipboard handoff on `desktop.ts.valantic.com`.

## Prerequisites

Ubuntu host requirements:

- Google Chrome
- Bun (includes TypeScript transpilation; a separate `tsc` install is not required)
- X11 clipboard tools:

  ```sh
  sudo apt update
  sudo apt install -y xclip
  ```

Verify Bun is available:

```sh
bun --version
```

If Bun is not installed, install it with:

```sh
curl -fsSL https://bun.sh/install | bash
```

## Install

```sh
./INSTALL.sh
```

The installer asks for the Citrix portal URL, builds the extension for that URL, opens Chrome's extension page, and guides you through loading `dist/`. It then asks for the extension ID and registers the native Ubuntu helper.

Chrome does not allow a script to silently load an unpacked extension into an existing normal profile, so the **Load unpacked** click and extension-ID paste are the only manual steps.

If you need to register the native helper again manually:

```sh
./native/install-host.sh YOUR_EXTENSION_ID
```

The installer copies the host script into Chrome's `NativeMessagingHosts` directory and registers it there. Chrome requires the registered host `path` to be absolute, so the generated JSON intentionally does not use `./`.

Install one clipboard backend if needed, for example `wl-clipboard` on Wayland or `xclip` on X11. Reload the extension after installing the helper.

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `dist/` directory.

## Use

1. Open the Citrix portal and sign in.
2. For host → Citrix: copy text on Ubuntu, open the extension, click **Host → Citrix**, focus the remote app, and press `Ctrl+V`.
3. For Citrix → host: copy text in the remote app, open the extension, and click **Citrix → Host**. If Citrix is late, click **Retry last action**.
4. Enable **Bidirectional mode**. The Citrix tab observes clipboard changes automatically, including tmux/Neovim yanks and mouse selections when tmux `set-clipboard on` publishes them, and writes new text to the host clipboard.

The extension verifies host clipboard writes and retries clipboard reads/writes. Bidirectional mode persists after the popup closes. It cannot synthesize a trusted keypress inside Citrix's remote canvas; Chrome deliberately prevents extensions from transparently injecting a paste into a cross-origin remote session.
