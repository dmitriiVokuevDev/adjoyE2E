#!/usr/bin/env bash
#
# Full backend reset: wipe redis state + logs and bring the stack back up clean.
# After this, all vtc/vti values are 0 until new events arrive.
#
#   ./reset.sh
set -uo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BACKEND_DIR"

say() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }

say "1/3  Stop containers + wipe data (redis reset)"
docker compose down -v 2>&1 | tail -3

say "2/3  Clear log files"
rm -f logs/*.log && echo "  logs cleared"

say "3/3  Start fresh"
docker compose up -d >/dev/null 2>&1

# wait until writer/reader/config report healthy
for _ in $(seq 1 60); do
  healthy=$(docker compose ps --format '{{.Status}}' 2>/dev/null | grep -c healthy)
  [ "${healthy:-0}" -ge 3 ] && break
  sleep 1
done
docker compose ps --format '  {{.Name}}: {{.Status}}'

say "Done — backend is fresh (vtc/vti = 0 until new events arrive)"
