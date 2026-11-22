#!/usr/bin/env bash
# Turn the frame SVGs written by `arplan.js animate` into an MP4 build video.
#   bash render-video.sh <frames dir> <out.mp4> [fps]
# Needs rsvg-convert and ffmpeg. Exit code 2 = a tool is missing (deliver the build page instead).
set -euo pipefail
dir="$1"; out="$2"; fps="${3:-24}"
command -v rsvg-convert >/dev/null 2>&1 || { echo "rsvg-convert not found"; exit 2; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found"; exit 2; }
jobs=$(command -v nproc >/dev/null 2>&1 && nproc || echo 4)
find "$dir" -name 'f_*.svg' -print0 | xargs -0 -P "$jobs" -I{} sh -c 'rsvg-convert -w 1920 -h 1080 "$1" -o "${1%.svg}.png"' _ {}
ffmpeg -y -loglevel error -framerate "$fps" -i "$dir/f_%04d.png" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart "$out"
echo "$out"
