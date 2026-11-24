---
name: review-floor-plan
description: This skill should be used when a floor plan needs an independent plans-examiner review after the automatic code check, for example as the review step of generate-floor-plan on a Dubai project, or when the user asks "review this plan like an authority would", "act as plans examiner", "what would the municipality send back?", "check coordination between trades", or "is anything missing from this plan?". It reviews a .plan.json against its rule pack, judges the rules the engine cannot measure, looks for trade-interface errors, omissions and foreign default values, and returns at most 12 corrections that each cite element ids.
---

# Review a floor plan (plans examiner)

The code check (`arplan.js codecheck`) measures what geometry can prove. This review covers what it cannot: coordination between trades, things nobody asked for but the code requires, values copied from another country's code, and the rules marked for the reviewer. It is a separate step with a separate role, because a designer reviewing their own work misses the same things twice.

The engine is `scripts/arplan.js` in the plugin root, two folders above this skill's base directory.

## Workflow

1. **Make the bundle** from the plan (after building with `--pack dubai`):
   ```bash
   node "<plugin root>/scripts/arplan.js" review <plan>.plan.json --pack dubai --out <dir> --name <slug>
   ```
   It writes `<slug>.review.json`: rooms (clear size, area, ceiling, outside walls, windows, doors, fixtures with ids), doors, every fixture with its id, position and properties, the circuit schedule, the code-check fails and gaps, the reviewer rules, the judgement items, the checklist, a table of foreign default values, and the output format.
2. **Review in a separate context.** When a subagent tool is available, give the bundle to a fresh agent with this instruction and nothing else from the design conversation:
   > You are the plans examiner for the authority. Read `<slug>.review.json` and review the plan against the rule pack it names. Work only from the bundle: every number you cite must be in it. Go through `reviewer_rules`, `judgement_items` and every `checklist` topic. Return JSON in `output_format`: at most `max_corrections` corrections, each citing element ids from the bundle and a rule id from the pack or a written reason. Judge every reviewer rule in `rules_judged`. Approve only when nothing must change.

   Without a subagent tool, do the review yourself as a separate step, starting from the bundle file rather than from memory of the design.
3. **What to look for** (the checklist in the bundle, in this order):
   - **Reviewer rules:** decide each one (`pass`, `fail` or `not_checked` with why) in `rules_judged`.
   - **Judgement items:** values the engine measured but cannot judge (for example two exits' remoteness, a panel not in the entrance room, escape only through the garage).
   - **Trade interfaces:** AC / AHU condensate to a floor drain, water heater near its wet rooms, exhaust to an outside wall, AC isolators, DB reach.
   - **Omissions:** anything the code requires that is missing, including items the code check reports as not checkable because the plan has no such layer.
   - **Foreign defaults:** any value matching `foreign_values` (US / IRC sizes) instead of the Dubai value.
   - **Self-review:** read the plan once more as one building.
4. **Validate the corrections** before using them:
   ```bash
   node "<plugin root>/scripts/arplan.js" review-check <slug>.corrections.json --plan <plan>.plan.json --pack dubai
   ```
   It rejects element ids that are not in the plan, rule ids that are not in the pack, missing fixes or reasons, more than 12 corrections, and an "approve" verdict with "must" corrections (exit code 2). Fix the file and validate again; never pass an unvalidated list on.
5. **Hand back.** In generate-floor-plan, the designer applies the `must` corrections to the spec (not the outputs), rebuilds with `--pack dubai`, and reviews once more. Stop after two rounds and list what is still open. Standalone, reply with the verdict, the corrections as a short numbered list (issue, element, rule or reason, fix), the rules judged, and save `<slug>.corrections.json` next to the plan.

## Rules for the reviewer

- Cite only what the bundle shows. If a check needs data the bundle does not have, mark it `not_checked` and say what is missing; do not guess.
- One correction per problem, with the element ids that show it; group repeats ("all six bathrooms") into one correction listing every id.
- A correction is `must` when a rule in the pack is broken or a required item is missing, `should` for coordination or good practice.
- Never copy a value from memory of another code. If a value looks like a foreign default, say which and give the pack's value.
- The engine's generated layers (detectors, fans, sockets, circuits) are proposals: review them like any other design.
