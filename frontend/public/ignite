#!/usr/bin/env bash
# Compatibility entrypoint: the gstdbot repository owns the only node installer.
set -euo pipefail
installer_url='https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh'
installer_file="$(mktemp)"
trap 'rm -f -- "$installer_file"' EXIT
if command -v curl >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -fsSL "$installer_url" -o "$installer_file"
elif command -v wget >/dev/null 2>&1; then
  wget --https-only -q "$installer_url" -O "$installer_file"
else
  printf '%s\n' 'Install curl or wget, then retry. Documentation: https://gstdtoken.com/nodes' >&2
  exit 1
fi
# No demo identity, automatic bonus or presence reward is generated here.
bash "$installer_file" "$@"
