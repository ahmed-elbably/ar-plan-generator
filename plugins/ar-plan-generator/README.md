# AR Plan Generator

Generate 2D architectural floor plans from a written brief or a sketch, change them with plain instructions, and check them for MEP readiness. It uses the same drawing engine as AR Plan Studio, so plans move freely between the two.

## Skills

| Skill | Ask for it like | Produces |
|---|---|---|
| generate-floor-plan | "Make me a 4-bedroom villa, about 320 m², with a majlis and maid's room" | Drawing, 3D model, build replay, DXF, IFC, plan JSON, check report |
| change-floor-plan | "Add a store next to the garage" (with a plan JSON) | New versions of all four files, plus what changed |
| check-floor-plan | "Is this plan ready for MEP?" / "Export my plan to DXF" | Report: areas, room schedule, MEP readiness, clashes; SVG and DXF on request |

Default design conventions are UAE / GCC (majlis, guest WC, maid's room, en-suites, outdoor AC units). Ask for Egypt, US or international conventions in the brief.

## Outputs

- **`.svg`**: the drawing, with room names, areas and exterior dimensions.
- **`.dxf`**: AutoCAD R12 DXF in metres (1 unit = 1 m, north up). Walls are cut at openings. Layers:

  | Layer | Content |
  |---|---|
  | A-WALL | Wall outlines |
  | A-DOOR | Door leaves, swings, jambs |
  | A-GLAZ | Windows |
  | A-AREA / A-AREA-IDEN | Room boundaries / room names and areas |
  | P-FIXT | WC, basin, sink, shower, tub, floor drain |
  | A-EQPM | Washer, dryer, dishwasher, range, fridge |
  | P-EQPM / M-EQPM / E-EQPM | Water heater / AHU and AC units / electrical panel |

  In Revit: Insert > Link CAD, import units metres.
- **`.ifc`**: IFC4 in metres for Revit (Insert > Link IFC) or Navisworks: walls cut at openings, doors, windows, a floor slab and a space per room (Name = number, LongName = room name), fixtures as IfcSanitaryTerminal / IfcElectricAppliance / IfcUnitaryEquipment / IfcElectricDistributionBoard / IfcWasteTerminal inside their rooms, with an `ARPlan_Fixture` property set (services, room).
- **`.3d.html`**: the 3D model. It starts as the flat plan, tilts, and the walls rise; then orbit, switch Plan / 3D, cut at 1.2 m, toggle fixtures. Loads three.js from cdn.jsdelivr.net.
- **`.plan.json`**: opens in AR Plan Studio with Import JSON. Fixtures carry their room and services (water, drain, gas, elec, hvac) for the MEP step.
- **`.report.md`**: areas, room schedule, MEP readiness and clash checks.
- **`.build.html`**: a replay of the plan being built (rooms, walls, doors, windows, fixtures, then the MEP checks ticking), with an elements-placed counter and per-category legend. Plays in the conversation as an artifact page.
- **`.build.mp4`**: the same replay as a 1920×1080 video (about 14 s), ready to share. Needs `rsvg-convert` and `ffmpeg`.
- **`.full.mp4`**: the complete story in one 1920×1080 video (about 26 s): the 2D build, a crossfade, then the plan lifting into 3D, walls rising, doors, windows and fixtures appearing, and a camera orbit ending on "IFC + DXF exported". Made by `scripts/record-3d.py` (Python Playwright with Chromium, plus ffmpeg).

## Requirements

Node.js 18 or later (no packages needed). The build video also needs `rsvg-convert` and `ffmpeg`; the 2D-to-3D video needs Python Playwright with Chromium as well. Converting the SVG to PNG uses whatever the environment has (rsvg-convert, cairosvg or headless Chrome); without one, the SVG is delivered as is.

## Engine

`scripts/arplan.js` can also be run directly:

```bash
node scripts/arplan.js build   plan.spec.json --out out --name villa [--units ft] [--level "Ground floor"]
node scripts/arplan.js to-spec villa.plan.json
node scripts/arplan.js check   villa.plan.json --out out
node scripts/arplan.js export  villa.plan.json --out out
node scripts/arplan.js 3d      villa.plan.json --out out
node scripts/arplan.js ifc     villa.plan.json --out out
node scripts/arplan.js animate villa.plan.json --out out --name villa
bash scripts/render-video.sh out/villa-frames out/villa.build.mp4
python3 scripts/record-3d.py out/villa.3d.html out/villa.3d.mp4 --join out/villa.build.mp4 --joined out/villa.full.mp4
```

The spec format is documented in `skills/generate-floor-plan/references/spec-format.md`.

## AR Plan Studio

`assets/ar-plan-studio.html` is the interactive editor: draw and edit walls, rooms, doors, windows and fixtures, see the MEP-readiness dashboard, open the plan in 3D (3D view button or key 3), and generate or change plans with its AI panel when opened in Claude.

## Limits

- One level per plan; rooms are rectangles (combine two for an L-shape).
- Plans are concept-stage layouts. Check structure, code compliance and dimensions before issuing drawings.
