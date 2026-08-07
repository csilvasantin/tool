import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL(p,import.meta.url),"utf8");

test("equipo recupera identidad, responsables, web y seguimiento",async()=>{const s=await read("./equipo.html");for(const m of ["nombreVisibleAg","responsablesDe","responsablesTexto","parseResponsables","normalizaWebProyecto","fechaSeguimiento","pintaNotas","abrirNotas","/projects/notes","notasMod"])assert.match(s,new RegExp(m.replace("/","\\/")));});
test("objetivos recupera día, programación y edición masiva",async()=>{const s=await read("./objetivos.html");for(const m of ["function ymd","boardDay","refreshBulk","applyBulk","setSchedule","/ideas/schedule","bulkbar","bulkApply"])assert.match(s,new RegExp(m.replace("/","\\/")));});
test("notificaciones valida caché, carga y capturas negras",async()=>{const s=await read("./notificaciones.html");for(const m of ["imageUrl","crossorigin","onload=\"checkShot","onerror=\"shotFallback","function shotFallback","function checkShot","getImageData"])assert.match(s,new RegExp(m));});
test("decisiones filtra por día, muestra identidad completa y permite rollback",async()=>{const h=await read("./decisiones.html"),s=await read("./yk-decisions.js");assert.match(h,/decisionDay/);for(const m of ["function ymd","agenteVisible","ykAgentIdentity.display","canRollbackClosedImprovement","rollback"])assert.match(s,new RegExp(m.replace(".","\\.")));});
test("misiones recupera identidad, familia visual, A-B-C y reloj de 60 minutos",async()=>{const s=await read("./yk-misiones.js"),h=await read("./misiones.html");for(const m of ["agentSlugs","agentCustom","visibleAgent","machineTypeVisual","taskSummary","tasksAbcHtml","deadlineText","tickMissionClocks","yk:mission-deadline"])assert.match(s,new RegExp(m));assert.match(h,/yk:mission-deadline/);});
