#!/usr/bin/env bash
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 CHROME_EXTENSION_ID" >&2
  exit 2
fi

extension_id="$1"
root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
host_dir="$HOME/.config/google-chrome/NativeMessagingHosts"
host_name="com.valantic.citrix_clipboard"
mkdir -p "$host_dir"
host_script="$host_dir/citrix-clipboard-host.ts"
install -m 755 "$root_dir/native/citrix-clipboard-host.ts" "$host_script"

cat > "$host_dir/$host_name.json" <<EOF
{
  "name": "$host_name",
  "description": "Citrix Clipboard Bridge native clipboard helper",
  "path": "$host_script",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$extension_id/"]
}
EOF

echo "Installed $host_name for extension $extension_id"
echo "Supported clipboard backends: wl-paste/wl-copy, xclip, or xsel"
