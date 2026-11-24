# Build plan — Dubai code-check layer for AR Plan Generator

Input: [code-check-rule-list.md](code-check-rule-list.md) (64 rules after F-09 was split into primary / secondary escape; 63 verified).
Target release: **v0.5.0**.

**Status (v0.5.0): phases 0 to 7 done.** Open after release: AR Plan Studio support for the new kinds, multi-storey checks, energy (Al Sa'fat), more authority packs, regenerated media (needs rsvg-convert and Playwright).

## Goal

After every build, the plugin tells you, rule by rule, whether the villa meets Dubai Part K, UAE FLSC 2018, DEWA 2017 and ASHRAE 62.2-2019:
**PASS / FAIL / NOT CHECKABLE / OUT OF SCOPE**, with the clause, the page, the measured value and the element IDs. Nothing is skipped silently.

**Done means:**
1. `node arplan.js codecheck villa.plan.json --pack dubai` prints the report and writes `villa.codecheck.md` + `villa.codecheck.json`.
2. A test set of villas with **planted violations** is caught at **100 %**, with **zero false alarms** on "trap" values that are legal but close to a limit (for example, a door of exactly 915 mm).
3. The example UAE villa is rebuilt and passes, or every remaining FAIL is explained.
4. The engine still has **no dependencies** (Node 18+, built-in `node:test` for tests).

---

## Design principles

1. **Values live in data, logic lives in code.** Each rule is a JSON record with its value, clause and page. The JS only knows *how to measure* (for example, "minimum area by room type"). Changing a code value never touches JS. This is the defence against the article's wrong-table-row failure.
2. **Missing data never passes.** If a rule needs a field the plan doesn't have, the result is NOT CHECKABLE, never PASS. There are only two allowed defaults, both decided by you, and the report always prints them:
   - plot setbacks fall back to Table K.1
   - gas defaults to all-electric
3. **Generate what the code prescribes.** Sockets, switches and DP switches are placed by the engine from the electrical rules, not by Claude (your decision).
4. **Backwards compatible.** Old specs and `.plan.json` files still build and open. New fields are optional, and leaving one out just makes its rules NOT CHECKABLE.
5. **Sources stay local.** `docs/sources/*` is git-ignored.

---

## File layout (new and changed)

```
plugins/ar-plan-generator/
  scripts/
    arplan.js                 changed: new fields, generators, `codecheck` command
    codecheck.js              NEW: rule-pack loader, measure functions, report writer
    generators.js             NEW: sockets, switches, (optional) detectors and exhaust
  rules/
    dubai.json                NEW: pack manifest → loads the four files below
    dm-dbc-2021.json          NEW: K-xx and P-xx rules
    cd-flsc-2018.json         NEW: F-xx rules
    dewa-2017.json            NEW: E-06 (radial / ring limits)
    ashrae-62.2-2019.json     NEW: V-xx rules
  skills/
    generate-floor-plan/      changed: spec-format.md, conventions.md (Dubai values)
    check-floor-plan/         changed: runs codecheck, explains failures
    review-floor-plan/        NEW: reviewer-agent skill (layer C)
tests/
  codecheck.test.js           NEW: node:test suite
  fixtures/                   NEW: planted-violation plans + expected results
docs/                         rule list, build plan, sources (git-ignored)
```

### Rule record format

```json
{
  "id": "K-06",
  "pack": "dm-dbc-2021",
  "clause": "K.5.4.1, Table K.4",
  "page": 708,
  "title": "Door clear width",
  "measure": "door_min_width",
  "params": { "general": 0.915, "bathroom": 0.710 },
  "applies": { "room_types": "*" },
  "needs": ["doors.w"],
  "verified": true,
  "engine": "now"
}
```

- `measure` names a JS function in `codecheck.js`. That function returns `{status, value, limit, elements[], note}`.
- `needs` lists the plan fields the rule requires. If any are missing, the status is NOT CHECKABLE and the report names the missing fields.
- A rule with `"verified": false` (today only F-14) still runs, but its report line is tagged **unverified**.

---

## Phases

Each phase ends with something you can look at before the next one starts.

### Phase 0 — Set up the working repo
- Put the repo in this folder: clone `ahmed-elbably/ar-plan-generator`, or extract the zip, on branch `feature/dubai-codecheck`.
- Add `docs/sources/*` to `.gitignore`, keeping only `README.md`.
- Baseline: build the example villa and save its outputs as a snapshot, to prove later that nothing else changed.
- **You check:** the branch exists and the baseline build is identical to the shipped example.

### Phase 1 — Checker on today's data (≈ 30 "Now" rules)
- `codecheck.js`: pack loader, the measure functions and the report (Markdown + JSON).
- The measure functions, grouped by kind:
  - **Rooms:** `room_min_area_dim`, `room_depth_ratio`, `garage_min_dims`
  - **Doors and circulation:** `door_min_width`, `corridor_min_width`, `two_exits_over_area`
  - **Fixtures:** `fixture_side_clearance`, `fixture_front_clearance`, `fixtures_required` (villa has WC + basin + bath/shower; FD in wet rooms)
  - **Electrical and fire:** `db_forbidden_rooms`, `sprinkler_threshold`
  - **Glazing:** `glazing_ratio_approx` (using a default window height, labelled as approximate)
- New CLI command `codecheck`. `build` gains a `--pack dubai` flag that runs it automatically.
- Make the existing "Ready for MEP" labels region-aware: today they cite IRC R310 even for UAE plans.
- **You check:** the report on the example villa. I expect real FAILs: room doors at 0.9 m against the 915 mm minimum, fixture clearances, and floor drains in the kitchen and laundry.

### Phase 2 — Fix the generator defaults
- Room doors default to 0.915 m clear. The spec's `w` is defined as **clear width**.
- Fixture placement keeps **400 mm** to side walls, **750 mm** between fixture centres and **750 mm** in front, as a placement constraint rather than only a check.
- A floor drain is added automatically in every wet room (kitchen, bath, WC, laundry) when the spec has none.
- Update `spec-format.md` and `conventions.md` with the verified Dubai values: room sizes, heights, doors, garages.
- Rebuild the example villa.
- **You check:** the new villa plan and its codecheck report.

### Phase 3 — Spec expansion
- New optional fields:
  - level and room: `ceiling_h`
  - windows: `sill`, `h`, `operable`
  - project: `plot`, `building_type` (villa / townhouse), `gas`
  - kitchens: `counters`
- New fixture kinds:
  - fire: `smoke`, `smoke_sounder`, `heat`, `facp`, `av_outdoor`, `extinguisher`
  - ventilation: `exhaust`, `fresh_air`, `hood`
  - water: `water_tank`, `pump`
- Carry the new fields through every format: `specToDoc` / `docToSpec`, plan.json (`version: 2`, still reads v1), SVG symbols, DXF layers and IFC:
  - DXF: `F-FIRE`, `E-POWR`, `E-LITE`, `M-EXHT`
  - IFC: IfcAlarm, IfcSensor, IfcFan, IfcTank, IfcOutlet, IfcSwitchingDevice
- Turn on the "Spec+" rules: K-04/05/07–10/14–17/25, F-01–F-07, F-10, F-14, F-15, P-03, V-01–V-05.
- **You check:** a spec written with the new fields, and its drawing and report.

### Phase 4 — Generators
- **Sockets and switches** (decided). The generator places:
  - general sockets at 450 mm along usable walls
  - kitchen sockets 150 mm above the worktop, never within 300 mm of the sink edge or above the hob
  - shaver outlets in bathrooms
  - a DP switch for the water heater outside the bathroom
  - a cooker switch within 2 m of the cooker
  - a DP switch and isolator for each AC unit
  - outdoor sockets (IP55)

  It also groups sockets into circuits: at most 5 per 20 A radial, or 10 per 30 A ring. The result is a circuit schedule (DB schedule table) in the report, with RCD ratings from Table K.46.
- **Detectors, exhaust fans and fresh air:** a **proposal**, needing your yes. They follow the same logic as sockets (the code fully prescribes them), so the engine could place them too:
  - sounder smoke detectors in bedrooms; smoke detectors in living rooms and corridors
  - a heat detector in a closed kitchen
  - the panel by the front door and the alarm light on the road side
  - an exhaust fan in every bath and kitchen
  - a fresh-air unit sized by ASHRAE 62.2 Eq. 4-1b

  Without this, Claude has to place them in every spec.
- **You check:** the electrical layer in the SVG and DXF, and the circuit schedule.

### Phase 5 — Reviewer agent (layer C)
- New skill `review-floor-plan`: a separate "plans examiner" prompt. It gets the plan JSON, the codecheck JSON and the checklist (rule list §4). It returns corrections as JSON: `{issue, element_ids, rule_or_reason, fix}`, at most 12, each with element IDs.
- `generate-floor-plan` workflow becomes: build → codecheck → fix → **review** → fix → deliver, with at most 2 fix rounds, as in the article's permit loop.
- The reviewer has to say which packs and editions were loaded, and flag any value that looks like a foreign default (IRC/NEC).
- **You check:** one full run on a new brief, with the corrections it found.

### Phase 6 — Test set with planted violations
Modelled on the article's Test 1:
- **6 fixture plans** built from the villa. Together they plant **at least 30 known violations**, at least one for every "Now" and "Spec+" rule.
- Plus **10 traps:** values exactly at a limit, which must PASS. For example a 10.5 m² bedroom, a 915 mm door, a 1.0 m corridor, a 900 mm sill, a 1,500 m² ground floor.
- Each fixture has an `expected.json`. The `node --test` suite fails on any miss or false alarm.
- The report prints **caught / planted** and **false alarms**.
- **You check:** the score, which must be 100 % caught and 0 false alarms.

### Phase 7 — Docs and release
- README "Code check" section, CHANGELOG 0.5.0, skill docs, rule-list status column, plugin version bump, rebuilt `dist/*.plugin`.
- Re-read F-14 (kitchen extinguisher) in the PDF and mark it verified.

---

## Out of this plan (later)

- **AR Plan Studio:** the HTML editor has its own copy of the engine, so it gets the new fields and checks in a separate step after v0.5.0. Until then it must keep unknown fields when importing and exporting. I'll verify that in Phase 3.
- **Multi-storey checks:** stairs, guardrails, the upper-floor escape window height.
- **Energy:** Al Sa'fat and Part E.
- **Abu Dhabi and Sharjah packs:** the pack format supports them, with no code changes.

## Risks

| Risk | Mitigation |
|---|---|
| The engine's fixture placement fails the new clearances in small bathrooms | Phase 2 reports "could not place" instead of placing illegally; the spec guide gives minimum bathroom sizes |
| `w` currently means opening width, not clear width | Defined as clear width from v0.5.0; the DXF/IFC opening = clear width + frame allowance |
| A value was transcribed wrong into JSON | Each rule record holds clause + page; a test checks every rule ID in the JSON against the rule list |
| plan.json v2 breaks old files or Studio | The v1 reader is kept; round-trip tests in Phase 3 |

## Decisions still needed

1. ~~Phase 4~~ **Decided:** the engine generates detectors, the fire alarm panel, the outdoor AV device, exhaust fans and the fresh-air unit, as well as sockets and switches. Claude may still override any of them in the spec.
2. **Phase 0:** should we work in a fresh clone of your GitHub repo (recommended, since it keeps history) or in the extracted zip?
