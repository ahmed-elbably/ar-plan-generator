# Plan spec format

The spec is the only thing Claude writes. The engine (`scripts/arplan.js build`) turns it into walls, openings and fixture geometry.

## Coordinates

- Metres. x grows to the east (right), y grows to the **south** (down). y = 0 is the north edge of the plan.
- Every room is an axis-aligned rectangle `{x, y, w, d}`: x, y = its north-west corner, w = east-west size, d = north-south size.
- Use multiples of 0.05 (the engine snaps to 0.05 anyway).
- Feet projects: still write the spec in metres; pass `--units ft` so labels and the report show feet and square feet.

## JSON shape

```json
{
  "project": "Short name",
  "notes": "One or two sentences on the layout idea.",
  "rooms":    [{"name": "Majlis", "type": "living", "x": 0, "y": 0, "w": 6.5, "d": 5.5}],
  "doors":    [{"from": "OUTSIDE", "to": "Entrance hall", "w": 1.2, "style": "swing", "side": "N", "at": 0.5}],
  "windows":  [{"room": "Majlis", "side": "N", "w": 1.5, "count": 2}],
  "fixtures": [{"kind": "wc", "room": "Guest WC", "side": "N", "at": 0.3}]
}
```

### rooms
- `type` is one of: `bedroom, bathroom, kitchen, living, dining, laundry, garage, hall, closet, mech, office, outdoor, other`. Common words are mapped automatically (majlis → living, corridor → hall, store/pantry → closet, balcony → outdoor, maid → bedroom), but prefer the exact types.
- `outdoor` rooms (terraces, balconies) get no walls. Everything else gets walls on all four edges; edges on the outside of the building become exterior walls (0.25 m), the rest interior (0.12 m).
- Names must be unique. A room named with "WC", "toilet" or "powder" counts as a WC (needs wc + basin only).

### doors
- `from`: room name or `"OUTSIDE"`. `to`: room name. The door swings into `to`.
- Two rooms joined by a door must share an edge (same x or same y line) at least `w + 0.15` long.
- `style`: `swing` (default), `sliding`, `opening` (open-plan link, no leaf), `garage` (vehicle door, w 2.5–5.5).
- `side` (N/S/E/W) only for doors to `OUTSIDE`; `at` (0–1) is the position along the shared wall or that side. Omit `at` to centre it.
- `w` is the **clear** width. Typical widths: 0.95 rooms, 0.8 bathrooms and WCs, 1.0–1.4 main entrance, 1.2–3.0 open-plan openings. Omit `w` to get these defaults.
- Dubai (DBC 2021 Table K.4): every door ≥ 0.915 m clear, bathroom and WC doors ≥ 0.71 m. Do not write 0.8 or 0.9 for room doors on Dubai projects.

### windows
- `room`, `side`, `w`, optional `count` (spread evenly) and `at` (0–1, for a single window).
- Only on sides that face outside. If the side is internal, the engine moves the window to an outside side of the same room and notes it.

### fixtures
- `kind`: `wc, basin, sink` (kitchen sink), `shower, tub, washer, dryer, dw` (dishwasher), `range, fridge, wh` (water heater), `ahu` (indoor AC / furnace unit), `acu` (outdoor AC unit, drawn outside the named wall), `panel` (electrical panel / DB), `fd` (floor drain).
- `side` = the wall the fixture stands against; `at` = 0–1 along that wall. Give fixtures on the same wall different `at` values. The engine slides a fixture along its wall, or moves it to another wall of the room, to clear doorways, door swings and other fixtures, and reports any move.
- Every bathroom: wc + basin + shower or tub. WC: wc + basin. Kitchen: sink, range, fridge and usually dw. Laundry: washer (+ dryer).
- With `--pack dubai` the engine keeps the DBC K.5.7.2 clearances while placing WCs and basins: centre ≥ 400 mm from side walls and other fixtures, ≥ 750 mm between WC / basin centres, ≥ 750 mm clear in front to a wall or door leaf (≥ 600 mm to an opposite fixture). It slides or moves them to another wall to achieve this and notes when a room is too small. Plan wet rooms with this in mind: a WC + basin + shower bathroom needs about 2.0 × 2.5 m on centrelines, with the door away from the WC's front.
- With `--pack dubai` the engine also adds a floor drain (`fd`) to every bathroom, WC, kitchen and laundry that has none (DBC K.10.3.2.3). You may still place them yourself.
- Exactly one `wh`, one `ahu` and one `panel` per dwelling, in a laundry, garage, mech or store room. At least one `acu` against an outside wall.

### Design data for the code check (optional, v0.5)

Everything below is optional. A rule whose data is missing is reported NOT CHECKABLE, never passed, so write what the design actually decides.

