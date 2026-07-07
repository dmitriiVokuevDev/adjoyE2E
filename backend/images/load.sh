#!/usr/bin/env bash
# Load the writer, reader, and config images into the local Docker daemon.
# Run this once before `docker compose up` in the parent directory.
set -euo pipefail
cd "$(dirname "$0")"
for f in writer.tar reader.tar config.tar; do
  echo "loading ${f}..."
  docker load -i "${f}"
done
echo "done."
