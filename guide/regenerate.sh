#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
uv run --no-project --with playwright --with numpy --with sounddevice python guide/capture.py
python3 guide/build_index.py
