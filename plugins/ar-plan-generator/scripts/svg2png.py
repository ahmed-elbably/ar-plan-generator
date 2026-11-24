#!/usr/bin/env python3
"""
Rasterise SVG files to PNG with headless Chromium (Playwright), for machines without rsvg-convert (e.g. Windows).
One browser renders every file, so a 337-frame build video takes a minute or two.

  python3 svg2png.py <dir or file.svg> [--width 1920] [--height 1080] [--pattern "f_*.svg"]

Each a.svg becomes a.png next to it, at exactly width x height. Exit code 2 = Playwright is missing.
"""
import argparse, glob, os, sys, pathlib

ap = argparse.ArgumentParser()
ap.add_argument("target")
ap.add_argument("--width", type=int, default=1920)
ap.add_argument("--height", type=int, default=1080)
ap.add_argument("--pattern", default="f_*.svg")
a = ap.parse_args()
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Python Playwright not found (pip install playwright && playwright install chromium)", file=sys.stderr); sys.exit(2)

files = [a.target] if a.target.lower().endswith(".svg") else sorted(glob.glob(os.path.join(a.target, a.pattern)))
if not files:
    print(f"no SVG files in {a.target}", file=sys.stderr); sys.exit(1)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": a.width, "height": a.height})
    for i, f in enumerate(files):
        # open the SVG itself (a page cannot load file:// images) and size its root to the frame,
        # the same result as rsvg-convert -w W -h H; fail loudly instead of writing a blank frame
        pg.goto(pathlib.Path(f).resolve().as_uri())
        ok = pg.evaluate("""([w, h]) => { const s = document.documentElement;
          if (!s || s.tagName.toLowerCase() !== 'svg') return false;
          s.setAttribute('width', w); s.setAttribute('height', h); s.style.display = 'block'; s.style.background = '#fff';
          return s.getBBox().width > 0; }""", [a.width, a.height])
        if not ok:
            print(f"could not render {f}", file=sys.stderr); sys.exit(1)
        pg.screenshot(path=f[:-4] + ".png", clip={"x": 0, "y": 0, "width": a.width, "height": a.height})
        if (i + 1) % 50 == 0: print(f"{i + 1}/{len(files)}", file=sys.stderr)
    b.close()
print(len(files), "PNG files")
