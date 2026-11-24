# Code-check layer — rule list (draft 3: Dubai, verified)

**Target:** Dubai private villas and townhouses, one level per plan for now.
**Authority packs and editions:**
| Pack | Document | File in `docs/sources/` |
|---|---|---|
| `dm-dbc-2021` | Dubai Building Code 2021, **Part K Villas** (843-page edition) | `Dubai Building Code_English_2021 Edition_compressed.pdf` |
| `cd-flsc-2018` | UAE Fire & Life Safety Code of Practice, CDGH-OP-25, Sept 2018 (1,348 pages) | `UAE Fire and Life Safety Code of Practice.pdf` |
| `dewa-2017` | DEWA Regulations for Electrical Installations 2017 | `dewa-regulations-for-electrical-installations-2017-edition.pdf` |
| `ashrae-62.2-2019` | ASHRAE 62.2-2019 (DBC K.10.1.6 refers to it for ventilation rates) | `D:\03 MECH CODE\Ashrae\ASHRAE Standards\…62_2_2019.pdf` |

**Key finding:** DBC **Part K is self-contained for villas**. It covers architecture (K.5), electrical (K.9.1, which absorbs the DEWA design rules), HVAC and ventilation (K.10.1), water (K.10.2), drainage (K.10.3) and fire systems (K.10.5), and it cross-refers to UAE FLSC for egress and detection. So Part K is the primary source; DEWA 2017 is the backup for the same electrical rules.

**Status legend:** ✅ **verified** (clause and PDF page read from the source text) · 🟡 **lead** (seen, wording needs a second look in the PDF) · ⬜ **TBD**.
Page numbers are **PDF pages** of the files above.

**Corrections from draft 2** (values from web searches that the source proved wrong or incomplete):
- Housekeeper room: **5.5 m²**, not 4.5 m² (Table K.2).
- Ceiling 2.7 m applies to living and bedroom spaces only; all other spaces need **2.3 m**.
- Smoke detection is **mandatory in all villas**, linked to **Hassantuk** (DBC K.10.5.2 / K.10.5.4).

---

## 1. Rules

Engine status: **Now** = checkable with today's spec · **Spec+** = needs the spec expansion in §2 · **Agent** = reviewer agent · **Out** = out of scope v1.

### K — Architecture (DBC Part K)
| ID | Clause (page) | Requirement | Value | Engine |
|---|---|---|---|---|
| K-01 | K.5.3.1, Table K.2 (p.706) | Living space (bedroom, living room, etc.): min area / min length and width | **10.5 m² / 3.0 m** ✅ | Now |
| K-02 | Table K.2 (p.706) | Housekeeper's / guard room, single, without toilet | **5.5 m² / 2.1 m** ✅ | Now |
| K-03 | Table K.2 (p.706) | Enclosed kitchen | **5.4 m² / 1.8 m** ✅ | Now |
| K-04 | K.5.3.1, Fig K.18 (p.706) | Manoeuvring space between kitchen counters / in front of a single counter | **≥ 1.2 m** ✅ | Now (v0.5 design data) |
| K-05 | K.5.3.2, Table K.3 (p.707) | Clear height: living & bedroom / any other space / staircase / non-habitable room under stair | **2.7 / 2.3 / 2.3 / 2.03 m** ✅ | Now (v0.5 design data) |
| K-06 | K.5.4.1, Table K.4 (p.708) | Door clear width: entry doors, general / bathrooms & toilets | **915 / 710 mm** ✅ | Now |
| K-07 | K.5.4.2.1 (p.708) | Bedrooms, living rooms and kitchens: net glazing ≥ % of floor area (or daylight modelling, ≥ 150 lux) | **10 %** ✅ | Now (v0.5 design data) |
| K-08 | K.5.4.2.1 e) (p.709) | Housekeeper's room net glazing | **≥ 8 %** ✅ | Now (v0.5 design data) |
| K-09 | K.5.4.2.1 b) (p.709) | Window sill height above interior FFL | **≥ 900 mm** ✅ | Now (v0.5 design data) |
| K-10 | K.5.4.2.1 a) (p.709) | Windows with mechanical opening means: operator height | **900–1,500 mm** ✅ | Now (v0.5 design data) |
| K-11 | K.5.4.2.2 (p.709) | Room depth should not exceed 3 × width of the window wall, or add a second window | **d ≤ 3w** ✅ | Now |
| K-12 | K.5.4.2.3 (p.709) | Direct view to outdoors from every habitable space | qualitative ✅ | Now (has ext. window) |
| K-13 | K.5.5.1 (p.710) | Hallway / corridor: clear width, clear headroom | **≥ 1.0 m, ≥ 2.3 m** ✅ | Now (width) |
| K-14 | K.5.2.2 (p.697) | Max total building height | **16 m** ✅ | Now (v0.5 design data) |
| K-15 | K.5.2.4, Table K.1 (p.698) | Setbacks when the DCR / affection plan is silent: villa road / neighbour / sikka; townhouse | **3 / 3 / 3 m; 3 / 0 / 3 m** ✅ | Now (v0.5 design data) |
| K-16 | K.5.2.4 (p.698) | Distance between buildings on the same plot | **≥ 1.5 m** ✅ | Spec+ |
| K-17 | K.5.2.3 (p.698) | Annex: ≥ 1.5 m from villa; area ≤ 60 % of main GA; height ≤ 5.5 m | ✅ | Spec+ |
| K-18 | K.5.2.5.2 (p.701) | Guardrail where floor is > 760 mm above FFL: height ≥ 1,200 mm, no 100 mm sphere | ✅ | Out (single level) |
| K-19 | K.5.6.4, Table K.6 (p.720) | Parking: min bays per villa / townhouse; slope ≤ 4 % | **1 bay; 4 %** ✅ | Now (garage present) |
| K-20 | Table K.7 (p.721) | Garage min W × L: single open / single enclosed / double enclosed | **3.0×5.5 / 3.6×6.0 / 6.0×6.0 m** ✅ | Now |
| K-21 | K.5.7.1 (p.721) | Every villa has at least one WC, basin and bath or shower | ✅ | Now |
| K-22 | K.5.7.2, Fig K.40 (p.722) | WC / basin / tap centre: ≥ 400 mm to side wall or obstruction; ≥ 750 mm to the centre of an adjacent fixture | ✅ | Now |
| K-23 | K.5.7.2 b) (p.722) | Clear space in front of WC or basin: to wall or door leaf / to opposite fixture | **750 / 600 mm** ✅ | Now |
| K-24 | K.5.13 (p.~741) | Outdoor mechanical equipment concealed from public view | qualitative ✅ | Agent |
| K-25 | K.5.11 (p.~741) | Townhouses: 2 h fire-rated party wall (1 h if sprinklered), foundation to roof | ✅ | Now (v0.5 design data) |

