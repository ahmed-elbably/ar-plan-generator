---
name: generate-floor-plan
description: This skill should be used when the user asks to generate, design, draw, lay out or sketch a floor plan or architectural layout from a written brief or a sketch, or to see it in 3D, for example "make me a 4-bedroom villa plan", "design a 2BR apartment layout", "draw a clinic ground floor", "turn this sketch into a plan", or "ارسم مخطط فيلا". It produces a 2D plan with walls, doors, windows and MEP-relevant fixtures as SVG, layered DXF, IFC4 for Revit or Navisworks, a 3D model page, a build replay, AR Plan Studio JSON and a check report.
---

# Generate a floor plan

Turn a brief into a single-level 2D architectural plan. Claude decides the layout as a compact JSON "spec" (rectangular rooms, doors, windows, fixtures); the bundled engine turns the spec into clean geometry: walls on every room edge, exterior walls detected and thickened, openings cut, fixtures placed against walls and kept clear of doors.

The engine is `scripts/arplan.js` in the plugin root, two folders above this skill's base directory. It needs Node 18 or later and has no dependencies.

## Workflow

1. **Read the brief.** Note building type, total area, room list, special requirements, region and units. When the region is not stated, use UAE / GCC conventions. Use metres unless the user works in feet. Ask one short question only when the building type itself is unclear; otherwise state the assumptions in the reply and proceed.
   - For a sketch or plan image, read the room arrangement, proportions and any written dimensions from the image and follow them.
2. **Load the rules.** Read `references/spec-format.md` (required: coordinates, JSON shape, layout rules, self-check) and `references/conventions.md` (regional programme and typical sizes). `examples/uae-villa-4br.spec.json` is a complete worked spec (4-bed GCC villa, 25 rooms, builds with no warnings): follow its zoning, corridor spine and en-suite pattern.
3. **Lay out before writing coordinates.** Decide zones (public / private / service), the circulation spine and the footprint grid. Sum the room areas and compare with the target area (±10%).
4. **Write the spec** to `<slug>.spec.json` in the working directory. Run the self-check list in `references/spec-format.md` and fix problems before building.
   - For Dubai projects also write the design data the code check needs (see "Design data for the code check" in `references/spec-format.md`): `plot` with its road side, `building_type`, `building_h`, `ceiling_h`, `glass`, `window_defaults`, `hassantuk`, kitchen `counters`, and `glazed` terrace doors. Use values from the brief or affection plan; where you assume one, say so in the reply.
5. **Build:**
   ```bash
   node "<plugin root>/scripts/arplan.js" build <slug>.spec.json --out <output dir> --name <slug> [--units ft] [--level "Ground floor"] [--pack dubai]
   ```
   Add `--pack dubai` for projects in Dubai, and for UAE briefs that name no other emirate (state that Dubai rules were applied). The pack makes the engine keep the DBC WC / basin clearances, add missing floor drains, generate the fire-detection, ventilation and electrical layers with a circuit schedule (see "What the engine generates" in `references/spec-format.md`), and run the code check. In the reply, say that socket counts per room are layout defaults, not code requirements.
   The command prints a JSON summary: `stats`, `builder_notes`, `ready_for_mep`, `failed_checks`, `clashes`, `files`, and with a pack `codecheck` (`summary` counts and `fails`). It writes `<slug>.plan.json`, `.svg`, `.dxf`, `.ifc`, `.3d.html` and `.report.md`, and with a pack `<slug>.codecheck.md` and `.codecheck.json`.
6. **Show the first look right away.** As soon as the first build succeeds, render the SVG to PNG and send it to the user with a one-line caption ("First pass: zoning and rooms; checking doors and fixtures next"), before any fix-and-rebuild round. The user should never wait for the final answer to see the layout.
7. **Fix and rebuild** (at most two rounds) when the summary shows any of these: overlapping rooms, a door that could not be placed, a bedroom or living room without an outside wall, missing bathroom fixtures, fixture clashes, a missing water heater, AHU or electrical panel, any code-check `fails`, or a builder note that a room is too small for its WC / basin clearances. Edit the spec, not the outputs. "NOT CHECKABLE" code-check rules are not failures; list the main ones in the reply as open items. Notes such as "window moved from N to E" or a fixture moved to clear a door are fine to keep.
   - **Dubai projects: plans-examiner review.** When the code check has no fails, run the review-floor-plan skill on the plan (a separate reviewer, ideally a fresh subagent working only from `<slug>.review.json`). Validate its corrections with `arplan.js review-check`, apply the `must` corrections to the spec, rebuild with `--pack dubai`, and review once more. Two review rounds at most; list any correction still open in the reply, with its element ids.
