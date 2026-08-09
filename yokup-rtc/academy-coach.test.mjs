import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COACH_ANCHOR, COACH_HOUR, coachLessonForSlot, validateCoachCompletion, validateCoachLaunch } from "./src/academy-coach.js";

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

test("el lanzamiento manual deriva exclusivamente la cápsula de la próxima hora", () => {
  const now = Date.now(), currentSlot = Math.floor(now / COACH_HOUR);
  const launch = validateCoachLaunch({audience:"silicio",counselor:"cto",targetSlotId:1,dimension:"negocio"}, now);
  assert.equal(launch.ok, true);
  assert.equal(launch.targetSlotId, currentSlot + 1);
  assert.deepEqual({dimension:launch.dimension,lessonId:launch.lessonId}, coachLessonForSlot(currentSlot + 1));
  assert.match(launch.launchId, new RegExp(`^coach-launch-silicio-cto-${currentSlot + 1}-`));
  assert.equal(validateCoachLaunch({audience:"silicio",counselor:"otro"}, now).status, 400);
});

test("una cápsula manual puede completarse antes de la hora sólo con autorización del registro", () => {
  const now = Date.now(), nextSlot = Math.floor(now / COACH_HOUR) + 1;
  const body = {audience:"carbono",counselor:"ceo",slotId:nextSlot,application:"Aplicaré esta cápsula manual a una misión verificable."};
  assert.equal(validateCoachCompletion(body, now).status, 409);
  const allowed = validateCoachCompletion(body, now, {allowNextSlot:true});
  assert.equal(allowed.ok, true);
  assert.equal(allowed.dimension, coachLessonForSlot(nextSlot).dimension);
});

test("la escritura Coach exige secreto y la lectura pública omite la aplicación", () => {
  assert.match(source, /url\.pathname === "\/academy\/coach\/launch" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/academy\/coach\/completion" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/academy\/coach\/health" && req\.method === "GET"/);
  assert.match(source, /env\.ACADEMY_COACH_TOKEN/);
  assert.match(source, /INSERT OR IGNORE INTO academy_coach_completions/);
  assert.match(source, /INSERT OR IGNORE INTO academy_coach_launches/);
  assert.match(source, /allowNextSlot:Boolean\(manualLaunch\)/);
  assert.match(source, /UNIQUE\(audience,counselor,slot_id\)/);
  assert.match(source, /url\.pathname === "\/academy\/coach\/completions" && req\.method === "GET"/);
  const read = source.slice(source.indexOf('url.pathname === "/academy/coach/completions"'), source.indexOf('url.pathname === "/academy/coach/completions"') + 900);
  assert.doesNotMatch(read, /application/);
});
