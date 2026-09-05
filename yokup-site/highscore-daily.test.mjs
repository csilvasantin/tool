import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");

test("el Highscore puntúa únicamente el día de Madrid", () => {
  assert.match(html, /var TIME_ZONE = "Europe\/Madrid"/);
  assert.match(html, /function esHoy\(epoch\)/);
  assert.match(html, /datos\.tareas\.forEach\(function \(t\) \{[\s\S]*!esHoy\(t\.updated_at\)/);
  assert.match(html, /tareasDeHoy\(\)\.forEach/);
  assert.doesNotMatch(html, /api\/public\/diary/);
  assert.match(html, /vuelve a cero cada medianoche/);
});

test("sin reloj superior, el sonido conserva un estado accesible", () => {
  assert.doesNotMatch(html, /id="reloj"/);
  assert.match(html, /boton\.setAttribute\("aria-pressed", activo \? "true" : "false"\)/);
  assert.match(html, /estado\.textContent = activo \? "Sonido activado" : "Sonido desactivado"/);
});

test("objetivos, ventanas, misiones y tareas respetan el orden del marcador", () => {
  assert.match(html, /data-sort="ordenador">Ordenador[\s\S]*data-sort="proyecto">Proyecto[\s\S]*data-sort="objetivos">Objetivos[\s\S]*data-sort="ventanas"[^>]*aria-label="Ordenar por ventanas de decisión">[\s\S]*data-sort="misiones">Misiones[\s\S]*data-sort="tareas">Tareas[\s\S]*data-sort="puntos">Puntos/);
  assert.doesNotMatch(html, /<th class="num">Vivo<\/th>/);
  assert.doesNotMatch(html, /<th class="num">Hoy<\/th>/);
  assert.match(html, /seguroYokup\("\/highscore\/daily"/);
  assert.match(html, /f\.ptsObjetivos \+ f\.ptsVentanas \+ f\.ptsMisiones \+ f\.ptsTareas/);
  assert.doesNotMatch(html, /PUNTOS_VIVO|\+ \(f\.vivo \?/);
  assert.match(html, /a\.objective_points/);
  assert.match(html, /a\.window_points/);
  assert.match(html, /a\.mission_points/);
  assert.match(html, /Cada <b>objetivo creado hoy<\/b>/);
  assert.match(html, /Cada <b>ventana de decisión generada<\/b>/);
  assert.match(html, /una ventana por hora suma <b>240 puntos en 24 horas<\/b>/);
  assert.match(html, /Cada <b>misión ejecutada hoy<\/b>/);
});

test("sin actividad mantiene una pareja numérica hora/día sin guion inicial", () => {
  assert.match(html,/return \{hour:0,day:daily,source:"daily-compat",available:false\}/);
  assert.match(html,/var hourClass=metric\.hour>0\?"hour-positive":"hour-zero"/);
  assert.match(html,/parejaPuntosHtml\(a\)/);
  assert.doesNotMatch(html,/score-number score-hour[^\n]*—/);
  assert.match(html, /f\.haLatido = true/);
  assert.match(html, /<td class="tot">' \+ puntosHtml\(a, progressId\)/);
  assert.match(html, /El latido no da puntos/);
});

test("una ranura controlable registra la máquina aunque la app esté apagada", () => {
  assert.match(html, /\(datos\.controlMachines \|\| \[\]\)\.forEach\(function \(control\)/);
  assert.match(html, /\(control\.slots \|\| \[\]\)\.forEach\(function \(slot\)/);
  assert.match(html, /var f = fila\(slot && slot\.persona, machine\)/);
  assert.match(html, /if \(f\.maquinas\.indexOf\(machine\) < 0\) f\.maquinas\.push\(machine\)/);
  assert.match(html, /inventarios de equipo para distinguir 0 de — y registrado de encendido/);
});

test("el runtime principal no depende del orden de presencia y prima Desktop App viva", () => {
  const start = html.indexOf("function adoptaRuntimeCandidato(");
  const end = html.indexOf("\n\n  function calcula", start);
  assert.ok(start >= 0 && end > start, "falta selección canónica de runtime");
  const context = vm.createContext({
    normaliza: (value) => String(value == null ? "" : value).trim(), Number
  });
  vm.runInContext(`${html.slice(start, end)}
    var a={runtime:"",runtimePeso:0,runtimeAt:0};
    adoptaRuntime(a,"OpenCode","cli",1000,true);
    adoptaRuntime(a,"Codex","app",1000,true);
    var b={runtime:"",runtimePeso:0,runtimeAt:0};
    adoptaRuntime(b,"Codex","app",1000,true);
    adoptaRuntime(b,"OpenCode","cli",1000,true);
    adoptaRuntime(b,"OpenCode","app",2000,false);
    globalThis.resultado=[a,b];`, context);
  assert.deepEqual(Array.from(context.resultado, (row) => row.runtime), ["Codex", "Codex"]);
  assert.match(html, /adoptaRuntime\(f, p\.runtime, p\.host, t, processVerified, processVerified \? p\.model : ""\)/);
  assert.match(html, /adoptaRuntime\(f, slot\.runtime, slot\.host, control\.updated \|\| slot\.updated, false, ""\)/);
});

test("Ventana Decisión ocupa dos líneas y conserva la cadencia horaria", () => {
  assert.match(html, /data-sort="ventanas"[^>]*aria-label="Ordenar por ventanas de decisión"><span class="sort-label-stack"><span>Ventana<\/span><span>Decisión<\/span><\/span>/);
  assert.doesNotMatch(html, /Ventanas hoy/i);
  assert.match(html, /function numeroVentanas\(a\)/);
  assert.match(html, /Ventanas de esta hora \/ acumuladas hoy\. No son simultáneas/);
  assert.match(html, /automáticas abren una sola cada 60 minutos/);
  assert.match(html, /acumulado diario, no ventanas simultáneas/);
  assert.match(html, /apertura automática admite una sola ventana cada 60 minutos/);
});

test("las tareas salen del plan A·B·C real y no del tablero público antiguo", () => {
  assert.match(html, /<script src="\/acceso\.js\?v=20260811-r4-d77633add752"><\/script>[\s\S]*<body/);
  assert.match(html, /seguroYokup\("\/tasks\/all\?scope=fleet"/);
  assert.doesNotMatch(html, /\/api\/public\/tasks/);
  assert.match(html, /match\(\/\^\(\[a-c\]\)\(\?:\[1-3\]\)\?\$\//);
  assert.match(html, /normaliza\(t\.mission_id\) \+ "\|" \+ m\[1\]/);
  assert.match(html, /\["in_progress", "done"\]\.indexOf\(t\.status\)/);
  assert.match(html, /id\.scoped\(t\.assignee, t\.loc, role\)/);
  assert.match(html, /tarea A·B·C trabajada hoy/);
});

test("A y sus subtareas cuentan una vez; una misión nunca supera tres tareas", () => {
  const start = html.indexOf("function tareasDeHoy() {");
  const end = html.indexOf("\n  function pon", start);
  assert.ok(start >= 0 && end > start, "falta tareasDeHoy");
  const context = vm.createContext({
    datos: { tareas: [
      { mission_id: "M1", code: "a", status: "in_progress", updated_at: 1 },
      { mission_id: "M1", code: "a1", status: "done", updated_at: 2 },
      { mission_id: "M1", code: "a2", status: "done", updated_at: 3 },
      { mission_id: "M1", code: "b", status: "done", updated_at: 4 },
      { mission_id: "M1", code: "c3", status: "in_progress", updated_at: 5 },
      { mission_id: "M1", code: "d", status: "done", updated_at: 6 },
      { mission_id: "M2", code: "a", status: "pending", updated_at: 7 }
    ] },
    normaliza: (value) => String(value || "").trim(),
    esHoy: () => true,
    Object, Number
  });
  vm.runInContext(`${html.slice(start, end)}\nglobalThis.resultado = tareasDeHoy();`, context);
  assert.equal(context.resultado.length, 3);
  assert.deepEqual(Array.from(context.resultado, (t) => t.code), ["a2", "b", "c3"]);
});

test("No concluida conserva tarea y puntos base; sólo pierde actividad y bonus", () => {
  const start = html.indexOf("function tareasDeHoy() {");
  const end = html.indexOf("\n  function pon", start);
  const context = vm.createContext({datos:{tareas:[{
    mission_id:"M60",code:"a",status:"in_progress",visible_state:"unconcluded",updated_at:1
  }]},normaliza:(value)=>String(value||"").trim(),esHoy:()=>true,Object,Number});
  vm.runInContext(`${html.slice(start,end)}\nglobalThis.resultado=tareasDeHoy();`,context);
  assert.equal(context.resultado.length,1);
  assert.match(html,/visible_state \|\| t\.status/);
  assert.match(html,/=== "in_progress" \? PUNTOS_TAREA_ACTIVA : 0/);
});

test("el ranking distingue actividad actual de los totales históricos", () => {
  assert.match(html, /datos = \{ tareas: \[\], tareasFresh: false, actividad: \[\],[^}]*misiones: \[\], ideas: \[\], decisiones: \[\], proyectos: \[\],[^}]*declaracionesPrincipales: \[\], controlMachines: \[\], presenceNow: 0, presenceAvailable: false,[^}]*trabajos: \[\], workObservations: \[\], trabajosAvailable: false,[^}]*trabajosMode: "unavailable", turnos: null, historial: null, historialFresh: false \}/);
  assert.match(html, /seguroYokup\("\/tickets\?scope=fleet", function \(d\) \{ return d\.tickets \|\| \[\]; \}\)/);
  assert.match(html, /seguroYokup\("\/ideas\?slim=1"/);
  assert.match(html, /seguroYokup\("\/decisions"/);
  assert.match(html, /seguroYokup\("\/projects"/);
  assert.match(html, /normaliza\(m\.visible_state \|\| m\.status\)\.toLowerCase\(\) === "in_progress"/);
  assert.match(html, /\["live", "open"\]\.indexOf\(estado\) >= 0 && vigente/);
  assert.match(html, /normaliza\(t\.visible_state \|\| t\.status\)\.toLowerCase\(\) !== "in_progress"/);
  assert.match(html, /esReciente\(at, OBJETIVO_FRESCO_MS\)/);
});

test("un fallo transitorio de la API no reinicia el acumulado diario", () => {
  assert.match(html, /var DAILY_CACHE_KEY = "yokup\.highscore\.daily\.v1"/);
  assert.match(html, /function guardaActividadDiaria\(payload\)/);
  assert.match(html, /payload\.day !== claveDia\(Date\.now\(\)\)/);
  assert.match(html, /function actividadDiariaGuardada\(\)/);
  // FLT-1423: el batch es total — r[0] son las tareas y el daily pasa a r[1].
  assert.match(html, /var fresh = !!\(r\[1\] && r\[1\]\.day === claveDia\(Date\.now\(\)\)/);
  assert.match(html, /var a = fresh \? r\[1\] : actividadDiariaGuardada\(\)/);
  assert.match(html, /datos\.actividadFresh = fresh/);
  assert.match(html, /var dailyFresh = !!\(r\[1\] && r\[1\]\.day === claveDia\(Date\.now\(\)\)/);
  assert.match(html, /datos\.actividadFresh = dailyFresh/);
  assert.match(html, /datos\.actividadFresh = fresh && datos\.tareasFresh/);
  assert.match(html, /datos\.actividadFresh = dailyFresh && datos\.tareasFresh/);
});

test("el parpadeo consume el mismo state y kind factuales que la carrera", () => {
  assert.match(html, /PRIORIDAD_ACTIVIDAD = \{ objetivos:1, misiones:2, ventanas:3, tareas:4 \}/);
  assert.match(html, /function adoptaActividad\(destino, tipo, at, detalle\)/);
  assert.match(html, /if \(nueva < actual/);
  assert.match(html, /function numeroActividad\(a, tipo, valor, singular\)/);
  assert.match(html, /hasEndpointState \? \(a\.workState !== "running" \|\| kindToMetric\[a\.workKind\] !== tipo\) : a\.actividad !== tipo/);
  assert.match(html, /class="activity-now"/);
  assert.match(html, /Si ninguno parpadea, está <b>idle<\/b>/);
});

test("el indicador de actividad conserva texto accesible y detalle contextual", () => {
  const start = html.indexOf("function numeroActividad(a, tipo, valor, singular) {");
  const end = html.indexOf("\n\n  function pintaTabla", start);
  assert.ok(start >= 0 && end > start, "falta numeroActividad");
  const context = vm.createContext({
    esc: (value) => String(value).replace(/&/g, "&amp;"),
    normaliza: (value) => String(value == null ? "" : value).trim(),
    Object, String
  });
  vm.runInContext(`${html.slice(start, end)}\nglobalThis.activo = numeroActividad({actividad:"tareas",actividadDetalle:"Verificar entrega"}, "tareas", 18, "tarea en curso");\nglobalThis.idle = numeroActividad({actividad:""}, "tareas", 18, "tarea en curso");`, context);
  assert.match(context.activo, /class="activity-now"/);
  assert.match(context.activo, /title="Verificar entrega"/);
  assert.doesNotMatch(context.activo, /Ahora:|tarea en curso ·/);
  assert.match(context.activo, /aria-label="18 tareas\./);
  assert.equal(context.idle, 18);
});

test("el estado de endpoint prima sobre la precedencia local y sobre presencia", () => {
  const start = html.indexOf("function adoptaRuntimeCandidato(");
  const end = html.indexOf("\n\n  var brazosTimer", start);
  assert.ok(start >= 0 && end > start, "falta calcula");
  const now = Date.now();
  const fixture = {
    tareas: [{mission_id:"M1", code:"a", status:"in_progress", updated_at:now, assignee:"Neo", owner:"", loc:"", title:"Probar"}],
    actividad: [{agent:"Neo", machine:"", objectives:1, windows:1, missions:1, objective_points:20, window_points:8, mission_points:40}],
    presencia: [{persona:"Neo", machine:"", updated:now / 1000, runtime:"Codex"}],
    ideas: [{status:"nueva", author:"Neo", updated_at:now, title:"Idear"}],
    misiones: [{status:"in_progress", assignee:"Neo", machine:"", updated_at:now, subject:"Ejecutar"}],
    decisiones: [{status:"live", agent:"Neo", machine:"", created_at:now, deadline:now + 60000, question:"Elegir", project_id:"xpaceos"}],
    proyectos: [{id:"xpaceos", name:"XpaceOS", web:"www.xpaceos.com"}]
  };
  fixture.trabajosAvailable = true;
  fixture.trabajos = [{agent:"Neo", state:"running", kind:"task"}];
  let observations = 0;
  const context = vm.createContext({
    datos: fixture,
    window: { ykAgentIdentity: {
      parse: (raw) => ({persona:String(raw || ""), suffix:""}), suffix: () => "",
      key: (raw) => String(raw || "").toLowerCase(), display: (base) => base, scoped: (assignee) => assignee
    }},
    normaliza: (value) => String(value == null ? "" : value).trim(),
    claveAgenteCarrera: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    tareasDeHoy: () => fixture.tareas,
    comoMs(value) { const n = Number(value) || 0; return n > 0 && n < 1e11 ? n * 1000 : n; },
    esReciente(value, margin) { return now - Number(value) < margin; },
    PRIORIDAD_ACTIVIDAD: {objetivos:1, misiones:2, ventanas:3, tareas:4},
    ACTIVIDAD_FRESCA_MS: 1800000, OBJETIVO_FRESCO_MS: 900000,
    PUNTOS_TAREA:15, PUNTOS_TAREA_ACTIVA:10, FRESCO_SEG:900,
    tendenciaHoraria:(row)=>({state:"same",current:Number(row.total)||0,reference:Number(row.total)||0,reliable:false}),
    observaPuntosDiarios:(row)=>{ observations += 1; return {state:"initial",current:Number(row.total)||0,previous:null}; },
    claveDia:()=>"2026-08-05", claveObservacionDiaria:()=>"neo|macmini",
    NO_AGENTES:["", "-", "—"], Date, Number, Object
  });
  vm.runInContext(`${html.slice(html.indexOf("  function hsWorkIdentity("), html.indexOf("  function trabajosEnCurso("))}\n${html.slice(start, end)}\nglobalThis.primero = calcula();`, context);
  assert.equal(context.primero[0].actividad, "tareas");
  assert.equal(context.primero[0].workState, "running");
  assert.equal(context.primero[0].workKind, "task");
  assert.equal(context.primero[0].proyecto, "xpaceos.com");
  context.datos.tareas = [];
  vm.runInContext("globalThis.segundo = calcula();", context);
  assert.equal(context.segundo[0].actividad, "ventanas");
  context.datos.decisiones = [];
  vm.runInContext("globalThis.tercero = calcula();", context);
  assert.equal(context.tercero[0].actividad, "misiones");
  context.datos.misiones = [];
  vm.runInContext("globalThis.cuarto = calcula();", context);
  assert.equal(context.cuarto[0].actividad, "objetivos");
  assert.equal(context.cuarto[0].workState, "running");
  const validObservations = observations;
  // Respuestas 200 pero arrays de scoring temporalmente incompletos: presencia
  // viva mantiene la fila, sin escribir un cero sobre el baseline válido.
  context.datos.actividad = [];
  context.datos.ideas = [];
  vm.runInContext("globalThis.soloPresencia = calcula();", context);
  assert.equal(observations, validObservations);
  assert.equal(context.soloPresencia[0].tendenciaDiaria.missingScore, true);
  assert.equal(context.soloPresencia[0].tendenciaDiaria.stale, true);
});

test("la columna Proyecto usa el dominio real del censo y queda entre Ordenador y Objetivos", () => {
  assert.match(html, /data-sort="ordenador">Ordenador[\s\S]*data-sort="proyecto">Proyecto[\s\S]*data-sort="objetivos">Objetivos/);
  assert.match(html, /function fichaProyecto\(raw, contexto\)/);
  assert.match(html, /marcaProyecto\(f, p\.project, t \* 1000, p\.focus, 0\)/);
  assert.match(html, /m\.project_name \|\| m\.project/);
  assert.match(html, /d\.project_id \|\| d\.project/);
  assert.match(html, /<td class="project-cell">' \+ proyectoHtml\(a\) \+ '<\/td>/);
  assert.match(html, /proyecto principal declarado para hoy/);
});
