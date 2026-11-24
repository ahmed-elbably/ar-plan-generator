#!/usr/bin/env bash
# Turn the frame SVGs written by `arplan.js animate` into an MP4 build video.
#   bash render-video.sh <frames dir> <out.mp4> [fps]
# Needs ffmpeg, and rsvg-convert or (fallback, e.g. on Windows) Python Playwright with Chromium for svg2png.py.
# Exit code 2 = a tool is missing (deliver the build page instead).
set -euo pipefail
dir="$1"; out="$2"; fps="${3:-24}"
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found"; exit 2; }
if command -v rsvg-convert >/dev/null 2>&1; then
  jobs=$(command -v nproc >/dev/null 2>&1 && nproc || echo 4)
  find "$dir" -name 'f_*.svg' -print0 | xargs -0 -P "$jobs" -I{} sh -c 'rsvg-convert -w 1920 -h 1080 "$1" -o "${1%.svg}.png"' _ {}
else
  # first interpreter that really runs (on Windows "python3" can be a Microsoft Store placeholder)
  py=""; for c in python3 python py; do if "$c" -c "import sys" >/dev/null 2>&1; then py="$c"; break; fi; done
  [ -n "$py" ] || { echo "rsvg-convert not found (and no Python for the svg2png.py fallback)"; exit 2; }
  "$py" "$(dirname "$0")/svg2png.py" "$dir" --width 1920 --height 1080 || { echo "rsvg-convert not found and svg2png.py failed (pip install playwright && playwright install chromium)"; exit 2; }
fi
ffmpeg -y -loglevel error -framerate "$fps" -i "$dir/f_%04d.png" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart "$out"
echo "$out"
