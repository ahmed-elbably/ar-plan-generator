/*
 * AR Plan review: the bundle a separate reviewer ("plans examiner") reads, and the validator for its corrections.
 *
 *   bundle(doc, G, {pack}) → a compact, factual description of the plan plus the code-check results, the reviewer
 *                            checklist and the rules the engine cannot measure. The reviewer works only from this.
 *   validate(corr, doc, {pack}) → {ok, errors, warnings}: every correction must cite element ids that exist in the
 *                            plan, and a rule id from the pack or a written reason; at most max_corrections.
 */
"use strict";
const path = require("path");
const cc = require("./codecheck");

const r2 = v => Math.round(v * 100) / 100;

function bundle(doc, G, {pack = "dubai", rulesDir} = {}) {
  rulesDir = rulesDir || path.join(__dirname, "..", "rules");
  const {manifest, rules} = cc.loadPack(pack, rulesDir);
  const rep = cc.run(doc, G, {pack, rulesDir});
  const M = cc.buildModel(doc, G);
  const rv = manifest.reviewer || {};

  const rooms = M.rooms.map(m => ({
    id: m.id, name: m.name, type: m.type, staff: m.staff || undefined,
    clear: `${r2(m.cw)} x ${r2(m.cd)} m`, area_m2: r2(m.area), ceiling_m: m.r.ceil_set ? m.r.ceil : undefined,
    outside_walls: Object.keys(m.ext).filter(s => m.ext[s] > 0.5),
    windows: M.windowsOf(m).length,
    doors_to: [...new Set(M.doors.filter(d => d.a === m || d.b === m).map(d => { const o = d.a === m ? d.b : d.a; return o ? o.name : "OUTSIDE"; }))],
    fixtures: M.fixtures.filter(f => f.room === m && !["socket", "socket_ip55", "shaver", "switch_dp", "cooker_switch"].includes(f.kind)).map(f => `${f.id} ${f.kind}`)
  }));
  const doors = M.doors.map(d => ({id: d.id, between: [d.other ? d.other.name : "OUTSIDE", d.into ? d.into.name : "OUTSIDE"], clear_w: d.w, style: d.style}));
  const fixtures = M.fixtures.map(f => {
    const o = {id: f.id, kind: f.kind, room: f.room ? f.room.name : "outside", at: [r2(f.c.x), r2(f.c.y)]};
    for (const k of ["lps", "mode", "litres", "top_h", "h_mount", "serves", "circuit", "auto"]) if (f.f[k] !== undefined) o[k] = f.f[k];
    return o;
  });
  const by = s => rep.results.filter(r => r.status === s);
  const judgement = [];
  for (const r of rep.results) for (const i of r.items || []) if (i.note && /review/i.test(i.note)) judgement.push({rule: r.id, element_ids: i.element_ids, item: i.label, value: i.value, note: i.note});
  for (const r of rep.results) if (r.by === "reviewer" && r.items && r.items.length) for (const i of r.items) judgement.push({rule: r.id, element_ids: i.element_ids, item: i.label, value: i.value, note: r.note});

  return {
    purpose: "You are the plans examiner. Review this plan against the rule pack below and return corrections in the format given in output_format. Work only from this bundle.",
    pack, authorities: manifest.authorities.map(a => `${a.document} (${a.edition})`), assumptions: manifest.assumptions,
    project: {name: doc.project, level: doc.level, gross_area_m2: rep.gross_area_m2, building_type: doc.building_type, storeys: doc.storeys,
      building_h: doc.building_h, gas: doc.gas, hassantuk: doc.hassantuk, sprinklered: doc.sprinklered, plot: doc.plot},
    rooms, doors, fixtures, circuits: doc.circuits || [],
    code_check: {
      summary: rep.summary,
      fails: by("FAIL").concat(by("ADVISE")).map(r => ({id: r.id, title: r.title, clause: r.clause, status: r.status, failing: r.items.filter(i => !i.ok).map(i => ({element_ids: i.element_ids, item: i.label, value: i.value, limit: i.limit}))})),
      not_checkable: by("NOT CHECKABLE").filter(r => r.by !== "reviewer").map(r => ({id: r.id, title: r.title, needs: r.needs})),
      notes: rep.results.filter(r => r.note && r.status === "PASS").map(r => ({id: r.id, note: r.note}))
    },
    reviewer_rules: rules.filter(r => r.measure === "reviewer").map(r => ({id: r.id, clause: r.clause, page: r.page, requirement: r.requirement})),
    judgement_items: judgement,
    checklist: rv.checklist || [],
    foreign_values: rv.foreign_values || [],
    output_format: {
      reviewer: "who reviewed (e.g. 'reviewer agent')",
      packs_loaded: "the authority documents and editions you used, copied from authorities",
      verdict: "approve | corrections",
      corrections: [{issue: "what is wrong, one sentence", element_ids: ["ids from rooms / doors / fixtures / circuits"], rule: "a rule id from the pack, or null",
        reason: "required when rule is null: why it matters (coordination, omission, judgement)", fix: "the concrete change to the spec", severity: "must | should"}],
      max_corrections: rv.max_corrections || 12,
      rules_judged: "for each reviewer rule and judgement item: {rule, result: pass | fail | not_checked, why}"
    }
  };
}

