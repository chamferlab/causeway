#!/usr/bin/env bash
#
# Serve Causeway (scripts/serve.py). Plain HTTP for a trusted office network.
#
#   ./scripts/run_app.sh                 http://127.0.0.1:8080/ (this machine only)
#   ./scripts/run_app.sh --lan           also reachable from the network
#   ./scripts/run_app.sh --port 9000
#
# Thin wrapper around scripts/serve.py, shared with Windows (run_app.bat).
# Works from any directory. Needs Python 3.8 or later; nothing else.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Causeway: python3 not found - install Python 3.8 or later." >&2
    exit 1
fi

exec python3 "$SCRIPT_DIR/serve.py" "$@"
