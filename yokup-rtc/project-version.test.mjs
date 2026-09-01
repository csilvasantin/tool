// FLT-1506 · la versión visible equivale a la última modificación real del proyecto.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const upsert=source.slice(source.indexOf("async function upsertProject"),source.indexOf("function resolveProject",source.indexOf("async function upsertProject")));
const assign=source.slice(source.indexOf('if (url.pathname === "/projects/assign"'),source.indexOf('if (url.pathname === "/projects/order"'));
const order=source.slice(source.indexOf('if (url.pathname === "/projects/order"'),source.indexOf('if (url.pathname === "/projects/mission"'));

test("GET /projects publica la versión canónica y su autor",()=>{
  assert.match(source,/created_at: p\.created_at, updated_at: p\.updated_at, updated_by: p\.updated_by \|\| ""/);
});

test("un upsert idéntico conserva timestamp y autor",()=>{
  assert.match(upsert,/const metadataChanged = !prev/);
  assert.match(upsert,/const versionChanged = metadataChanged \|\| membershipChanged/);
  assert.match(upsert,/updated_at: versionChanged \? now : prev\.updated_at/);
  assert.match(upsert,/updated_by: versionChanged \?.*: String\(prev\.updated_by \|\| ""\)/);
});

test("reemplazar membresía sólo cambia la versión si cambia el conjunto",()=>{
  assert.match(upsert,/const membershipChanged = \[\.\.\.requestedMembers\]\.some/);
  assert.match(upsert,/JSON\.stringify\(current\) !== JSON\.stringify\(refs\)/);
  assert.match(upsert,/if \(prev && JSON\.stringify\(current\) === JSON\.stringify\(refs\)\) continue/);
});

test("asignar o retirar un miembro actualiza la versión sólo ante un cambio real",()=>{
  assert.match(assign,/const beforeMembers =/);
  assert.match(assign,/const afterMembers =/);
  assert.match(assign,/if \(beforeMembers !== afterMembers\)/);
  assert.match(assign,/UPDATE projects SET updated_at=\?,updated_by='projects\/assign' WHERE id=\?/);
});

test("reordenar fichas no falsea la última actualización",()=>{
  assert.match(order,/updated_at NO se toca/);
  assert.doesNotMatch(order,/SET updated_at/);
});
