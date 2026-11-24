# Changelog

## 0.5.0
- **Dubai code check:** a rule pack of 64 rules from the Dubai Building Code 2021 (Part K Villas), UAE Fire & Life Safety Code 2018, DEWA 2017 and ASHRAE 62.2-2019, each verified against the source with clause and page. `arplan.js codecheck` and `build --pack dubai` report PASS / FAIL / NOT CHECKABLE / N/A / OUT OF SCOPE with measured values and element ids.
- **Pack-driven placement:** WC and basin clearances, floor drains in wet rooms, Dubai door widths.
- **Design data in the spec:** plot and setbacks, building type and height, ceiling heights, window sill / height / operation, glazing share, glazed doors, kitchen counters, gas, Hassantuk, sprinklers; 17 new fixture kinds; plan.json v2 (reads v1).
- **Generated layers:** fire detection and alarm, ventilation and fresh air, and the electrical layer with a circuit schedule; `"generate": {"devices": false}` or `{"electrical": false}` turns them off.
- **Plans-examiner review:** `review-floor-plan` skill, `arplan.js review` bundle and `review-check` validator.
- **Tests:** `node --test tests/*.test.js`, including a planted-violation suite (63 caught, 0 false alarms, 12 traps at the limit).
- DXF layers F-FIRE, M-EXHT, P-GAS, A-CASE, E-POWR; IFC sensors, alarms, fans, tanks, outlets and switching devices; 3D shapes for every new kind.
- The readiness check no longer cites IRC R310 on non-US plans.

## 0.4.0
- 2D-to-3D build video: `scripts/record-3d.py` records the plan lifting into 3D, walls rising and a camera orbit, and joins it to the 2D build video.

## 0.3.0
- 3D model page for every plan (three.js): plan view, 3D, cut at 1.2 m, fixtures toggle.
- IFC4 export: walls cut at openings, doors, windows, slabs, spaces, typed fixtures with services.

## 0.2.0
- Build replay page and MP4 (rooms, walls, openings, fixtures, then MEP checks ticking).
- First-look image sent as soon as the layout exists.

## 0.1.0
- Generate, change and check floor plans; SVG, layered DXF, AR Plan Studio JSON and check report.
