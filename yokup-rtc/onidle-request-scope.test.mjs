import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ONIDLE_BACK_OPTION,
  ONIDLE_CUSTOM_OPTION,
  isCanonicalOnIdleDecision,
  isCanonicalOnIdleOptions,
  selectCanonicalLiveOnIdleDecision,
} from "./src/onidle-decision-contract.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const MARKER = "OnIdle horario";
const scope = { agent:"TrinityMBP14", machine:"MacBookProNegro14", project_id:"gran-de-gracia" };
const options = [
  "Corregir Highscore: 2 fallos y verificar 0",
  "Reducir /misiones de 7 pasos a 4 y verificar 4",
  "Completar sitemap: 8 rutas de 10 y verificar 10",
  ONIDLE_BACK_OPTION,
  ONIDLE_CUSTOM_OPTION,
];
const row = (overrides = {}) => ({ id:"DEC-OK", status:"pending", agent:scope.agent,
  machine:scope.machine, project:scope.project_id, mission:MARKER, surface:"highscore",
  options:JSON.stringify(options), deadline:Date.now()+300000, ...overrides });

test("contrato exacto exige 3 propuestas distintas + Back + Custom", () => {
  assert.equal(isCanonicalOnIdleOptions(options), true);
  assert.equal(isCanonicalOnIdleOptions(options.slice(0, 3)), false);
  assert.equal(isCanonicalOnIdleOptions([options[0], options[0], options[2], options[3], options[4]]), false);
  assert.equal(isCanonicalOnIdleOptions([options[0], options[1], options[2], options[4], options[3]]), false);
  assert.equal(isCanonicalOnIdleOptions(""), false);
});

test("Academy y scopes ajenos jamás se reutilizan como existing", () => {
  const academy = row({ id:"DCL-form-msrrkbk0", agent:"TrinityMBA16", machine:"MacBookAir16plata",
    project:"admira-academy", mission:"formacion:tecnologia", surface:"academy",
    options:JSON.stringify(["Tecnología", "Creatividad", "Negocio"]) });
  assert.equal(isCanonicalOnIdleDecision(academy, scope, MARKER), false);
  assert.equal(selectCanonicalLiveOnIdleDecision([
    academy, row({ id:"DEC-OTHER", project:"otro-proyecto" }), row({ id:"DEC-EMPTY", options:"[]" }), row()
  ], scope, MARKER).id, "DEC-OK");
  assert.equal(selectCanonicalLiveOnIdleDecision([academy], scope, MARKER), null);
});

test("una decisión OnIDLE canónica del mismo scope sí es existing idempotente", () => {
  assert.equal(isCanonicalOnIdleDecision(row({ status:"decided" }), scope, MARKER), true,
    "el ledger puede reproducir una decisión ya resuelta sin crear otra");
  assert.equal(selectCanonicalLiveOnIdleDecision([row({ status:"decided" }), row()], scope, MARKER).id, "DEC-OK");
});

test("request y segunda guarda dentro del lease usan el mismo scope exacto", () => {
  const request = source.slice(source.indexOf("async function requestImmediateOnIdle"),
    source.indexOf("__name(requestImmediateOnIdle"));
  assert.equal((request.match(/liveOnIdleDecision\(env, identity, requestedProjectId\)/g) || []).length, 4);
  assert.equal((request.match(/operationalOnIdleState\(env, identity, requestedProjectId, now\)/g) || []).length, 2);
  assert.match(request, /tryAcquireBeatLease\(env, leaseName, 5000\)/);
  assert.match(request, /invalid_existing_repaired/);
  assert.match(request, /isCanonicalOnIdleDecision\(priorDecision/);
});

test("el INSERT D1 bloquea sólo otro OnIDLE canónico del scope y conserva atomicidad", () => {
  const publish = source.slice(source.indexOf("async function publishScheduledOnIdle"),
    source.indexOf("__name(publishScheduledOnIdle"));
  assert.match(publish, /isCanonicalOnIdleOptions\(options\)/);
  assert.match(publish, /const published = isCanonicalOnIdleDecision\(publishedRow/);
  assert.match(publish, /status='pending' AND mission=\? AND surface='highscore' AND project=\?/);
  assert.match(publish, /json_array_length\(options\)=5/);
  assert.match(publish, /json_extract\(options,'\$\[3\]'\)=\?/);
  assert.match(publish, /env\.DB\.batch\(\[reserve, decision, mark\]\)/);
  assert.doesNotMatch(publish, /SELECT 1 FROM decisions WHERE status='pending'\)/,
    "una decisión Academy global no bloquea el INSERT");
});