### F — Fire & life safety (UAE FLSC 2018, through DBC K.10.5)
| ID | Clause (page) | Requirement | Value | Engine |
|---|---|---|---|---|
| F-01 | DBC K.10.5.2; FLSC Table 8.13 item 26 (p.~508) | Smoke detection and alarm system in **every** villa (wired per Ch.8 §4.3, or wireless per §4.11) | ✅ | Now (v0.5 design data) |
| F-02 | FLSC Table 8.14 items 26, 27, 30 (p.511) | Bedroom: **sounder-based** smoke detector; living room: smoke detector; corridor: smoke detector | ✅ | Now (v0.5 design data) |
| F-03 | FLSC Table 8.14 item 29 (p.511) | Closed kitchen: listed kitchen detector **or heat detector** | ✅ | Now (v0.5 design data) |
| F-04 | FLSC Table 8.14 item 28 (p.511) | Open kitchen: listed kitchen detector, or heat detector + smoke detector **3 m from the counter** in the living room, or kitchen multisensor | ✅ | Now (v0.5 design data) |
| F-05 | DBC K.10.5.2 (p.~840) | Fire alarm / monitoring panel **near the front door** | ✅ | Now (v0.5 design data) |
| F-06 | DBC K.10.5.2; FLSC Table 8.13 item 26 iv | Outdoor audio-visual notification device, **visible from the approach road** | ✅ | Now (v0.5 design data) |
| F-07 | DBC K.10.5.4 | Fire alarm connected to DCD through **Hassantuk for Homes** | ✅ | Now (v0.5 design data) |
| F-08 | DBC K.10.5.3; FLSC Table 9.23 | Sprinklers in every room + hose reels only when ground-floor GA **> 1,500 m²** (also basements > 1,500 m²) | ✅ | Now (area) |
| F-09 | FLSC Table 3.27 item 2 i (p.323) | Every sleeping room and living area: a primary means of escape (door / stair / ramp route to outside) | ✅ | Now |
| F-09b | FLSC Table 3.27 item 2 i, iv (p.323) | ... and a secondary means of escape (not needed if sprinklered) | ✅ | Now (v0.5 design data) |
| F-10 | FLSC Table 3.27 item 2 iv d (p.323) | Escape window as secondary means: ≥ 510 mm wide, ≥ 610 mm high, ≥ 0.53 m² clear, bottom ≤ 6,100 mm above finished ground | ✅ | Now (v0.5 design data) |
| F-11 | FLSC Table 3.27 item 2 iii (p.323) | Any floor > 400 m²: **two remote primary exits** | ✅ | Now |
| F-12 | FLSC Table 3.27 item 3 (p.323) | Bathroom doors openable from outside when locked; closet latches openable from inside | ✅ | Agent (schedule note) |
| F-13 | FLSC Table 3.27 item 4 (p.323) | Hallway ≥ 915 mm, headroom ≥ 2,030 mm (DBC K-13's 1.0 m is stricter and governs) | ✅ | Now |
| F-14 | FLSC Ch.4 Table 4.3 row 6 (p.377) | Home kitchen: one multipurpose dry-powder extinguisher (3A 20-B C, 2.5 kg) inside the kitchen next to the exit door | ✅ | Now (v0.5 design data) |
| F-15 | DBC K.9.4 (p.803) | LPG cylinders not indoors (unless DCD agrees; then FLSC Ch.11 Table 11.2) | ✅ | Now (v0.5 design data) |

### E — Electrical (DBC K.9.1, matching DEWA 2017 §4.6–4.7)
| ID | Clause (page) | Requirement | Value | Engine |
|---|---|---|---|---|
| E-01 | K.9.1.17.2 (p.~796) | DB **not** in: bathrooms/toilets, wet locations, bedrooms, kitchens, above sinks, store rooms, hot rooms, hazardous locations, under stairs | ✅ | Now |
| E-02 | K.9.1.17.2 (p.~796) | DB top ≤ 2 m above FFL; accessible at all times | ✅ | Now (v0.5 design data) |
| E-03 | K.9.1.13.2 (p.779–780) | Sockets BS 1363 13 A, shuttered, switched; IP55 outdoors | ✅ | Now (engine-generated layer) |
| E-04 | K.9.1.17.4 (p.796) | Mounting: switches, AC/WH DP switches 1.25 m; general sockets 450 mm; kitchen sockets 150 mm above the worktop | ✅ | Now (engine-generated layer) |
| E-05 | K.9.1.13.5, Fig K.72 (p.781) | Kitchen: no socket within **300 mm of the sink edge**; no socket or accessory **above hobs** | ✅ | Now (engine-generated layer) |
| E-06 | DEWA 4.7.1 (p.46) / K.9.1.15.1 | Radial circuit ≤ **5** × 13 A sockets on 20 A; ring ≤ **10** sockets on 30 A (rooms other than kitchen) | ✅ (DEWA) | Now (engine-generated layer) |
| E-07 | K.9.1.13.4 (p.780–781) | Cooker control switch (BS 4177) **within 2 m** of the appliance, separate circuit, **100 mA** ELCB | ✅ | Now (engine-generated layer) |
| E-08 | K.9.1.13.6 (p.782) | Water heater / washing machine: own circuit, DP switch + flex outlet; WH in a bathroom has its switch **immediately outside** the room; heater circuits **30 mA** | ✅ | Now (engine-generated layer) |
| E-09 | K.9.1.13.7 (p.782) | Each AC unit: own circuit, DP switch adjacent; min **20 A, 4 mm²** | ✅ | Now (engine-generated layer) |
| E-10 | K.9.1.18.4, Table K.46 (p.800) | RCD ratings: sockets, WH, DW, fridge, washer, pumps **30 mA**; split AC, AHU, cooker **100 mA**; lighting 30/100 mA | ✅ | Now (engine-generated layer) |
| E-11 | K.9.1.15.1 (p.~789) | Lighting circuits ≤ 2,000 W, 2.5 mm², ≤ 16 A; 100 W per point if fittings unknown | ✅ | Out (load calc v2) |

### P — Water & drainage (DBC K.10.2 / K.10.3)
| ID | Clause (page) | Requirement | Value | Engine |
|---|---|---|---|---|
| P-01 | K.10.3.2.3 (p.830) | Floor drain in **every** area with wet fittings or appliances (kitchens, toilets, showers, ablution); the engine also counts rooms with a water heater or AHU (condensate), added after the round-1 review | ✅ | Now |
| P-02 | K.10.3.2.3 (p.830) | Every floor drain fed by a fitting or AC condensate (or trap primer); ≥ 75 mm seal; bidet to stack, not FD | ✅ | Agent |
| P-03 | K.10.2.5 (p.825–826) | Cold water tank sized for ≥ 24 h demand (villa typically **250–350 l/day**); GRP, in a **conditioned space**, not exposed outdoors | ✅ | Now (v0.5 design data) |
| P-04 | K.10.2.9 (p.826–827) | Hot water to basins, sinks, showers, baths; storage ≥ 60 °C; 50 °C at outlet within 1 min; pumped return | ✅ | Now (supply) / Agent |
| P-05 | Table K.59 (p.827) | TMV max outlet temp: shower 41 °C, basin 38–41 °C, bath 44 °C | ✅ | Out (spec note) |

### V — Ventilation (DBC K.10.1.6 → ASHRAE 62.2-2019)
| ID | Clause | Requirement | Value | Engine |
|---|---|---|---|---|
| V-01 | 62.2 §4.1.1 Eq. 4-1b | Whole-dwelling mechanical ventilation: Qtot = 0.15 × A_floor + 3.5 × (N_bedrooms + 1) L/s | ✅ | Now (v0.5 design data) |
| V-02 | 62.2 §5.1 | Local exhaust in **every kitchen and bathroom** | ✅ | Now (v0.5 design data) |
| V-03 | 62.2 Table 5-1 | Demand-controlled: bathroom **25 L/s**; kitchen vented hood **50 L/s** (other kitchen fans 150 L/s or 5 ach) | ✅ | Now (v0.5 design data) |
| V-04 | 62.2 Table 5-2 | Continuous: bathroom **10 L/s**; enclosed kitchen **5 ach** | ✅ | Now (v0.5 design data) |
| V-05 | DBC K.10.1.7 | Natural ventilation allowed but **may not be relied on** (so mechanical is always needed) | ✅ | Now (v0.5 design data) |
| V-06 | DBC K.10.1.10.2 | Bathroom fans interlocked with light switch / timer / sensor | ✅ | Agent |
| V-07 | DBC K.10.1.8.4 (p.820) | Ducted range hood to outdoors (metal duct, backdraft damper), unless ductless with other mech. ventilation | ✅ | Agent |

**Out of scope v1:** structure (Part F), envelope / Al Sa'fat energy (Part E), accessibility (Part C), stairs and lifts (single level), pools (K.5.8.2), waste storage (K.5.9), telecom (K.9.7), solar hot water (K.10.2.10).

---

## 2. Spec expansion (driven by the verified rules)

| New field | Where | Rules |
|---|---|---|
| `ceiling_h` (level default, room override) | level / room | K-05 |
| `sill`, `h`, `operable`, `net_glazing` | windows | K-07…K-10, F-10 |
| `plot` {w, d, road side, sikka side}, `type` villa/townhouse | project | K-14…K-17, K-25 |
| `counters` (segments) | kitchen rooms | K-04, E-04, E-05 |
| New fixtures: `smoke`, `smoke_sounder`, `heat`, `facp`, `av_outdoor` | fixtures | F-01…F-07 |
| New fixtures: `exhaust` (L/s, continuous/demand), `fresh_air` (L/s), `hood` | fixtures | V-01…V-07 |
| New fixtures: `water_tank`, `pump`, `extinguisher` | fixtures | P-03, F-14 |
| `gas`: none / LPG | project | F-15 |
| Sockets, switches, DP switches: **generated by the engine** from E-03…E-09 | generated | E-03…E-10 |

---

## 3. What the current engine already gets wrong (to fix when we build)

Read against the verified values, without running the checker yet:
1. **Room doors:** the spec guide says 0.9 m for rooms; DBC Table K.4 needs **915 mm clear** for general entry doors. Bathrooms at 0.8 m pass (≥ 710).
2. **Fixture clearances:** the engine uses its own fixture sizes; it must enforce **400 mm** to a side wall and **750 mm** in front (K-22, K-23).
3. **Floor drains:** UAE convention adds `fd`, but nothing enforces it in kitchens and laundries (P-01).
4. **No detectors, exhaust or fresh air** are modelled, so F-01…F-07 and V-01…V-04 would all be "not checkable" today.

---

## 4. Reviewer-agent checklist (layer C)

1. **Trade interfaces:** AC condensate → floor drain (P-02), water heater switch outside the bathroom (E-08), cooker switch within 2 m (E-07), DB location vs room types (E-01).
2. **Omissions:** detectors, Hassantuk, outdoor AV device, water tank, exhaust per wet room, fresh-air system.
3. **Foreign defaults:** flag any value that matches IRC/NEC or another code instead of Dubai (e.g. 32 in doors, 15 in WC clearance, 70 sf rooms).
4. **Table values** only from the rule packs; never from model memory.
5. **Separate self-review pass**, citing element IDs.
6. **Report which packs and editions were loaded.**

---

## 5. Open questions (still yours to decide)

1. ~~Sockets~~ **Decided:** the engine generates sockets, switches and DP switches from E-03…E-10; Claude never places them.
2. ~~Gas~~ **Decided:** all-electric by default. LPG only when the brief asks for it; then F-15 applies and the spec needs an outdoor cylinder location.
3. ~~Plot~~ **Decided:** use plot size and setbacks from the brief or affection plan when given; otherwise assume DBC Table K.1 (villa 3 m road / neighbour / sikka; townhouse 3 / 0 / 3 m) and state the assumption in the report.

All design questions are settled. Next step: the build plan (rule-pack format, spec changes, engine `codecheck` command, test plans with planted violations).