**Project level** (top of the spec):
```json
"building_type": "villa", "storeys": 1, "building_h": 4.5, "ceiling_h": 3.0, "glass": 0.75,
"gas": "electric", "hassantuk": true, "sprinklered": false,
"plot": {"x": -3.5, "y": -4, "w": 34.5, "d": 24, "road": ["N"], "sikka": [], "setbacks": {"road": 3}},
"window_defaults": {"h": 1.5, "sill": 0.9, "op": "casement"}
```
- `plot` is in plan coordinates (same axes as rooms). `road` / `sikka` list the plot sides on a road or sikka; other sides are neighbours. Give `setbacks` from the DCR / affection plan; missing ones fall back to DBC Table K.1 and the report says so.
- `ceiling_h` is the designed clear height for every room (override per room); `glass` is the net glazing share of window / glazed-door openings (frames excluded, typically 0.7–0.8).
- `window_defaults` applies to every window unless the window says otherwise.
- `building_type`: `villa` or `townhouse` (then add `party_wall_h` in hours). `gas`: `electric`, `lpg` (add an `lpg` fixture outdoors) or `piped`.

**Rooms:** `"ceiling_h": 2.6` (e.g. bathrooms with a false ceiling), and for kitchens `"counters": [{"side": "N", "from": 0, "to": 1, "depth": 0.6}]` (`from` / `to` along that wall, 0–1; depth in m).

**Windows:** `sill`, `h` (m), `op` (`fixed`, `sliding`, `casement`, `hung`, `tilt`), `glass`; `operator_h` only for windows with mechanical opening gear. Escape windows need `op` and `h`.
**Doors:** `"glazed": true` (with `h`) for glazed doors that count as daylight, e.g. a sliding door to a terrace.

**More fixture kinds** (same `room`, `side`, `at` as other fixtures):
- ceiling-mounted, placed inside the room (`pos: [fx, fy]`, fractions of the room, default near the top-centre): `smoke`, `smoke_sounder` (bedrooms), `heat` (kitchens), `exhaust` (with `lps` and `mode`: `demand` / `continuous`)
- wall-mounted above floor fixtures: `facp` (fire alarm panel, near the front door), `extinguisher` (kitchen, by the exit door), `hood` (over the range, with `lps`, `mode`)
- outdoors, outside the named wall: `av_outdoor` (alarm sounder / strobe on the façade facing the road), `lpg`
- on the floor: `fresh_air` (with `lps`), `water_tank` (with `litres`, inside a conditioned room), `pump`
- `panel` may carry `top_h` (height of the DB top, m).
Ceiling and wall-mounted items never clash with floor fixtures or doorways.

### What the engine generates with `--pack dubai` (v0.5)

You do not need to place these; write them only to override the engine's choice.
- **Fire and ventilation devices:** smoke detectors (sounder type in bedrooms) in bedrooms, living / dining rooms and halls; a heat detector in each kitchen (an open kitchen's living-room detector goes ≥ 3 m from it); the fire alarm panel by the front door; the outdoor AV device on the road façade (needs `plot.road`); a kitchen extinguisher by the door; an exhaust fan in each bathroom / WC (25 L/s) and a range hood over the range (50 L/s); one fresh-air unit sized by ASHRAE 62.2 (mech room, else laundry, garage or store).
- **Electrical layer:** twin 13 A sockets at 450 mm (counts per room are layout defaults in `rules/dubai.json` → `generator`, not code), kitchen counter sockets 150 mm above the worktop and 300 mm clear of the sink, never over the hob; fridge and dishwasher sockets; shaver outlets beside basins (no 13 A sockets in bathrooms); DP switches beside the water heater, washer, AHU, AC condensers (IP55 isolator outside), fresh-air unit and pump; a cooker control unit beside the range; IP55 sockets facing terraces; and a circuit schedule (radials of ≤ 5 points with a twin counting 2, every appliance on its own circuit, RCD ratings from DBC Table K.46). The schedule is in `<slug>.report.md` and `plan.json` (`circuits`).
- Anything you place in a room is kept and not duplicated. Turn a generator off with `"generate": {"devices": false}` or `{"electrical": false}` (for example when the MEP consultant supplies their own layout).

## Layout rules

- Rooms never overlap. Pack them into a compact footprint with no leftover gaps inside the building.
- Corridors are rooms too (`type: "hall"`), at least 1.2 m wide.
- Every room is reachable through doors from the main entrance; include the entrance door from `OUTSIDE`.
- Bedrooms, living rooms and the kitchen sit on the outside edge so they get windows.
- Keep wet rooms (bathrooms, WCs, kitchen, laundry) close together, ideally back to back, so plumbing stays short.
- List rooms from north-west to south-east.

## Self-check before building

1. No two rooms overlap (check every pair whose x and y ranges intersect).
2. Every door's two rooms share an edge long enough for the door; every door to OUTSIDE names a side that is on the building's outer edge.
3. Every room except outdoor ones has at least one door.
4. Every bedroom has at least one side on the outer edge, and a window on it.
5. Bathrooms, WCs, kitchen and laundry have their required fixtures; one wh, one ahu, one panel, at least one acu exist.
6. Room areas add up to the target area within about 10%.
7. Dubai projects: room sizes meet DBC Table K.2 measured **inside the walls** (centreline size minus about 0.06 m per interior wall and 0.125 m per exterior wall): living rooms and bedrooms ≥ 10.5 m² and ≥ 3.0 m each way, housekeeper's room ≥ 5.5 m² and ≥ 2.1 m, enclosed kitchen ≥ 5.4 m² and ≥ 1.8 m; corridors ≥ 1.0 m clear; enclosed garage ≥ 3.6 × 6.0 m clear (double ≥ 6.0 × 6.0 m), so allow about 3.8 × 6.2 m on centrelines.
