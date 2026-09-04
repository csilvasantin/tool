import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import recordApi from "./highscore-daily-record.js";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

const payload = { evolution:{ end:"2026-09-04" }, all_days:[
  { day:"2026-08-13", top:[{ agent:"TrinityMBP14", points:2280 }, { agent:"OraculoMini", points:1460 }] },
  { day:"2026-09-04", top:[{ agent:"OraculoMacMini", points:280 }, { agent:"NeoMBP14", points:20 }] }
] };

test("mantiene como meta el récord histórico aunque avance el día actual", () => {
  const result = recordApi.dailyRecord(payload, "2026-09-04");
  assert.deepEqual(result.record, { day:"2026-08-13", agent:"TrinityMBP14", points:2280 });
  assert.deepEqual(result.leader, { agent:"OraculoMacMini", points:280 });
  assert.equal(result.target, 2281);
  assert.equal(result.remaining, 2001);
});

test("declara un nuevo récord sin mover la meta a un punto más", () => {
  const winning = structuredClone(payload);
  winning.all_days[1].top[0].points = 2300;
  const result = recordApi.dailyRecord(winning, "2026-09-04");
  assert.equal(result.record.points, 2280);
  assert.equal(result.remaining, 0);
  assert.equal(result.beatenBy, 20);
  assert.equal(result.progress, 100);
});

test("ordena el líder actual si el API no trae el top ordenado", () => {
  const unordered = structuredClone(payload);
  unordered.all_days[1].top.reverse();
  assert.equal(recordApi.dailyRecord(unordered, "2026-09-04").leader.agent, "OraculoMacMini");
});

test("el Highscore carga y repinta la meta histórica con cada lectura viva", () => {
  assert.match(html, /id="dailyRecord"[^>]*aria-live="polite"/);
  assert.match(html, /src="\/highscore-daily-record\.js\?v=/);
  assert.match(html, /function pintaRecordDiario\(\)/);
  assert.equal((html.match(/pintaRecordDiario\(\); pintaPodio/g) || []).length, 2,
    "se pinta al entrar y después de cada actualización del marcador");
});
