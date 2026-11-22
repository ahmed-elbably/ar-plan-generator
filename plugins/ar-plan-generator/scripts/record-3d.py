#!/usr/bin/env python3
"""
Record the 3D build of a plan as an MP4: flat plan -> tilt -> walls rise -> doors/windows -> fixtures -> orbit.
Optionally join it after the 2D build video (arplan.js animate + render-video.sh) with a crossfade.

  python3 record-3d.py <name>.3d.html <out.mp4> [--join <name>.build.mp4 --joined <name>.full.mp4]
                       [--fps 24] [--three-dir DIR]

Needs: Python Playwright with Chromium (pip install playwright && playwright install chromium) and ffmpeg.
--three-dir points at a local three.js r128 package (folder holding build/three.min.js) when the CDN is unreachable;
it also switches to offline mode (no web fonts).
Exit code 2 = a required tool is missing.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile

def die(msg, code=1):
    print(msg, file=sys.stderr); sys.exit(code)

ap = argparse.ArgumentParser()
ap.add_argument("page"); ap.add_argument("out")
ap.add_argument("--fps", type=int, default=24)
ap.add_argument("--join"); ap.add_argument("--joined")
ap.add_argument("--three-dir")
a = ap.parse_args()
if not shutil.which("ffmpeg"): die("ffmpeg not found", 2)
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    die("Python Playwright not found (pip install playwright && playwright install chromium)", 2)

W, H, FPS = 1920, 1080, a.fps
ease = lambda t: 4*t*t*t if t < .5 else 1-((-2*t+2)**3)/2
OVERLAY = """
(()=>{const css=`.ar3d-ctrl,.ar3d-hint{display:none!important}
#cap{position:absolute;right:32px;top:32px;background:#fff;border:1px solid #DCD9D1;border-radius:14px;box-shadow:0 8px 28px rgba(27,29,26,.10);padding:18px 24px;min-width:420px;font-family:"IBM Plex Sans",system-ui,sans-serif;color:#1B1D1A}
#cap .eb{font-family:"IBM Plex Mono",monospace;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#6B6F68}
#cap .ph{font-size:30px;font-weight:600;margin-top:4px;display:flex;align-items:center;gap:12px}
#cap .ph i{width:12px;height:12px;border-radius:50%;background:#1F5FBF;display:inline-block}
#cap .rows{display:grid;grid-template-columns:1fr auto;gap:6px 24px;margin-top:12px;font-size:17px}
#cap .rows span:nth-child(even){font-family:"IBM Plex Mono",monospace;color:#6B6F68;text-align:right}
#cap .done{margin-top:12px;font-size:19px;font-weight:600;color:#2F8A55;display:none}
.ar3d-info{left:32px!important;top:32px!important;padding:16px 22px!important}
.ar3d-info .ar3d-t{font-size:24px!important}.ar3d-info .ar3d-eb{font-size:14px!important}.ar3d-info .ar3d-s{font-size:15px!important}`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const c=document.createElement('div');c.id='cap';c.innerHTML='<div class="eb">2D to 3D</div><div class="ph"><i></i><span id="ph">Plan view</span></div><div class="rows" id="rows"></div><div class="done" id="done"></div>';
document.querySelector('.ar3d-ui').appendChild(c);})();
"""

def phase_rows(k, n):
    cl = lambda v: max(0.0, min(1.0, v))
    walls = round(n["walls"] * cl((k - 0.25) / 0.55))
    ops = n["openings"] if k >= 0.85 else round(n["openings"] * cl((k - 0.7) / 0.15))
    fx = round(n["fixtures"] * cl((k - 0.8) / 0.2))
    if k <= 0.02: ph = "Plan view"
    elif k < 0.25: ph = "Lifting the plan"
    elif k < 0.7: ph = "Raising walls"
    elif k < 0.82: ph = "Setting doors & windows"
    elif k < 1: ph = "Placing fixtures"
    else: ph = "3D model ready"
    return ph, [("Rooms", f'{n["rooms"]}/{n["rooms"]}'), ("Walls", f'{walls}/{n["walls"]}'), ("Doors & windows", f'{ops}/{n["openings"]}'), ("Fixtures & equipment", f'{fx}/{n["fixtures"]}')]

tmp = tempfile.mkdtemp(prefix="ar3d_")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": W, "height": H})
    if a.three_dir:
        pg.route("**/three.min.js", lambda r: r.fulfill(path=os.path.join(a.three_dir, "build/three.min.js"), content_type="application/javascript"))
        pg.route("**/OrbitControls.js", lambda r: r.fulfill(path=os.path.join(a.three_dir, "examples/js/controls/OrbitControls.js"), content_type="application/javascript"))
        # offline mode: web fonts are not reachable either, so serve empty font CSS instead of letting the page stall
        pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
        pg.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    pg.goto("file://" + os.path.abspath(a.page) + "#record")
    try:
        pg.wait_for_function("!!(window.view && window.view.setModel)", timeout=90000, polling=500)
    except Exception as e:
        print(str(e)[:400], file=sys.stderr)
        die("The 3D page did not start (three.js could not load or WebGL is unavailable). Pass --three-dir if the CDN is unreachable.")
    pg.evaluate(OVERLAY)
    n = pg.evaluate("view.counts"); iso = pg.evaluate("view.isoAngles")
    frames = []
    def shot(k, polar, azim, dk, done=None):
        ph, rows = phase_rows(k, n)
        pg.evaluate("""([ph,rows,done])=>{document.getElementById('ph').textContent=ph;
          document.getElementById('rows').innerHTML=rows.map(r=>'<span>'+r[0]+'</span><span>'+r[1]+'</span>').join('');
          const d=document.getElementById('done');if(done){d.textContent=done;d.style.display='block';}else d.style.display='none';}""", [ph, rows, done])
        pg.evaluate(f"view.setModel({k});view.setView({polar},{azim},{dk})")
        f = os.path.join(tmp, f"f_{len(frames)+1:04d}.png"); pg.screenshot(path=f); frames.append(f)
    P0, A0, D0 = 0.0001, 0.0, 0.8          # plan view, a little closer than the fit-all distance
    iso = dict(iso, distK=iso["distK"]*0.84)  # tighter 3D framing for video
    hold0, rise, orbit, hold1 = int(FPS*0.6), int(FPS*5.5), int(FPS*4.5), int(FPS*2)
    for i in range(hold0): shot(0, P0, A0, D0)
    for i in range(1, rise+1):
        t = i/rise; k = t; c = ease(max(0, min(1, (t-0.05)/0.65)))
        shot(k, P0+(iso["polar"]-P0)*c, A0+(iso["azim"]-A0)*c, D0+(iso["distK"]-D0)*c)
    for i in range(1, orbit+1):
        t = ease(i/orbit); shot(1, iso["polar"]-0.15*t, iso["azim"]+1.25*t, iso["distK"]-0.08*t)
    end_p, end_a, end_k = iso["polar"]-0.15, iso["azim"]+1.25, iso["distK"]-0.08
    for i in range(hold1): shot(1, end_p, end_a, end_k, done="IFC + DXF exported · ready for MEP")
    b.close()

subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f_%04d.png"),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out], check=True)
shutil.rmtree(tmp, ignore_errors=True)
result = {"ok": True, "video_3d": a.out, "seconds": round((hold0+rise+orbit+hold1)/FPS, 1)}
if a.join:
    joined = a.joined or a.out.replace(".mp4", ".full.mp4")
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.join], capture_output=True, text=True, check=True).stdout.strip())
    xf = 0.6
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.join, "-i", a.out, "-filter_complex",
                    f"[0:v]fps={FPS},scale={W}:{H},setsar=1[a];[1:v]fps={FPS},scale={W}:{H},setsar=1[b];[a][b]xfade=transition=fade:duration={xf}:offset={dur-xf:.3f},format=yuv420p[v]",
                    "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", joined], check=True)
    result["video_full"] = joined
print(json.dumps(result, indent=1))
