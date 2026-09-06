import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const declare=source.slice(source.indexOf('url.pathname === "/declare"'), source.indexOf('url.pathname === "/declare"')+24000);

test("POST /declare no cierra una misión sin captura final: commit, sello o URL no son prueba de ejecución", () => {
  assert.match(declare, /validateProofImage\(env, b\.image, url\.origin\)/, "la imagen se valida como en /fleet/task-status");
  assert.match(declare, /if \(!imagenFinal\) return json\(\{ ok: false, code: "closure_evidence_missing"/, "resolve:true sin image se rechaza antes de escribir");
  assert.match(declare, /missing: \["final_image"\]/);
  assert.match(declare, /status='resolved',resolved_at=\?,updated_at=\?,proof_image=\?,proof_kind='final'/, "al cerrar, la captura asciende a proof_image final");
  assert.match(declare, /Pantallazo final declarado desde el CLI/);
  assert.match(declare, /code: "image_invalid"/, "una imagen mala se rechaza con motivo, no se ignora");
  assert.match(declare, /COALESCE\(NULLIF\(proof_image,''\),\?\)/, "una captura sin resolve se guarda sin pisar una prueba previa");
  assert.match(declare, /UPDATE tickets SET status='resolved', resolved_at=\?, updated_at=\?, proof_image=\?, proof_kind='final' WHERE id=\?/, "la rama de misión existente también guarda la captura (FLT-2585 salió resolved sin proof)");
});
