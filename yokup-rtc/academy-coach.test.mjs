import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COACH_ANCHOR, COACH_HOUR, coachLessonForSlot, validateCoachCompletion } from "./src/academy-coach.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("Coach rota Tecnología, Creatividad y Negocio y vuelve a los tres huecos", () => {
  const slot = Math.floor(COACH_ANCHOR / COACH_HOUR);
  assert.equal(coachLessonForSlot(slot).dimension, "tecnologia");
  assert.equal(coachLessonForSlot(slot + 1).dimension, "creatividad");
  assert.equal(coachLessonForSlot(slot + 2).dimension, "negocio");
  assert.equal(coachLessonForSlot(slot + 3).dimension, "tecnologia");
});

test("Yokup deriva la lección y el id; no confía en campos curriculares del cliente", () => {
  const now = Date.now(), slotId = Math.floor(now / COACH_HOUR);
  const result = validateCoachCompletion({
    audience:"silicio", counselor:"ceo", slotId,
    application:"Aplicaré el contrato a una integración y guardaré evidencia.",
    dimension:"negocio", completedAt:"2000-01-01T00:00:00Z"
  }, now);
  assert.equal(result.ok, true);
  assert.equal(result.dimension, coachLessonForSlot(slotId).dimension);
  assert.match(result.eventId, new RegExp(`^coach-silicio-ceo-${slotId}-`));
  assert.equal("completedAt" in result, false);
});

test("Yokup rechaza identidades, franjas futuras y evidencia insuficiente", () => {
  const now = Date.now(), slotId = Math.floor(now / COACH_HOUR);
  assert.equal(validateCoachCompletion({audience:"silicio",counselor:"otro",slotId,application:"Una aplicación suficientemente larga"}, now).status, 400);
  assert.equal(validateCoachCompletion({audience:"silicio",counselor:"ceo",slotId:slotId+1,application:"Una aplicación suficientemente larga"}, now).status, 409);
  assert.equal(validateCoachCompletion({audience:"silicio",counselor:"ceo",slotId,application:"breve"}, now).status, 400);
});

test("la escritura Coach exige secreto y la lectura pública omite la aplicación", () => {
  assert.match(source, /url\.pathname === "\/academy\/coach\/completion" && req\.method === "POST"/);
  assert.match(source, /env\.ACADEMY_COACH_TOKEN/);
  assert.match(source, /INSERT OR IGNORE INTO academy_coach_completions/);
  assert.match(source, /UNIQUE\(audience,counselor,slot_id\)/);
  assert.match(source, /url\.pathname === "\/academy\/coach\/completions" && req\.method === "GET"/);
  const read = source.slice(source.indexOf('url.pathname === "/academy/coach/completions"'), source.indexOf('url.pathname === "/academy/coach/completions"') + 900);
  assert.doesNotMatch(read, /application/);
});

