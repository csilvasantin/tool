import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");

test("Highscore declara alcance global aunque la URL arrastre project_id",()=>{
  assert.match(frame,/function globalProjectScopeSurface\(pathname\)/);
  assert.match(frame,/\/highscore\(\?:\\\.html\)\?\\\/\?\$/);
  assert.match(frame,/if \(globalProjectScopeSurface\(location\.pathname\)\) return null/);
  assert.match(frame,/PROJECT_SCOPE = globalProjectScopeSurface\(location\.pathname\) \? null : validProjectId\(projectId\)/);
  assert.match(frame,/selectableProjects = globalProjectScopeSurface\(location\.pathname\) \? \[\] : PROJECT_CATALOG/);
});

test("Highscore limpia sólo el query y conserva la preferencia de otras secciones",()=>{
  assert.match(frame,/var globalOnly = globalProjectScopeSurface\(location\.pathname\)/);
  assert.match(frame,/if \(!globalOnly\) \{[\s\S]*localStorage\.setItem\(PROJECT_SCOPE_KEY, projectId\)/);
  assert.match(frame,/url\.searchParams\.delete\("project_id"\)/);
});
