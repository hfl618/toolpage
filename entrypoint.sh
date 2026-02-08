#!/bin/bash
set -e

echo "=== ENTRYPOINT STARTED ==="
echo "User: $(whoami) (UID: $(id -u))"
echo "Workdir: $(pwd)"
echo "Listing files:"
ls -la

echo "Starting Python App..."
python app.py
