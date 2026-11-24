# AR Plan Generator

[![Project site](https://img.shields.io/badge/site-ahmed--elbably.github.io%2Far--plan--generator-1F5FBF)](https://ahmed-elbably.github.io/ar-plan-generator/)
[![Version](https://img.shields.io/badge/version-0.5.0-2F8A55)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#requirements)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757)](#install)
[![Deploy site](https://github.com/ahmed-elbably/ar-plan-generator/actions/workflows/pages.yml/badge.svg)](https://github.com/ahmed-elbably/ar-plan-generator/actions/workflows/pages.yml)

**[Project site](https://ahmed-elbably.github.io/ar-plan-generator/) · [Live 3D demo](https://ahmed-elbably.github.io/ar-plan-generator/examples/uae-villa-4br/uae-villa-4br.3d.html) · [Build replay](https://ahmed-elbably.github.io/ar-plan-generator/examples/uae-villa-4br/uae-villa-4br.build.html) · [AR Plan Studio](https://ahmed-elbably.github.io/ar-plan-generator/studio/ar-plan-studio.html)**

A Claude plugin that turns a written brief or a sketch into an architectural floor plan, then into a 3D model, with drawings and BIM files you can take straight into AutoCAD, Revit or Navisworks.

![The plan builds in 2D, passes its MEP checks, then lifts into 3D](media/demo.gif)

> "Single-storey villa, about 320 m²: majlis near the entrance with a guest WC, family living and dining, closed kitchen with pantry, maid's room with its own bathroom, laundry, 4 en-suite bedrooms, 2-car garage."

That brief produced the plan above: 25 rooms, 27 doors, 17 windows, 9/9 MEP-readiness checks, no clashes. Built with the Dubai code pack it also carries 61 fixtures and devices (sanitary, MEP, fire detection, ventilation) and 51 electrical accessories on 31 circuits, and it passes the **Dubai code check with 47 rules passed and none failed**. All of its files are in [`examples/uae-villa-4br`](examples/uae-villa-4br).

## What it does

| Ask Claude | You get |
|---|---|
| "Make me a 4-bedroom villa, about 320 m², with a majlis and maid's room" | A 2D plan, 3D model, build replay, DXF, IFC, plan JSON and a check report |
| "Turn this sketch into a plan" (with an image) | The same, following the sketch's layout and written dimensions |
| "Add a store next to the garage" (with a plan JSON) | A new version that changes only what's needed, plus what changed |
| "Is this plan ready for MEP?" / "Export it to IFC" | Areas, room schedule, MEP readiness, door and fixture clashes; drawings on request |
| "Check it against the Dubai code" / "Review it like the municipality would" | A rule-by-rule code check (pass, fail or not checkable, with clause and page) and a plans-examiner review with corrections |

Claude decides the layout. A bundled engine draws it: walls on every room edge, thicker exterior walls, door and window openings cut, fixtures placed against walls and kept clear of doors and door swings. Every plan is checked before you see it.

UAE / GCC conventions are the default (majlis, guest WC, maid's room, en-suites, outdoor AC units). Ask for Egypt, US (IRC) or international conventions in the brief. Briefs can be in Arabic.

## Dubai code check (v0.5)

For Dubai villas and townhouses the plugin builds and checks against a **rule pack** of 64 rules, each verified against the official text with its clause and page (see [docs/code-check-rule-list.md](docs/code-check-rule-list.md)):

| Source | Edition | What it covers |
|---|---|---|
| Dubai Building Code, Part K Villas | 2021 | Room sizes, heights, doors, daylight, corridors, setbacks, parking, sanitary clearances, floor drains, water, electrical (K.9.1), fire systems (K.10.5) |
| UAE Fire & Life Safety Code of Practice | 2018 | Escape routes and windows, detectors per room, kitchen detectors, extinguishers |
| DEWA Regulations for Electrical Installations | 2017 | Sockets per circuit |
| ASHRAE 62.2 (required by DBC K.10.1.6) | 2019 | Whole-house fresh air, kitchen and bathroom exhaust |

With `--pack dubai` the engine:
- **places** WCs and basins with the DBC clearances, adds floor drains to every wet room, and defaults doors to the Dubai clear widths;
- **generates** the fire-detection layer (detectors, panel by the front door, outdoor alarm on the road facade, kitchen extinguisher), ventilation (bathroom fans, range hood, a fresh-air unit sized by ASHRAE 62.2) and the electrical layer (sockets, shaver outlets, DP switches, cooker control unit) with a **circuit schedule** and RCD ratings. Socket counts per room are layout defaults in `rules/dubai.json`, not code requirements;
- **checks** every rule: PASS, FAIL, NOT CHECKABLE (the plan lacks the data; never counted as a pass), N/A or OUT OF SCOPE, with the measured value, the limit and the element ids, in `<name>.codecheck.md` / `.codecheck.json`.

A separate **plans-examiner review** (skill `review-floor-plan`) covers what geometry cannot prove: trade interfaces, omissions, values copied from foreign codes, and five reviewer-only rules. It works from a factual bundle (`arplan.js review`), and its corrections are validated (`arplan.js review-check`): each must cite element ids that exist and a rule from the pack or a reason. The first review of the example villa found nine issues, including a gap in the checker itself (rooms with a water heater or AHU now count as wet).

The checker is tested with a **planted-violation suite**: 63 violations planted across 8 plans (including values just below each limit) are all caught with no false alarms, and 12 values set exactly at their limits all pass; every measurable rule is covered (`node tests/suite/score.js`).

Values come from the rule files, never from the model's memory. Another authority (Abu Dhabi, Sharjah) is another pack, with no code change. The check is a design aid for concept and scheme stage: an engineer still reviews and stamps the drawings.

## Install

### Claude Code

```
/plugin marketplace add ahmed-elbably/ar-plan-generator
/plugin install ar-plan-generator@ar-plan-generator
```

### Claude app

Download [ar-plan-generator.plugin](https://github.com/ahmed-elbably/ar-plan-generator/releases/latest/download/ar-plan-generator.plugin) from the latest release and add it to Claude as a plugin file.

### Requirements

- Node.js 18 or later (the engine has no dependencies).
- Optional, for videos: `ffmpeg`, plus `rsvg-convert` or Python Playwright with Chromium for the 2D build video (on Windows, where rsvg-convert is hard to get, `scripts/svg2png.py` renders the frames with Chromium), and Python Playwright with Chromium for the 2D-to-3D video.

## Outputs

| File | What it is |
|---|---|
| `.svg` / `.png` | The drawing, with room names, areas and exterior dimensions |
| `.dxf` | AutoCAD R12 DXF in metres, north up, walls cut at openings. Layers: `A-WALL`, `A-DOOR`, `A-GLAZ`, `A-AREA`, `A-AREA-IDEN`, `P-FIXT`, `A-EQPM`, `P-EQPM`, `M-EQPM`, `E-EQPM` |
| `.ifc` | IFC4 in metres: walls, doors, windows, a slab and a space per room (Name = number, LongName = room name), fixtures as IfcSanitaryTerminal, IfcElectricAppliance, IfcUnitaryEquipment, IfcElectricDistributionBoard and IfcWasteTerminal inside their rooms, with an `ARPlan_Fixture` property set (services, room) |
| `.3d.html` | Interactive 3D model: the plan lifts and the walls rise; then orbit, plan / 3D, cut at 1.2 m, fixtures on or off |
| `.build.html` / `.build.mp4` | Replay of the plan being built, with an elements-placed counter and the MEP checks ticking |
| `.full.mp4` | The whole story in one 1920×1080 video: 2D build, then the 3D build and orbit ([example](media/uae-villa-4br-2d-to-3d.mp4)) |
| `.plan.json` | Editable plan; opens in AR Plan Studio |
| `.report.md` | Areas, room schedule, MEP readiness and clashes; with a pack, the circuit schedule |
| `.codecheck.md` / `.codecheck.json` | With `--pack dubai`: every rule's status, clause, page, measured value and limit |
| `.review.json` | `arplan.js review`: the bundle the plans-examiner works from |

In Revit: Insert > Link CAD (DXF, units metres) or Insert > Link IFC.

## AR Plan Studio

[`studio/ar-plan-studio.html`](studio/ar-plan-studio.html) is the interactive editor that goes with the plugin. Open it in a browser to draw and edit walls, rooms, doors, windows and fixtures, watch the MEP-readiness dashboard, open the plan in 3D, and import or export plan JSON. Opened as an artifact page in Claude, its AI panel also generates and changes plans from a description.

## Run the engine directly

```bash
cd plugins/ar-plan-generator/scripts
node arplan.js build   ../skills/generate-floor-plan/examples/uae-villa-4br.spec.json --out out --name villa
node arplan.js check   out/villa.plan.json
node arplan.js 3d      out/villa.plan.json --out out
node arplan.js ifc     out/villa.plan.json --out out
node arplan.js build   ../skills/generate-floor-plan/examples/uae-villa-4br.spec.json --out out --name villa --pack dubai   # Dubai pack
node arplan.js codecheck out/villa.plan.json --pack dubai --out out
node arplan.js review  out/villa.plan.json --pack dubai --out out
node arplan.js review-check villa.corrections.json --plan out/villa.plan.json
node arplan.js animate out/villa.plan.json --out out --name villa
bash render-video.sh out/villa-frames out/villa.build.mp4
python3 record-3d.py out/villa.3d.html out/villa.3d.mp4 --join out/villa.build.mp4 --joined out/villa.full.mp4
```

The spec format Claude writes is documented in [`spec-format.md`](plugins/ar-plan-generator/skills/generate-floor-plan/references/spec-format.md).

## Repository layout

```
.claude-plugin/marketplace.json   marketplace entry for Claude Code
plugins/ar-plan-generator/        the plugin: skills, engine scripts, rule packs, AR Plan Studio asset
  rules/                          Dubai rule pack (DBC 2021, UAE FLSC 2018, DEWA 2017, ASHRAE 62.2-2019)
  scripts/                        arplan.js engine, codecheck.js, generators.js, review.js
docs/                             rule list with clauses and pages, build plan
tests/                            node --test tests/*.test.js; tests/suite is the planted-violation suite
dist/ar-plan-generator.plugin     packaged plugin for the Claude app
examples/uae-villa-4br/           every output for the villa above
studio/ar-plan-studio.html        the interactive editor
media/                            demo GIF, video and plan image
site/index.html                   project site, deployed to GitHub Pages
site/stats.html                   download counter (unlisted page)
.github/workflows/pages.yml       builds and deploys the site on every push to main
.github/workflows/release.yml     publishes the .plugin as a GitHub release on every version tag
```

## Limits

- One level per plan. Rooms are rectangles; combine two for an L-shape.
- Plans are concept-stage layouts. Check structure, code compliance and dimensions before issuing drawings. The Dubai code check covers 64 rules; structure, envelope and Al Sa'fat energy, accessibility, stairs, pools and multi-building plots are out of scope.
- AR Plan Studio does not show the v0.5 fixture kinds yet (detectors, fans, sockets); it drops them on import.
- The 3D page loads three.js from cdn.jsdelivr.net, so it needs an internet connection and WebGL.

## License

[MIT](LICENSE) © 2026 Ahmed Elbably
