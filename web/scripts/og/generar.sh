#!/bin/sh
# Genera web/og-en.png (1200×630) desde og-en.html con Chrome headless (instalado en /tmp, ver work/video/comunicador/NOTAS.md).
set -e
cd "$(dirname "$0")"
# Pictos de ARASAAC (Sergio Palao, CC BY-NC-SA): se bajan a pictos/ (no se suben al repo).
mkdir -p pictos
for id in 32446 4625 24791 33064 28207 6610; do [ -s pictos/$id.png ] || curl -sf -o pictos/$id.png "https://static.arasaac.org/pictograms/$id/${id}_300.png"; done
CHROME=${CHROME:-$(find /tmp/chr -name chrome-headless-shell -type f | head -1)}
LD_LIBRARY_PATH=$(find /tmp/libs -name "*.so*" -printf "%h\n" 2>/dev/null | sort -u | tr '\n' ':') \
  "$CHROME" --no-sandbox --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=8000 \
  --window-size=1200,630 --screenshot="$PWD/../../og-en.png" "file://$PWD/og-en.html"
