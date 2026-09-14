#!/usr/bin/env bash
# Convert a screen to webp for the portfolio and print the width/height pair for the <img>.
#
#   webp.sh <source.png|jpg|webp> <assets/prefix-name.webp> [max-width]
#
# Phone screens go to 450 wide (the site's convention); wide product shots to 1600 or 1800.
# Uses sharp-cli through npx because sips on macOS cannot write webp. The first run fetches
# sharp; later runs are quick.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <source> <dest.webp> [max-width]" >&2
  exit 2
fi

src="$1"; dest="$2"; width="${3:-}"
[ -f "$src" ] || { echo "no such file: $src" >&2; exit 1; }
case "$dest" in *.webp) ;; *) echo "destination must end in .webp: $dest" >&2; exit 1;; esac
mkdir -p "$(dirname "$dest")"

if [ -n "$width" ]; then
  npx -y sharp-cli -i "$src" -o "$dest" resize "$width" >/dev/null
else
  npx -y sharp-cli -i "$src" -o "$dest" >/dev/null
fi

w=$(sips -g pixelWidth "$dest" | awk '/pixelWidth/ {print $2}')
h=$(sips -g pixelHeight "$dest" | awk '/pixelHeight/ {print $2}')
size=$(du -k "$dest" | cut -f1)
printf '%s  width="%s" height="%s"  (%s KB)\n' "$dest" "$w" "$h" "$size"
