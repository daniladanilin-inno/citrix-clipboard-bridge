#!/usr/bin/env bash
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$root_dir"

read -r -p "Citrix portal URL (for example https://desktop.example.com): " portal_url
if [ -z "$portal_url" ]; then
  echo "Portal URL is required." >&2
  exit 2
fi
case "$portal_url" in
https://* | http://*) ;;
*)
  echo "URL must start with http:// or https://" >&2
  exit 2
  ;;
esac

PORTAL_URL="$portal_url" bun run build

echo "Opening Chrome extensions page..."
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome "chrome://extensions" >/dev/null 2>&1 &
elif command -v google-chrome-stable >/dev/null 2>&1; then
  google-chrome-stable "chrome://extensions" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "chrome://extensions" >/dev/null 2>&1 &
fi

echo
echo "In Chrome: enable Developer mode, click Load unpacked, and select:"
echo "  $root_dir/dist"
echo
echo "Go to chrome://extensions/ -> Citrix Clipboard Bridge -> Details. Copy line after chrome://extensions/?id="
read -r -p "Paste the extension ID shown by Chrome: " extension_id
if [ -z "$extension_id" ]; then
  echo "Extension ID is required." >&2
  exit 2
fi

./native/install-host.sh "$extension_id"
echo
echo "Installation complete. Reload the extension, open the Citrix portal, and enable Automatic sync."
