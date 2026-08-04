import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  epochMillis,
  formatDisplayRef,
  madridDayKey,
  sortDisplayRefCandidates,
} from "./src/display-ref.js";

const source = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("./migrations/0003_display_refs.sql", import.meta.url), "utf8");

test("formato canónico exacto en Europe/Madrid, sin prefijos", () => {
  const instant = Date.parse("2026-08-04T06:49:00Z");
  assert.equal(formatDisplayRef(0, instant), "0000.04/08/2026.08:49");
  assert.equal(formatDisplayRef(27, instant), "0027.04/08/2026.08:49");
  assert.doesNotMatch(formatDisplayRef(0, instant), /(?:^|[.])(O|DEC|MIS|TAR)[-.]/);
});

test("el día y la hora obedecen Madrid y aceptan epoch en segundos", () => {
  const beforeMidnightUtc = Date.parse("2026-08-03T21:59:00Z"); // 23:59 Madrid
  const afterMidnightUtc = Date.parse("2026-08-03T22:01:00Z");  // 00:01 Madrid
  assert.equal(madridDayKey(beforeMidnightUtc), "2026-08-03");
  assert.equal(madridDayKey(afterMidnightUtc), "2026-08-04");
  assert.equal(epochMillis(Math.floor(afterMidnightUtc / 1000)), afterMidnightUtc);
  assert.equal(formatDisplayRef(0, afterMidnightUtc), "0000.04/08/2026.00:01");
});

test("el backfill usa orden determinista común, independiente del orden de entrada", () => {
  const rows = [
    {entity_type:"task", entity_key:"FLT-2:a", entity_created_at:200},
    {entity_type:"mission", entity_key:"FLT-2", entity_created_at:100},
    {entity_type:"window", entity_key:"DEC-2", entity_created_at:100},
    {entity_type:"objective", entity_key:"IDEA-2", entity_created_at:100},
  ];
  const expected = ["objective:IDEA-2", "window:DEC-2", "mission:FLT-2", "task:FLT-2:a"];
  for (const input of [rows, [...rows].reverse(), [rows[2], rows[0], rows[3], rows[1]]]) {
    assert.deepEqual(sortDisplayRefCandidates(input).map((row) => `${row.entity_type}:${row.entity_key}`), expected);
  }
});

test("cada día histórico se rellena con las cuatro entidades antes de servir un endpoint", () => {
  assert.match(source, /async function backfillDisplayRefDays\(env, requestedDays\)/);
  assert.match(source, /SELECT 'objective'[\s\S]*UNION ALL SELECT 'window'[\s\S]*UNION ALL SELECT 'mission'[\s\S]*UNION ALL SELECT 'task'/);
  assert.match(
    source,
    /await backfillDisplayRefDays\(env, items\.map\(\(item\) => madridDayKey\(item\.entity_created_at\)\)\);[\s\S]*const refs = await ensureManyEntityDisplayRefs\(env, items\)/,
  );

  const historical = [
    {entity_type:"task", entity_key:"FLT-OLD:a", entity_created_at:Date.parse("2025-01-15T09:00:03Z")},
    {entity_type:"mission", entity_key:"FLT-OLD", entity_created_at:Date.parse("2025-01-15T09:00:02Z")},
    {entity_type:"window", entity_key:"DEC-OLD", entity_created_at:Date.parse("2025-01-15T09:00:01Z")},
    {entity_type:"objective", entity_key:"IDEA-OLD", entity_created_at:Date.parse("2025-01-15T09:00:00Z")},
  ];
  assert.deepEqual(
    sortDisplayRefCandidates([...historical].reverse()).map((row) => row.entity_type),
    ["objective", "window", "mission", "task"],
  );
});

test("persistencia única y contador atómico preservan estabilidad y paginación", () => {
  assert.match(migration, /PRIMARY KEY \(entity_type, entity_key\)/);
  assert.match(migration, /UNIQUE \(day, seq\)/);
  assert.match(source, /UPDATE display_ref_counters SET next_value=next_value\+\? WHERE day=\? RETURNING next_value-\? AS start_seq/);
  assert.match(source, /typeof env\.DB\.batch === "function"/);
  assert.match(source, /SELECT 'objective'[\s\S]*UNION ALL SELECT 'window'[\s\S]*UNION ALL SELECT 'mission'[\s\S]*UNION ALL SELECT 'task'/);
});

test("las respuestas de las cuatro vistas reciben display_ref de forma aditiva", () => {
  for (const type of ["objective", "window", "mission", "task"]) {
    assert.match(source, new RegExp(`attachDisplayRefs\\(env, "${type}"`));
  }
  assert.match(source, /list\[i\]\.display_ref = refs\.get\(displayRefMapKey/);
  assert.match(source, /display_ref: chosen\.display_ref/);
  assert.match(source, /row\.mission_display_ref = missionRefs\.get\(row\.mission_id\) \|\| ""/);
});
