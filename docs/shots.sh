#!/bin/sh
# Retakes the README's screenshots from docs/shots.html with headless Chrome.
# Run from the repository root after changing a skin or the markup:
#
#   sh docs/shots.sh
set -e

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-4179}"

node server.js --port "$PORT" &
SERVER=$!
trap 'kill "$SERVER"' EXIT
sleep 1

shot() { # name width height
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$2,$3" --virtual-time-budget=4000 \
    --screenshot="docs/$1.png" "http://localhost:$PORT/docs/shots.html?shot=$1" 2>/dev/null
  echo "docs/$1.png"
}

shot skins 1904 524
shot anatomy 600 612
shot steps 1428 500
shot page 492 480
