#!/usr/bin/env bash
# Build, start a local server on :4100, run every test suite, stop the server.
#   bash tests/run-all.sh              # everything
#   bash tests/run-all.sh stairs rides # sim + bots + only these e2e sections
# The test build enables the teleport hook (VITE_MV_DEBUG=1); the live site has none, so against
# production only `tests/live.mjs` runs: MV_URL=https://jerom-world.onrender.com node tests/live.mjs
set -u
cd "$(dirname "$0")/.."
VITE_MV_DEBUG=1 npm run build >/dev/null || { echo "build failed"; exit 1; }
NODE_ENV=production PORT=4100 node server/index.js >/tmp/mv-test-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
status=0
echo "== sim (collisions, reachability, paths)"; node tests/sim.mjs || status=1
echo "== bots (chat rules, rides)";            MV_URL=http://localhost:4100 node tests/bots.mjs || status=1
echo "== e2e (browser)";                        MV_URL=http://localhost:4100 node tests/e2e.mjs "$@" || status=1
exit $status
