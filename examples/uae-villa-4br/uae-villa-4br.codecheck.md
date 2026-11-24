# Code check — Dubai private villas and townhouses

UAE villa 4BR · Level 1 · GA 370.5 m²

| FAIL | ADVISE | NOT CHECKABLE | PASS | N/A | OUT OF SCOPE |
|---|---|---|---|---|---|
| 0 | 0 | 9 | 46 | 6 | 3 |

**Rule packs:** Dubai Building Code 2021, Part K Villas (2021) · UAE Fire & Life Safety Code of Practice (CDGH-OP-25) (September 2018) · DEWA Regulations for Electrical Installations (2017) · ASHRAE 62.2 Ventilation and IAQ in Residential Buildings (2019)

**Assumptions:**
- Gas: all-electric unless the plan declares gas (LPG rules then apply).
- Plot: when the plan has no plot or setbacks, DBC Table K.1 defaults apply (villa 3 m road / neighbour / sikka; townhouse 3 / 0 / 3 m).
- Door widths in the plan are clear widths.
- Room sizes are measured clear, inside wall faces.

## Not checkable (data missing)

- **K-16 Distance between buildings on a plot** (K.5.2.4, p.698): needs plot with all buildings.
- **K-17 Annexes** (K.5.2.3, p.698): needs plot with annex buildings.
- **P-03 Cold water storage tank** (K.10.2.5, p.825): needs water services layer (tank, pump).
- **E-02 DB mounting height and access** (DBC K.9.1.17.2, Figure K.79, p.795): needs DB mounting height to the top (top_h).

## Left to the reviewer

- **K-24 Screening of outdoor equipment** (K.5.13, p.726): Outdoor mechanical equipment should be concealed from public view by walls, screens, fences, parapets or landscape.
- **P-02 Floor drain trap seal** (K.10.3.2.3, p.830): Each floor drain receives a fitting's waste or AC condensate (or has a trap primer); >= 75 mm water seal; bidets connect to the stack, not a floor drain; floor drains not chained.
- **F-12 Door hardware** (FLSC Ch.3 Table 3.27 item 3, p.323): Bathroom doors openable from outside in an emergency when locked; closet latches openable from inside; no locking that impedes egress while occupied.
- **V-06 Bathroom fan interlock** (DBC K.10.1.10.2, p.823): Bathroom / toilet extract fans controlled through the light switch, timers or sensors.
- **V-07 Kitchen range hood ducting** (DBC K.10.1.8.4, p.820): Range hoods discharge outdoors through smooth, airtight metal ducts with a backdraft damper, unless ductless with other mechanical ventilation provided.

## Passed

