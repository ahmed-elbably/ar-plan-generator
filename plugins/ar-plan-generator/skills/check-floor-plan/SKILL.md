---
name: check-floor-plan
description: This skill should be used when the user asks to check, review or audit a floor plan JSON, wants its room schedule or areas, asks whether a plan is ready for MEP design, or wants a plan exported to DXF, SVG or IFC or shown in 3D, for example "check this plan", "is this ready for MEP?", "give me the room schedule and areas", "export my AR Plan Studio plan to DXF for Revit", "give me an IFC of this plan", "show this plan in 3D".
---

# Check or export a floor plan

Report on an AR Plan Studio / AR Plan Generator `.plan.json`: areas, room schedule, MEP readiness and clashes, and export it to SVG and layered DXF.

The engine is `scripts/arplan.js` in the plugin root, two folders above this skill's base directory.

## Workflow

1. **Find the plan JSON** (attached, or produced earlier in the conversation). Only `.plan.json` / AR Plan Studio exports can be checked; for a DXF, PDF or image, offer to redraw it with the generate-floor-plan skill.
2. **Check:**
   ```bash
   node "<plugin root>/scripts/arplan.js" check <plan>.plan.json --out <output dir>
   ```
   This prints the Markdown report and saves it as `<name>.report.md`. It covers:
   - gross and conditioned area (conditioned excludes garage and outdoor rooms), counts of rooms, doors, windows, fixtures
   - room schedule with areas
   - MEP readiness: rooms typed, every room has a door, bedrooms have windows (IRC R310 egress), bathrooms and WCs complete, kitchen sink, water heater, AHU, electrical panel, fixtures inside rooms
   - clashes: fixtures overlapping each other, standing in a doorway, or in a door's swing
3. **Export** when the user asks for drawings:
   ```bash
   node "<plugin root>/scripts/arplan.js" export <plan>.plan.json --out <output dir> [--name NAME]
   ```
   Writes SVG, DXF (metres, north up, layers `A-WALL`, `A-DOOR`, `A-GLAZ`, `A-AREA`, `A-AREA-IDEN`, `P-FIXT`, `A-EQPM`, `P-EQPM`, `M-EQPM`, `E-EQPM`), IFC4 (for Revit or Navisworks), the 3D model page and the report. For one format only, use `arplan.js ifc <plan>.plan.json --out <dir>` or `arplan.js 3d <plan>.plan.json --out <dir>`.
4. **Replay** on request ("show me it being built", "make a video of this plan"): run `arplan.js animate <plan>.plan.json --out <dir>` and `render-video.sh` as in step 9 of generate-floor-plan; for the 2D-to-3D video also run `arplan.js 3d` and `record-3d.py` as in step 11.
5. **Reply** with a short verdict first (ready for MEP, or what blocks it), then the key numbers and the failed items with a concrete fix for each (for example "Bath 2 has no shower: add one on the east wall"). Send the report file and any exported drawings. Offer to apply the fixes with the change-floor-plan skill.
