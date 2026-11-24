---
name: change-floor-plan
description: This skill should be used when the user asks to change, modify, revise or update an existing floor plan, for example "add a maid's room next to the kitchen", "make the master bedroom 1 m wider", "swap the tubs for showers", "move the guest WC near the entrance", or "revise this plan" with an AR Plan Studio JSON or a plan generated earlier in the conversation. It keeps everything the change does not touch and outputs new SVG, DXF, IFC, 3D page, JSON and report files.
---

# Change a floor plan

Edit a plan through its spec so untouched rooms, doors, windows and fixtures stay exactly where they are.

The engine is `scripts/arplan.js` in the plugin root, two folders above this skill's base directory. The spec format and layout rules are in `../generate-floor-plan/references/spec-format.md`; read it before editing.

## Workflow

1. **Find the plan.** Use the `.plan.json` the user attached or the one produced earlier in the conversation (an AR Plan Studio export works too). If the user has only an SVG, DXF, PDF or image, explain that the JSON is what keeps the plan editable; offer to redraw it from the image with the generate-floor-plan skill instead.
2. **Get the editable spec:**
   ```bash
   node "<plugin root>/scripts/arplan.js" to-spec <plan>.plan.json > <slug>.spec.json
   ```
   Rooms come back as their bounding rectangles; walls drawn by hand that do not belong to a room are not carried over. Mention this when the plan has such walls.
3. **Check the starting point:** `node .../arplan.js check <plan>.plan.json` and note the area and readiness, to compare after the change.
4. **Edit the spec minimally.** Change only what the request needs. Keep names, coordinates and `at` values of everything else. When a room grows, shift or shrink only its direct neighbours and keep the footprint tidy. Update doors, windows and fixtures that belong to moved rooms. Run the self-check in spec-format.md.
5. **Build** under a new name so the previous version stays available:
   ```bash
   node "<plugin root>/scripts/arplan.js" build <slug>.spec.json --out <output dir> --name <slug>-v2 [--pack dubai]
   ```
   Use `--pack dubai` when the plan is a Dubai project (it has a `.codecheck.json`, or its spec has a `plot` / `hassantuk`). Generated items (`auto` in the plan: floor drains, detectors, fans, sockets, circuits) are not in the spec that `to-spec` returns; the build regenerates them for the new layout.
   Fix and rebuild (at most two rounds) if the summary shows overlaps, doors not placed, missing fixtures, clashes or new code-check fails caused by the change. In the reply, compare the code-check summary before and after.
6. **Look once** at a PNG render of the SVG, as in generate-floor-plan.
7. **Replay the build** when the user wants to see it, or the change is large: run `arplan.js animate` on the new plan JSON and `render-video.sh` on its frames, exactly as in step 9 of generate-floor-plan, and `record-3d.py` for the 2D-to-3D video as in step 11.
8. **Deliver** the new 3D page (`.3d.html`, as an artifact page when possible), PNG or SVG, DXF, IFC, plan JSON and report (plus the replay page and MP4 if made). In the reply list exactly what changed (rooms added, resized or moved, with before and after sizes), the new gross and conditioned areas compared with before, and any new warnings.