- **K-01 Living space minimum size** (K.5.3.1, Table K.2, p.706): 6 checked
- **K-02 Housekeeper's / guard room minimum size** (K.5.3.1, Table K.2, p.706): 1 checked
- **K-03 Enclosed kitchen minimum size** (K.5.3.1, Table K.2, p.706): 1 checked
- **K-04 Kitchen manoeuvring space** (K.5.3.1, Figure K.18, p.706): 2 checked
- **K-05 Minimum clear heights** (K.5.3.2, Table K.3, p.707): 24 checked
- **K-06 Door clear width** (K.5.4.1, Table K.4, p.708): 26 checked
- **K-07 Window glazing area (bedrooms, living rooms, kitchens)** (K.5.4.2.1, p.708): 7 checked
- **K-08 Housekeeper's room glazing** (K.5.4.2.1 e), p.709): 1 checked
- **K-09 Window sill height** (K.5.4.2.1 b), p.709): 17 checked
- **K-11 Room depth for natural light** (K.5.4.2.2, Figure K.22, p.709): 8 checked
- **K-12 Access to views** (K.5.4.2.3, p.709): 7 checked
- **K-13 Hallway and corridor width** (K.5.5.1, p.710): 2 checked
- **K-14 Maximum building height** (K.5.2.2, p.697): 1 checked
- **K-15 Building setbacks** (K.5.2.4, Table K.1, p.698): 4 checked — Setbacks for road, neighbour taken from DBC Table K.1 (villa) because the plot gives none (pack assumption).
- **K-19 Parking** (K.5.6.4, Table K.6, p.720): 1 checked
- **K-20 Garage minimum dimensions** (K.5.6.4, Table K.7, p.721): 1 checked
- **K-21 Sanitary facilities** (K.5.7.1, p.721): 1 checked
- **K-22 WC and basin side clearances** (K.5.7.2 a), Figure K.40, p.722): 13 checked
- **K-23 WC and basin front clearance** (K.5.7.2 b), Figure K.40, p.722): 13 checked
- **P-01 Floor drains in wet areas** (K.10.3.2.3, p.830): 8 checked
- **P-04 Hot water supply** (K.10.2.9, p.826): 1 checked — Checks that a water heater exists; temperatures and return loop are design notes for the reviewer.
- **F-01 Smoke detection and alarm system** (DBC K.10.5.2; FLSC Ch.8 Table 8.13 item 26, p.841): 1 checked
- **F-02 Detectors in bedrooms, living rooms and corridors** (FLSC Ch.8 Table 8.14 items 26, 27, 30, p.511): 9 checked
- **F-03 Closed kitchen detector** (FLSC Ch.8 Table 8.14 item 29, p.511): 1 checked
- **F-05 Fire alarm panel location** (DBC K.10.5.2, p.841): 1 checked
- **F-06 Outdoor audio-visual notification** (DBC K.10.5.2; FLSC Table 8.13 item 26 iv, p.841): 1 checked
- **F-07 Hassantuk connection** (DBC K.10.5.4, p.841): 1 checked
- **F-08 Sprinklers and hose reels threshold** (DBC K.10.5.3; FLSC Ch.9 Table 9.23, p.841): 1 checked — Sprinklers and hose reels not required.
- **F-09 Primary means of escape** (FLSC Ch.3 Table 3.27 item 2 i, p.323): 7 checked
- **F-09b Secondary means of escape** (FLSC Ch.3 Table 3.27 item 2 i, iv, p.323): 7 checked; note: Majlis window opening size; frame not deducted; note: Maid room window opening size; frame not deducted; note: Bedroom 4 window opening size; frame not deducted; note: Bedroom 3 window opening size; frame not deducted; note: Bedroom 2 window opening size; frame not deducted; note: Master bedroom window opening size; frame not deducted
- **F-10 Escape window size** (FLSC Ch.3 Table 3.27 item 2 iv d, p.323): 7 checked; note: Majlis window opening size; frame not deducted; note: Maid room window opening size; frame not deducted; note: Family living & dining window opening size; frame not deducted; note: Bedroom 4 window opening size; frame not deducted; note: Bedroom 3 window opening size; frame not deducted; note: Bedroom 2 window opening size; frame not deducted; note: Master bedroom window opening size; frame not deducted
- **F-13 Hallway width (FLSC)** (FLSC Ch.3 Table 3.27 item 4, p.323): 2 checked
- **F-14 Kitchen fire extinguisher** (FLSC Ch.4 Table 4.3, p.377 · **unverified**): 1 checked
- **E-01 Distribution board location** (DBC K.9.1.17.2, p.795): 1 checked
- **E-03 Socket outlets** (DBC K.9.1.13.2, p.779): 7 checked
- **E-04 Accessory mounting heights** (DBC K.9.1.17.4, Figure K.80, p.796): 1 checked
- **E-05 Kitchen socket positions** (DBC K.9.1.13.5, Figure K.72, p.781): 1 checked
- **E-06 Sockets per circuit** (DEWA 2017 4.7.1, p.46): 23 checked
- **E-07 Cooker control unit** (DBC K.9.1.13.4, Figure K.71, p.780): 1 checked
- **E-08 Water heater and washing machine control** (DBC K.9.1.13.6, p.782): 2 checked
- **E-09 Air-conditioning unit circuits** (DBC K.9.1.13.7, p.782): 3 checked
- **E-10 Earth leakage ratings** (DBC K.9.1.18.4, Table K.46, p.800): 30 checked
- **V-01 Whole-dwelling ventilation rate** (ASHRAE 62.2-2019 4.1.1, Eq. 4-1b): 1 checked
- **V-02 Local exhaust in kitchens and bathrooms** (ASHRAE 62.2-2019 5.1): 7 checked
- **V-03 Demand-controlled exhaust rates** (ASHRAE 62.2-2019 Table 5-1): 7 checked
- **V-05 Natural ventilation not relied upon** (DBC K.10.1.7, p.819): 1 checked

## Not applicable

- **K-10 Window operator height**: No windows with mechanical opening means declared (give operator_h for those that have them).
- **K-25 Townhouse party wall**: Detached villa: no party wall.
- **F-04 Open kitchen detector**: No open kitchen.
- **F-11 Two exits for large floors**: Floor area is not above 400 m².
- **F-15 LPG cylinders**: Gas: electric.
- **V-04 Continuous exhaust rates**: No continuous exhaust units.

## Out of scope

- **K-18 Guardrails**: Single-level plans have no raised floors, balconies or roofs.
- **P-05 Hot water outlet temperatures**: Specification item, not shown on a plan.
- **E-11 Lighting circuit loading**: Load calculations are planned for a later version.