function validate(corr, doc, {pack = "dubai", rulesDir} = {}) {
  rulesDir = rulesDir || path.join(__dirname, "..", "rules");
  const {manifest, rules} = cc.loadPack(pack, rulesDir);
  const max = (manifest.reviewer || {}).max_corrections || 12;
  const errors = [], warnings = [];
  const ids = new Set([...doc.rooms.map(r => r.id), ...doc.openings.map(o => o.id), ...doc.fixtures.map(f => f.id), ...doc.walls.map(w => w.id), ...(doc.circuits || []).map(c => c.id)]);
  const ruleIds = new Set(rules.map(r => r.id));
  if (!corr || typeof corr !== "object") return {ok: false, errors: ["Corrections file is not a JSON object."], warnings};
  if (!["approve", "corrections"].includes(corr.verdict)) errors.push(`verdict must be "approve" or "corrections" (got ${JSON.stringify(corr.verdict)}).`);
  if (!Array.isArray(corr.packs_loaded) || !corr.packs_loaded.length) errors.push("packs_loaded must list the authority documents and editions used.");
  const list = Array.isArray(corr.corrections) ? corr.corrections : (errors.push("corrections must be an array."), []);
  if (list.length > max) errors.push(`${list.length} corrections: at most ${max}. Keep the most important.`);
  list.forEach((c, i) => {
    const at = `correction ${i + 1}`;
    if (!c.issue || typeof c.issue !== "string") errors.push(`${at}: issue is missing.`);
    if (!c.fix || typeof c.fix !== "string") errors.push(`${at}: fix is missing.`);
    if (!["must", "should"].includes(c.severity)) errors.push(`${at}: severity must be "must" or "should".`);
    if (!Array.isArray(c.element_ids) || !c.element_ids.length) errors.push(`${at}: cite at least one element id.`);
    else for (const id of c.element_ids) if (!ids.has(id)) errors.push(`${at}: element id "${id}" is not in the plan.`);
    if (c.rule !== null && c.rule !== undefined && !ruleIds.has(c.rule)) errors.push(`${at}: rule "${c.rule}" is not in the ${pack} pack.`);
    if ((c.rule === null || c.rule === undefined) && !(c.reason && String(c.reason).trim())) errors.push(`${at}: give a rule id or a reason.`);
  });
  if (corr.verdict === "approve" && list.some(c => c.severity === "must")) errors.push(`verdict is "approve" but there are "must" corrections.`);
  if (corr.verdict === "corrections" && !list.length) errors.push(`verdict is "corrections" but the list is empty.`);
  const judged = Array.isArray(corr.rules_judged) ? corr.rules_judged.map(j => j && j.rule) : [];
  for (const r of rules.filter(r => r.measure === "reviewer")) if (!judged.includes(r.id)) warnings.push(`reviewer rule ${r.id} was not judged (rules_judged).`);
  return {ok: !errors.length, errors, warnings, corrections: list.length, must: list.filter(c => c.severity === "must").length};
}

module.exports = {bundle, validate};