8. **Look at it once.** Convert the SVG to PNG with whatever is available (`rsvg-convert -w 2000`, `python3 -c "import cairosvg; ..."`, or a headless Chrome screenshot) and view it to confirm the layout reads well. If nothing can render SVG, skip this step.
9. **Make the build replay** from the final plan:
   ```bash
   node "<plugin root>/scripts/arplan.js" animate <output dir>/<slug>.plan.json --out <output dir> --name <slug>
   bash "<plugin root>/scripts/render-video.sh" <output dir>/<slug>-frames <output dir>/<slug>.build.mp4
   ```
   - `<slug>.build.html` replays the build: rooms zone in, walls rise, doors and windows are cut, fixtures drop in, while an "elements placed" counter and a per-category legend count up; then the MEP checks tick one by one to the verdict. When an artifact tool is available, publish it as an artifact page so it plays in the conversation; otherwise send the HTML file with inline rendering.
   - `render-video.sh` turns the frames into a 1920×1080 MP4 (about 14 s) for sharing. It needs `rsvg-convert` and `ffmpeg`; exit code 2 means one is missing, so skip the video and say so in one line. Delete the `-frames` folder after the video is made.
10. **Show it in 3D.** The build also wrote `<slug>.3d.html`: the plan starts flat, tilts and the walls rise to full height with real door and window openings, coloured floors and 3D fixtures; the user can orbit, switch Plan / 3D, cut the walls at 1.2 m and hide fixtures. Publish it as an artifact page when an artifact tool is available, otherwise send the HTML file with inline rendering. It loads three.js from cdn.jsdelivr.net, so it needs an internet connection.
11. **Make the full build video** (2D build, then the plan lifting into 3D, walls rising, fixtures dropping in and a camera orbit), when the user wants a video or it is cheap to make:
    ```bash
    python3 "<plugin root>/scripts/record-3d.py" <output dir>/<slug>.3d.html <output dir>/<slug>.3d.mp4 \
        --join <output dir>/<slug>.build.mp4 --joined <output dir>/<slug>.full.mp4
    ```
    It needs Python Playwright with Chromium and ffmpeg (exit code 2 = missing; skip and say so in one line). Add `--three-dir <folder holding build/three.min.js>` when the CDN is unreachable (get it with `npm pack three@0.128.0`). Without a GPU it takes several minutes, so start it in the background and deliver everything else first. Leave out `--join` for the 3D part alone.
12. **Deliver** the build replay and the 3D page first (artifact pages or HTML), then the full video (`.full.mp4`, or the 2D `.build.mp4` if the 3D recording was skipped), the final PNG (or SVG), the `.dxf`, the `.ifc`, the `.plan.json` and the `.report.md`. In the reply give: a one-line layout idea, gross and conditioned area, the room count, any open warnings, and these notes:
   - The `.plan.json` opens in AR Plan Studio with **Import JSON**, where it can be edited by hand or with the AI panel.
   - The DXF is in metres (1 unit = 1 m, north up) with layers `A-WALL`, `A-DOOR`, `A-GLAZ`, `A-AREA`, `A-AREA-IDEN`, `P-FIXT`, `A-EQPM`, `P-EQPM`, `M-EQPM`, `E-EQPM`. In Revit use Insert > Link CAD with import units set to metres.
   - The IFC (IFC4, metres) holds walls cut at openings, doors, windows, a floor slab and a space per room (space Name = room number, LongName = room name), and every fixture as its IFC class (IfcSanitaryTerminal, IfcElectricAppliance, IfcUnitaryEquipment, IfcElectricDistributionBoard, IfcWasteTerminal) contained in its room with an `ARPlan_Fixture` property set listing its services. Link it in Revit with Insert > Link IFC, or append it in Navisworks for coordination.

## Notes

- Keep room names unique and in English unless the user asks otherwise; the brief may be in any language.
- Rooms are rectangles. Build L-shaped or open-plan spaces from two adjoining rooms joined by an `opening` door.
- Multi-storey briefs: build one spec per level with the same footprint grid, name the files by level (`--level "First floor"`), and keep stairs, shafts and wet rooms stacked.
- To change a plan afterwards, use the change-floor-plan skill; to check one, use check-floor-plan.
- AR Plan Studio, the interactive editor, ships with this plugin as `assets/ar-plan-studio.html`. When the user wants to edit visually and an artifact tool is available, publish that file as an artifact page and declare its `downloads` and `sample` (with images) capabilities so its download buttons and AI panel work. Otherwise send the HTML file itself; it runs in any browser, without the AI panel.
