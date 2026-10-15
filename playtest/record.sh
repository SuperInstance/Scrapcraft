#!/bin/bash
# Record/replay rig: local CONNECT forwarder (injects egress-proxy auth)
# + Xvfb + headed Chrome through 127.0.0.1:8888 (no in-browser auth, no
# CDP Fetch interception), fresh profile per run.
set -u
ROOT="$HOME/workspace/scrapcraft-play"
MODE="${1:-record}"
LOGF="${2:-$ROOT/sessions/session-1.jsonl}"
export DISPLAY=:99
mkdir -p "$ROOT/sessions" "$ROOT/shots-$MODE"
# bracket-glob patterns: match real processes, never this script's own cmdline
pkill -f 'record.cj[s]' 2>/dev/null; pkill -f 'meta-chromiu[m]' 2>/dev/null; pkill -f 'Xvf[b]' 2>/dev/null; sleep 1

node "$ROOT/proxy-fwd.cjs" >/dev/null 2>&1 &
FWD=$!
sleep 1

Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
XVFB=$!
sleep 2
PROFILE=$(mktemp -d "$ROOT/rec-prof-XXXXXX")
touch "$PROFILE/First Run"
SC_PASS="${SC_PASS:?set SC_PASS to the play-site passcode}" /opt/meta-chromium/chrome \
  --no-sandbox --disable-dev-shm-usage --proxy-server=http://127.0.0.1:8888 \
  --use-angle=swiftshader-webgl --enable-unsafe-swiftshader \
  --autoplay-policy=no-user-gesture-required \
  --remote-debugging-port=9223 \
  --user-data-dir="$PROFILE" \
  --window-size=1280,800 \
  --hide-scrollbars --mute-audio \
  about:blank >/dev/null 2>&1 &
CHROME=$!
sleep 4
SC_TOUCH="${SC_TOUCH:-0}" SC_PASS="${SC_PASS:?set SC_PASS to the play-site passcode}" node "$ROOT/record.cjs" "$MODE" "$LOGF" "$ROOT/shots-$MODE"
RC=$?
kill $CHROME 2>/dev/null; sleep 1
kill $XVFB 2>/dev/null
kill $FWD 2>/dev/null
echo "record rig done (rc=$RC)"
