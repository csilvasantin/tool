import test from "node:test";
import assert from "node:assert/strict";
import { isProjectShotAllowed, normalizeProjectWeb } from "./src/project-web.js";

test("normaliza dominios heredados y conserva rutas públicas", () => {
  assert.deepEqual(normalizeProjectWeb("pixeria.com"), { ok:true, value:"https://pixeria.com" });
  assert.deepEqual(normalizeProjectWeb(" https://playertaza.csilvasantin.workers.dev/mesa?q=1#h "), { ok:true, value:"https://playertaza.csilvasantin.workers.dev/mesa?q=1#h" });
  assert.deepEqual(normalizeProjectWeb(""), { ok:true, value:"" });
});

test("rechaza protocolos peligrosos, credenciales y URLs inválidas", () => {
  for (const raw of ["javascript:alert(1)","data:text/html,x","https://u:p@example.com","https://"]){
    assert.equal(normalizeProjectWeb(raw).ok,false,raw);
  }
});

test("shot admite PlayerTaza exacto pero nunca el workers.dev completo", () => {
  assert.equal(isProjectShotAllowed("https://playertaza.csilvasantin.workers.dev"),true);
  assert.equal(isProjectShotAllowed("https://otro.csilvasantin.workers.dev"),false);
  assert.equal(isProjectShotAllowed("https://workers.dev"),false);
  assert.equal(isProjectShotAllowed("https://www.pixeria.com"),true);
});

test("shot admite los sites versionados de Admira Academy y Digital Signage AI", () => {
  assert.equal(isProjectShotAllowed("https://admira.academy"), true);
  assert.equal(isProjectShotAllowed("https://www.digitalsignage.ai/"), true);
});
