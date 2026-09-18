import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  SUPERVISOR_MODEL,
  SUPERVISOR_ALERTS_SQL,
  SUPERVISOR_AI_USAGE_SQL,
  SUPERVISOR_OBSERVATIONS_SQL,
  SUPERVISOR_REQUESTS_SQL,
  SUPERVISOR_STATION_LEASES_SQL,
  SUPERVISOR_STATIONS_SQL,
  claimSupervisorAlert,
  deriveObservation,
  handleSupervisorRequest,
  nextSupervisorState,
  normalizeObservationId,
  normalizeStationId,
  parseVisionAnswer,
  validateImageDataUri
} from "./src/supervisor.js";

const indexSource = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("el modelo de visión y las rutas viven detrás de la sesión Yokup", () => {
  assert.equal(SUPERVISOR_MODEL, "@cf/moondream/moondream3.1-9B-A2B");
  assert.match(indexSource, /url\.pathname\.startsWith\("\/supervisor\/"\)/);
  assert.match(indexSource, /const session = await requireAuth\(env, req\)/);
  assert.match(indexSource, /SUPERVISOR_STATIONS_SQL/);
  assert.match(indexSource, /SUPERVISOR_OBSERVATIONS_SQL/);
  assert.match(indexSource, /SUPERVISOR_REQUESTS_SQL/);
  assert.match(indexSource, /SUPERVISOR_ALERTS_SQL/);
  assert.match(indexSource, /SUPERVISOR_STATION_LEASES_SQL/);
  assert.match(indexSource, /SUPERVISOR_AI_USAGE_SQL/);
  assert.match(SUPERVISOR_STATION_LEASES_SQL, /station_id TEXT PRIMARY KEY/);
  assert.match(SUPERVISOR_STATION_LEASES_SQL, /lease_id TEXT NOT NULL/);
  assert.match(SUPERVISOR_AI_USAGE_SQL, /PRIMARY KEY\(window_start,scope\)/);
  assert.match(indexSource, /sessionInfo:async \(_environment, session\) => supervisorSessionInfo\(await currentSupervisorAccess\(session\)\)/);
  assert.match(indexSource, /sessionAllowed:async \(_environment, session\) => \(await currentSupervisorAccess\(session\)\)\.allowed === true/);
  assert.match(indexSource, /const access = await currentSupervisorAccess\(session\)/);
  assert.match(indexSource, /json, ensureSchema, createIncident, resolveIncident, session, access/);
});

test("normaliza el puesto y rechaza imágenes que no sean data URI de imagen", () => {
  assert.equal(normalizeStationId("Jardinets · Cámara 1"), "jardinets-camara-1");
  assert.equal(normalizeObservationId("2c760ede-bc88-4e0d-a21b-1d880f3ba881"), "2c760ede-bc88-4e0d-a21b-1d880f3ba881");
  assert.throws(() => normalizeObservationId("corta"), /observation_id_required/);
  assert.equal(validateImageDataUri("data:image/jpeg;base64,/9j/4A=="), "data:image/jpeg;base64,/9j/4A==");
  assert.throws(() => validateImageDataUri("data:image/jpeg;base64,YQ=="), /invalid_image/);
  assert.throws(() => validateImageDataUri("https://example.com/frame.jpg"), /invalid_image/);
});

test("interpreta JSON cercado y separa reproducción, apagado y cámara oscura", () => {
  const vision = parseVisionAnswer({answer:"```json\n{\"scene_visible\":true,\"screens\":[{\"state\":\"playing\",\"confidence\":0.98,\"description\":\"vídeo activo\",\"bbox\":[0.1,0.2,0.7,0.6]}],\"summary\":\"Pantalla emitiendo.\"}\n```"});
  const healthy = deriveObservation(vision, 1, {luminance:0.42,dark_ratio:0.1});
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.activeScreens, 1);
  const off = deriveObservation(parseVisionAnswer({answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.96}],"summary":"Pantalla apagada."}'}), 1, {luminance:0.2,dark_ratio:0.4});
  assert.equal(off.status, "critical");
  assert.equal(off.issueCode, "screen_off");
  const doubtful = deriveObservation(parseVisionAnswer({answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.61}],"summary":"No está claro."}'}), 1, {luminance:0.2,dark_ratio:0.4});
  assert.equal(doubtful.status, "warning");
  assert.equal(doubtful.issueCode, "low_confidence");
  const missing = deriveObservation({sceneVisible:true,screens:[],summary:"No aparece la pantalla."}, 1, {luminance:0.4,dark_ratio:0.1});
  assert.equal(missing.status, "warning", "una cámara movida no abre un parte de pantalla");
  const darkCamera = deriveObservation({sceneVisible:false,screens:[],summary:"No se ve."}, 1, {luminance:0.001,dark_ratio:0.999});
  assert.equal(darkCamera.status, "warning");
  assert.equal(darkCamera.issueCode, "camera_dark");
  const coveredLens = deriveObservation(parseVisionAnswer({answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.99}],"summary":"Oscuridad total."}'}), 1, {luminance:0.001,dark_ratio:0.999});
  assert.equal(coveredLens.status, "warning", "oscuridad total no se confunde con una pantalla apagada");
  assert.equal(coveredLens.issueCode, "camera_dark");
});

test("la alarma necesita dos lecturas críticas y sólo habla en la transición", () => {
  const observation = {status:"critical",issueCode:"screen_off",confidence:.97,summary:"Apagada",visibleScreens:1,activeScreens:0,screens:[],luminance:.1,darkRatio:.8};
  const first = nextSupervisorState(null, observation, 1000);
  assert.equal(first.confirmed, false);
  assert.equal(first.alert, false);
  const second = nextSupervisorState({status:"critical",consecutive_failures:1}, observation, 2000);
  assert.equal(second.confirmed, true);
  assert.equal(second.alert, true);
  const third = nextSupervisorState({status:"critical",consecutive_failures:2,open_ticket_id:"INC-1"}, observation, 3000);
  assert.equal(third.alert, false);
  assert.equal(third.openTicketId, "INC-1");
});

test("un ticket abierto se recupera al pasar critical → warning → healthy, sin repetir en healthy", () => {
  const warning = {status:"warning",issueCode:"camera_dark",confidence:.4,summary:"Cámara oscura",visibleScreens:0,activeScreens:0,screens:[],luminance:.01,darkRatio:.99};
  const healthy = {status:"healthy",issueCode:"healthy",confidence:.99,summary:"Emitiendo",visibleScreens:1,activeScreens:1,screens:[],luminance:.4,darkRatio:.1};
  const afterWarning = nextSupervisorState({status:"critical",consecutive_failures:2,open_ticket_id:"INC-1"}, warning, 4000);
  assert.equal(afterWarning.recovered, false);
  assert.equal(afterWarning.openTicketId, "INC-1");
  const afterHealthy = nextSupervisorState({status:"warning",consecutive_failures:0,open_ticket_id:afterWarning.openTicketId}, healthy, 5000);
  assert.equal(afterHealthy.recovered, true);
  const repeatedHealthy = nextSupervisorState({status:"healthy",consecutive_failures:0,open_ticket_id:afterHealthy.openTicketId}, healthy, 6000);
  assert.equal(repeatedHealthy.recovered, false);
});

function fakeDatabase() {
  let station = null;
  const observations = [];
  const requests = new Map();
  const alerts = new Map();
  const leases = new Map();
  const usage = new Map();
  let failBatch = false;
  let stealBatchLease = "";
  const projects = new Map([
    ["admira-tv", {id:"admira-tv",name:"Admira TV",status:"activo"}],
    ["xpaceos", {id:"xpaceos",name:"XpaceOS",status:"activo"}],
    ["archivado", {id:"archivado",name:"Archivado",status:"archivado"}]
  ]);
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async first() {
      if (sql.startsWith("SELECT * FROM supervisor_stations")) return station;
      if (sql.startsWith("SELECT id,name,status FROM projects")) return projects.get(args[0]) || null;
      if (sql.startsWith("SELECT station_id,status,response_json,updated_at FROM supervisor_requests")) return requests.get(args[0]) || null;
      if (sql.startsWith("SELECT station_id FROM supervisor_alerts")) return alerts.get(args[0]) || null;
      if (sql.startsWith("SELECT id FROM supervisor_requests") && sql.includes("json_extract")) {
        for (const [id, row] of requests) {
          if (row.status !== "done" || !row.response_json) continue;
          try { if (JSON.parse(row.response_json).speech?.once_key === args[0]) return {id}; }
          catch (_) {}
        }
        return null;
      }
      return null;
    },
    async all() {
      if (sql.includes("FROM supervisor_observations")) return {results:observations.slice().reverse()};
      return {results:[]};
    },
    async run() {
      if (sql.startsWith("INSERT INTO supervisor_stations")) {
        const owner = requests.get(args[17]);
        if (!owner || owner.status !== "processing" || owner.response_json !== args[18]) return {meta:{changes:0}};
        const leaseOwner = leases.get(args[19]);
        if (!leaseOwner || leaseOwner.lease_id !== args[20] || Number(leaseOwner.expires_at) <= Number(args[21])) return {meta:{changes:0}};
        station = {
          id:args[0],project_id:args[1],label:args[2],location:args[3],canonical_screen:args[4],expected_screens:args[5],
          status:args[6],issue_code:args[7],confidence:args[8],summary:args[9],visible_screens:args[10],active_screens:args[11],
          consecutive_failures:args[12],open_ticket_id:args[13],last_seen_at:args[14],last_alert_at:args[15],updated_by:args[16]
        };
      } else if (sql.startsWith("INSERT INTO supervisor_observations")) {
        const owner = requests.get(args[13]);
        if (!owner || owner.status !== "processing" || owner.response_json !== args[14]) return {meta:{changes:0}};
        const leaseOwner = leases.get(args[15]);
        if (!leaseOwner || leaseOwner.lease_id !== args[16] || Number(leaseOwner.expires_at) <= Number(args[17])) return {meta:{changes:0}};
        observations.push({id:args[0],captured_at:args[2],observed_at:args[3],status:args[4],issue_code:args[5],confidence:args[6],visible_screens:args[7],active_screens:args[8],summary:args[9],ticket_id:args[12]});
      } else if (sql.startsWith("INSERT OR IGNORE INTO supervisor_requests")) {
        if (requests.has(args[0])) return {meta:{changes:0}};
        requests.set(args[0], {station_id:args[1],captured_at:args[2],status:"processing",response_json:args[3],updated_at:args[5]});
      } else if (sql.startsWith("INSERT INTO supervisor_station_leases")) {
        const current = leases.get(args[0]);
        if (current && Number(current.expires_at) > Number(args[5])) return {meta:{changes:0}};
        leases.set(args[0], {station_id:args[0],lease_id:args[1],observation_id:args[2],expires_at:args[3],updated_at:args[4]});
      } else if (sql.startsWith("INSERT INTO supervisor_ai_usage")) {
        const key = `${args[0]}|${args[1]}`, current = usage.get(key);
        if (current && Number(current.used) >= Number(args[3])) return {meta:{changes:0}};
        usage.set(key, {window_start:args[0],scope:args[1],used:Number(current && current.used || 0) + 1,updated_at:args[2]});
      } else if (sql.startsWith("INSERT OR IGNORE INTO supervisor_alerts")) {
        if (alerts.has(args[0])) return {meta:{changes:0}};
        alerts.set(args[0], {once_key:args[0],station_id:args[1],ticket_id:args[2],issue_code:args[3],created_at:args[4]});
      } else if (sql.startsWith("UPDATE supervisor_requests SET status='done'")) {
        const row = requests.get(args[2]);
        if (!row || row.status !== "processing" || row.response_json !== args[3]) return {meta:{changes:0}};
        const leaseOwner = leases.get(args[4]);
        if (!leaseOwner || leaseOwner.lease_id !== args[5] || Number(leaseOwner.expires_at) <= Number(args[6])) return {meta:{changes:0}};
        requests.set(args[2], {...row,status:"done",response_json:args[0],updated_at:args[1]});
      } else if (sql.startsWith("UPDATE supervisor_requests SET captured_at=")) {
        const row = requests.get(args[4]);
        if (!row || row.status !== "processing" || Number(row.updated_at) !== Number(args[5])) return {meta:{changes:0}};
        requests.set(args[4], {...row,captured_at:args[0],updated_at:args[2],response_json:args[3]});
      } else if (sql.startsWith("UPDATE supervisor_requests SET updated_at=")) {
        const row = requests.get(args[1]);
        if (!row || row.status !== "processing" || row.response_json !== args[2]) return {meta:{changes:0}};
        requests.set(args[1], {...row,updated_at:args[0]});
      } else if (sql.startsWith("UPDATE supervisor_station_leases SET")) {
        const row = leases.get(args[2]);
        if (!row || row.lease_id !== args[3] || Number(row.expires_at) <= Number(args[4])) return {meta:{changes:0}};
        leases.set(args[2], {...row,expires_at:args[0],updated_at:args[1]});
      } else if (sql.startsWith("DELETE FROM supervisor_station_leases")) {
        const row = leases.get(args[0]);
        if (!row || row.lease_id !== args[1]) return {meta:{changes:0}};
        leases.delete(args[0]);
      } else if (sql.startsWith("DELETE FROM supervisor_requests")) {
        const row = requests.get(args[0]);
        if (!row || row.status !== "processing" || row.response_json !== args[1]) return {meta:{changes:0}};
        requests.delete(args[0]);
      } else if (sql.startsWith("DELETE FROM supervisor_ai_usage")) {
        for (const [key, row] of usage) if (Number(row.window_start) < Number(args[0])) usage.delete(key);
      } else if (sql.startsWith("DELETE FROM supervisor_observations") && observations.length > 120) {
        observations.splice(0, observations.length - 120);
      }
      return {meta:{changes:1}};
    }
  });
  return {
    prepare:(sql) => statement(sql),
    batch:async (statements) => {
      if (failBatch) { failBatch = false; throw new Error("batch_failed"); }
      if (stealBatchLease) {
        leases.set(stealBatchLease, {
          station_id:stealBatchLease,lease_id:"successor-lease",observation_id:"obs-successor",
          expires_at:Date.now() + 120_000,updated_at:Date.now()
        });
        stealBatchLease = "";
      }
      return Promise.all(statements.map((item) => item.run()));
    },
    station:() => station,
    observations:() => observations.slice(),
    requests,
    leases,
    usage,
    projects,
    failBatchOnce:() => { failBatch = true; },
    stealLeaseBeforeBatch:(stationId) => { stealBatchLease = stationId; },
    age:() => { if (station) station.last_seen_at = Date.now() - 6000; }
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers:{"content-type":"application/json"}
});

function supervisorDeps(overrides = {}) {
  return {
    json,
    ensureSchema:async () => {},
    createIncident:async () => "INC-TEST-1",
    resolveIncident:async () => null,
    addEvent:async () => {},
    session:{email:"viewer@example.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:false},
    ...overrides
  };
}

function analysisRequest(body = {}) {
  return new Request("https://api.yokup.com/supervisor/analyze", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      station_id:"puesto-politica",
      observation_id:"obs-policy-0001",
      captured_at:Date.now(),
      expected_screens:1,
      image:"data:image/jpeg;base64,/9j/4A==",
      metrics:{luminance:.4,dark_ratio:.1},
      ...body
    })
  });
}

const healthyVision = () => ({
  answer:'{"scene_visible":true,"screens":[{"state":"playing","confidence":0.98}],"summary":"Pantalla emitiendo."}'
});

const offVision = () => ({
  answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.98}],"summary":"Pantalla apagada."}'
});

function sqliteSupervisorDatabase() {
  const raw = new DatabaseSync(":memory:");
  raw.exec([
    "CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,status TEXT)",
    SUPERVISOR_STATIONS_SQL, SUPERVISOR_OBSERVATIONS_SQL, SUPERVISOR_REQUESTS_SQL,
    SUPERVISOR_ALERTS_SQL, SUPERVISOR_STATION_LEASES_SQL, SUPERVISOR_AI_USAGE_SQL
  ].join(";"));
  raw.prepare("INSERT INTO projects(id,name,status) VALUES(?,?,?)").run("admira-tv", "Admira TV", "activo");
  const statement = (sql, args = []) => ({
    bind(...values) { return statement(sql, values); },
    async run() { return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}; },
    async first() { return raw.prepare(sql).get(...args) || null; },
    async all() { return {results:raw.prepare(sql).all(...args)}; }
  });
  return {
    raw,
    prepare:(sql) => statement(sql),
    async batch(statements) {
      raw.exec("BEGIN");
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

test("el batch propietario usa SQL SQLite real y confirma estación, observación y replay juntos", async () => {
  const DB = sqliteSupervisorDatabase();
  const env = {DB, AI:{run:async () => healthyVision()}};
  const request = analysisRequest({station_id:"puesto-sql-real",observation_id:"obs-sql-real-01"});
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps());

  assert.equal(response.status, 200);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM supervisor_stations").get().n, 1);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM supervisor_observations").get().n, 1);
  const replay = DB.raw.prepare("SELECT status,response_json FROM supervisor_requests WHERE id=?").get("obs-sql-real-01");
  assert.equal(replay.status, "done");
  assert.equal(JSON.parse(replay.response_json).station.project_id, "admira-tv");
});

test("sin project_id el backend fija admira-tv y persiste ese proyecto canónico", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const request = analysisRequest();
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps());

  assert.equal(response.status, 200);
  assert.equal((await response.json()).station.project_id, "admira-tv");
  assert.equal(DB.station().project_id, "admira-tv");
  assert.equal(aiCalls, 1);
});

test("un usuario normal no cambia de proyecto aunque falsifique rol o capability en el body", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0, incidentCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const request = analysisRequest({
    project_id:"xpaceos",
    role:"superuser",
    is_superuser:true,
    capabilities:{supervisor_project_switch:true}
  });
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps({
    createIncident:async () => { incidentCalls += 1; return "INC-NO"; }
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {ok:false,error:"project_forbidden"});
  assert.equal(aiCalls, 0, "la denegación sucede antes de consumir Workers AI");
  assert.equal(incidentCalls, 0);
  assert.equal(DB.station(), null);
  assert.equal(DB.requests.size, 0, "una petición prohibida no reserva observation_id");
});

test("una sesión firmada pero retirada de la whitelist no conserva acceso al Supervisor", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const request = analysisRequest({observation_id:"obs-revoked-user"});
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps({
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:false,canChangeProject:false}
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {ok:false,error:"supervisor_forbidden"});
  assert.equal(aiCalls, 0);
  assert.equal(DB.requests.size, 0);
});

test("un superusuario puede analizar un proyecto activo alternativo", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const request = analysisRequest({project_id:"xpaceos",observation_id:"obs-policy-admin-1"});
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps({
    session:{email:"admin@example.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true}
  }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).station.project_id, "xpaceos");
  assert.equal(DB.station().project_id, "xpaceos");
  assert.equal(aiCalls, 1);
});

test("ni siquiera un superusuario usa proyectos inexistentes o archivados", async () => {
  for (const projectId of ["no-existe", "archivado"]) {
    const DB = fakeDatabase();
    let aiCalls = 0;
    const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
    const request = analysisRequest({project_id:projectId,observation_id:`obs-${projectId}-0001`});
    const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps({
      session:{email:"admin@example.com"},
      access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true}
    }));

    assert.equal(response.status, 404, projectId);
    assert.deepEqual(await response.json(), {ok:false,error:"invalid_project_id"});
    assert.equal(aiCalls, 0);
    assert.equal(DB.requests.size, 0);
  }
});

test("state aplica la misma política y evita leer una estación de otro proyecto", async () => {
  const DB = fakeDatabase();
  const env = {DB, AI:{run:async () => healthyVision()}};
  const adminDeps = supervisorDeps({
    session:{email:"admin@example.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true}
  });
  const analyze = analysisRequest({project_id:"xpaceos",observation_id:"obs-state-admin-1"});
  assert.equal((await handleSupervisorRequest(analyze, env, new URL(analyze.url), adminDeps)).status, 200);

  const forbidden = new Request("https://api.yokup.com/supervisor/state?station=puesto-politica&project_id=xpaceos");
  const forbiddenResponse = await handleSupervisorRequest(forbidden, env, new URL(forbidden.url), supervisorDeps());
  assert.equal(forbiddenResponse.status, 403);
  assert.deepEqual(await forbiddenResponse.json(), {ok:false,error:"project_forbidden"});

  const hiddenByDefault = new Request("https://api.yokup.com/supervisor/state?station=puesto-politica");
  const hiddenResponse = await handleSupervisorRequest(hiddenByDefault, env, new URL(hiddenByDefault.url), supervisorDeps());
  assert.equal(hiddenResponse.status, 403);
  assert.deepEqual(await hiddenResponse.json(), {ok:false,error:"station_project_forbidden"});

  const allowed = new Request("https://api.yokup.com/supervisor/state?station=puesto-politica&project_id=xpaceos");
  const allowedResponse = await handleSupervisorRequest(allowed, env, new URL(allowed.url), adminDeps);
  assert.equal(allowedResponse.status, 200);
  const data = await allowedResponse.json();
  assert.equal(data.project.id, "xpaceos");
  assert.equal(data.station.project_id, "xpaceos");
});

test("el replay sólo reutiliza una respuesta si coinciden station_id y project_id", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const first = analysisRequest({station_id:"puesto-a",observation_id:"obs-replay-bound-1"});
  assert.equal((await handleSupervisorRequest(first, env, new URL(first.url), supervisorDeps())).status, 200);

  const otherStation = analysisRequest({station_id:"puesto-b",observation_id:"obs-replay-bound-1"});
  const stationCollision = await handleSupervisorRequest(otherStation, env, new URL(otherStation.url), supervisorDeps());
  assert.equal(stationCollision.status, 409);
  assert.deepEqual(await stationCollision.json(), {ok:false,error:"observation_conflict"});

  const otherProject = analysisRequest({station_id:"puesto-a",project_id:"xpaceos",observation_id:"obs-replay-bound-1"});
  const projectCollision = await handleSupervisorRequest(otherProject, env, new URL(otherProject.url), supervisorDeps({
    session:{email:"admin@example.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true}
  }));
  assert.equal(projectCollision.status, 409);
  assert.deepEqual(await projectCollision.json(), {ok:false,error:"observation_conflict"});
  assert.equal(aiCalls, 1, "ninguna colisión vuelve a ejecutar visión");
});

test("POST oculta el proyecto dueño de una estación salvo a quien puede cambiar proyecto", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const adminDeps = supervisorDeps({
    session:{email:"admin@example.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true}
  });
  const seed = analysisRequest({station_id:"puesto-privado",project_id:"xpaceos",observation_id:"obs-private-seed-1"});
  assert.equal((await handleSupervisorRequest(seed, env, new URL(seed.url), adminDeps)).status, 200);

  const ordinary = analysisRequest({station_id:"puesto-privado",project_id:"admira-tv",observation_id:"obs-private-user-1"});
  const ordinaryResponse = await handleSupervisorRequest(ordinary, env, new URL(ordinary.url), supervisorDeps());
  assert.equal(ordinaryResponse.status, 409);
  assert.deepEqual(await ordinaryResponse.json(), {ok:false,error:"station_project_conflict"});

  const privileged = analysisRequest({station_id:"puesto-privado",project_id:"admira-tv",observation_id:"obs-private-admin-1"});
  const privilegedResponse = await handleSupervisorRequest(privileged, env, new URL(privileged.url), adminDeps);
  assert.equal(privilegedResponse.status, 409);
  assert.deepEqual(await privilegedResponse.json(), {ok:false,error:"station_project_conflict",project_id:"xpaceos"});
  assert.equal(aiCalls, 1, "los conflictos se cortan antes de visión");
  assert.equal(DB.leases.size, 0);
  assert.equal(DB.requests.has("obs-private-user-1"), false);
  assert.equal(DB.requests.has("obs-private-admin-1"), false);
});

test("el recurso de cada incidente queda aislado por origen Supervisor y proyecto", async () => {
  const resourceFor = async (projectId) => {
    const DB = fakeDatabase(), incidents = [];
    const env = {DB, AI:{run:async () => offVision()}};
    const deps = supervisorDeps({
      session:{email:"admin@example.com"},
      access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:true},
      createIncident:async (_environment, incident) => { incidents.push(incident); return `INC-${projectId}`; }
    });
    for (const suffix of ["one", "two"]) {
      const request = analysisRequest({
        station_id:"puesto-compartido",
        project_id:projectId,
        canonical_screen:"CanalKiosk:Shared:DGX",
        observation_id:`obs-${projectId}-${suffix}`,
        metrics:{luminance:.2,dark_ratio:.5}
      });
      assert.equal((await handleSupervisorRequest(request, env, new URL(request.url), deps)).status, 200);
      DB.age();
    }
    assert.equal(incidents.length, 1);
    return incidents[0].resource;
  };

  const admira = await resourceFor("admira-tv");
  const xpaceos = await resourceFor("xpaceos");
  assert.equal(admira, "supervisor:admira-tv:CanalKiosk:Shared:DGX");
  assert.equal(xpaceos, "supervisor:xpaceos:CanalKiosk:Shared:DGX");
  assert.notEqual(admira, xpaceos);
  assert.notEqual(admira, "CanalKiosk:Shared:DGX", "no colisiona con tickets de otros orígenes");
});

test("un lease D1 serializa dos observation_id concurrentes de la misma estación", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0, releaseVision;
  const visionStarted = new Promise((resolve) => {
    releaseVision = {started:resolve, finish:null};
  });
  const visionResult = new Promise((resolve) => { releaseVision.finish = () => resolve(healthyVision()); });
  const env = {DB, AI:{run:async () => {
    aiCalls += 1;
    releaseVision.started();
    return visionResult;
  }}};
  const first = analysisRequest({station_id:"puesto-concurrente",observation_id:"obs-concurrent-one"});
  const firstPending = handleSupervisorRequest(first, env, new URL(first.url), supervisorDeps());
  await visionStarted;
  assert.equal(DB.leases.size, 1);

  const second = analysisRequest({station_id:"puesto-concurrente",observation_id:"obs-concurrent-two"});
  const secondResponse = await handleSupervisorRequest(second, env, new URL(second.url), supervisorDeps());
  assert.equal(secondResponse.status, 409);
  assert.deepEqual(await secondResponse.json(), {ok:false,error:"station_busy"});
  assert.equal(aiCalls, 1);
  assert.equal(DB.leases.size, 1, "el segundo request no libera el lease del primero");
  assert.equal(DB.requests.has("obs-concurrent-two"), false);

  releaseVision.finish();
  assert.equal((await firstPending).status, 200);
  assert.equal(DB.leases.size, 0, "el propietario libera su lease al terminar");
});

test("un reclaim del mismo observation_id no puede ser borrado ni finalizado por el propietario anterior", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0, releaseFirst, markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstVision = new Promise((resolve) => { releaseFirst = () => resolve(healthyVision()); });
  const env = {DB, AI:{run:async () => {
    aiCalls += 1;
    if (aiCalls === 1) { markFirstStarted(); return firstVision; }
    return healthyVision();
  }}};
  const first = analysisRequest({station_id:"puesto-reclaim",observation_id:"obs-reclaim-owner"});
  const firstPending = handleSupervisorRequest(first, env, new URL(first.url), supervisorDeps());
  await firstStarted;

  const processing = DB.requests.get("obs-reclaim-owner");
  const firstToken = processing.response_json;
  processing.updated_at = Date.now() - 121_000;
  const oldLease = DB.leases.get("puesto-reclaim");
  oldLease.expires_at = Date.now() - 1;

  const retry = analysisRequest({station_id:"puesto-reclaim",observation_id:"obs-reclaim-owner"});
  const retryResponse = await handleSupervisorRequest(retry, env, new URL(retry.url), supervisorDeps());
  assert.equal(retryResponse.status, 200);
  const done = DB.requests.get("obs-reclaim-owner");
  assert.equal(done.status, "done");
  assert.notEqual(done.response_json, firstToken);

  releaseFirst();
  const supersededResponse = await firstPending;
  assert.equal(supersededResponse.status, 409);
  assert.deepEqual(await supersededResponse.json(), {ok:false,error:"station_busy"});
  assert.equal(DB.requests.get("obs-reclaim-owner").status, "done", "el cleanup viejo no borra la respuesta recuperada");

  const replay = analysisRequest({station_id:"puesto-reclaim",observation_id:"obs-reclaim-owner"});
  const replayResponse = await handleSupervisorRequest(replay, env, new URL(replay.url), supervisorDeps());
  assert.equal(replayResponse.status, 200);
  assert.equal((await replayResponse.json()).reused, true);
});

test("si otro observation_id recupera el lease antes del batch, ninguna escritura stale se confirma", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  DB.stealLeaseBeforeBatch("puesto-lease-robado");
  const request = analysisRequest({station_id:"puesto-lease-robado",observation_id:"obs-stale-batch-1"});
  const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps());

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {ok:false,error:"observation_conflict"});
  assert.equal(aiCalls, 1);
  assert.equal(DB.station(), null, "el upsert de estación comparte la guarda de lease");
  assert.equal(DB.observations().length, 0, "la observación comparte la guarda de lease");
  assert.equal(DB.requests.has("obs-stale-batch-1"), false, "la reserva antigua se limpia sin tocar al sucesor");
  assert.equal(DB.leases.get("puesto-lease-robado").lease_id, "successor-lease");
});

test("el cupo D1 por usuario y proyecto corta la rotación de station_id antes de Workers AI", async () => {
  const DB = fakeDatabase();
  let aiCalls = 0;
  const env = {DB, AI:{run:async () => { aiCalls += 1; return healthyVision(); }}};
  const originalNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    for (let index = 1; index <= 12; index += 1) {
      const request = analysisRequest({station_id:`puesto-cuota-${index}`,observation_id:`obs-quota-${String(index).padStart(2,"0")}`});
      const response = await handleSupervisorRequest(request, env, new URL(request.url), supervisorDeps());
      assert.equal(response.status, 200, `petición permitida ${index}`);
      DB.age();
    }
    const blocked = analysisRequest({station_id:"puesto-cuota-13",observation_id:"obs-quota-13"});
    const blockedResponse = await handleSupervisorRequest(blocked, env, new URL(blocked.url), supervisorDeps());
    assert.equal(blockedResponse.status, 429);
    const payload = await blockedResponse.json();
    assert.equal(payload.error, "supervisor_rate_limited");
    assert.ok(payload.retry_after_ms > 0);
    assert.equal(aiCalls, 12, "la petición fuera de cupo no consume inferencia");
    assert.equal(DB.requests.has("obs-quota-13"), false, "la reserva rechazada queda limpia");
    assert.equal(DB.leases.size, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("el lease caducado se recupera y cualquier fallo de visión libera lease y reserva", async () => {
  const recoveredDB = fakeDatabase();
  recoveredDB.leases.set("puesto-caducado", {
    station_id:"puesto-caducado",lease_id:"worker-caido",observation_id:"obs-antigua",expires_at:Date.now() - 1,updated_at:Date.now() - 10
  });
  const recoveredEnv = {DB:recoveredDB,AI:{run:async () => healthyVision()}};
  const recoveredRequest = analysisRequest({station_id:"puesto-caducado",observation_id:"obs-after-expiry"});
  assert.equal((await handleSupervisorRequest(recoveredRequest, recoveredEnv, new URL(recoveredRequest.url), supervisorDeps())).status, 200);
  assert.equal(recoveredDB.leases.size, 0);

  const failedDB = fakeDatabase();
  const failedEnv = {DB:failedDB,AI:{run:async () => { throw new Error("AI caída"); }}};
  const failedRequest = analysisRequest({station_id:"puesto-error",observation_id:"obs-vision-error"});
  const failedResponse = await handleSupervisorRequest(failedRequest, failedEnv, new URL(failedRequest.url), supervisorDeps());
  assert.equal(failedResponse.status, 502);
  assert.equal(failedDB.leases.size, 0);
  assert.equal(failedDB.requests.has("obs-vision-error"), false);
});

test("dos fotogramas apagados crean un único ticket y devuelven la voz robot", async () => {
  const DB = fakeDatabase(), incidents = [];
  const env = {DB, AI:{run:async () => ({answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.97,"description":"sin luz"}],"summary":"La pantalla está apagada."}'})}};
  const deps = {
    json:(body,status=200) => new Response(JSON.stringify(body), {status,headers:{"content-type":"application/json"}}),
    ensureSchema:async () => {},
    createIncident:async (_env, body) => { incidents.push(body); return "INC-SUP-1"; },
    resolveIncident:async () => null,
    addEvent:async () => {},
    session:{email:"csilva@admira.com"},
    access:{defaultProjectId:"admira-tv",defaultProjectLabel:"admira.tv",allowed:true,canChangeProject:false}
  };
  const body = {station_id:"jardinets-1",project_id:"admira-tv",canonical_screen:"CanalKiosk:Jardinets:DGX",label:"Jardinets",expected_screens:1,image:"data:image/jpeg;base64,/9j/4A==",metrics:{luminance:.2,dark_ratio:.5}};
  const request = (observationId) => new Request("https://api.yokup.com/supervisor/analyze", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,observation_id:observationId,captured_at:Date.now()})});
  let response = await handleSupervisorRequest(request("obs-jardinets-0001"), env, new URL(request("obs-jardinets-0001").url), deps);
  let data = await response.json();
  assert.equal(data.alert, false);
  assert.equal(data.ticket, null);
  DB.age();
  response = await handleSupervisorRequest(request("obs-jardinets-0002"), env, new URL(request("obs-jardinets-0002").url), deps);
  data = await response.json();
  assert.equal(data.transition, "incident_confirmed");
  assert.equal(data.alert, true);
  assert.equal(data.voice, "Pantalla apagada");
  assert.equal(data.speech.once_key, "INC-SUP-1:screen_off");
  assert.equal(data.ticket.id, "INC-SUP-1");
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].resource, "supervisor:admira-tv:CanalKiosk:Jardinets:DGX");
  assert.equal(incidents[0].project_id, "admira-tv");
  response = await handleSupervisorRequest(request("obs-jardinets-0002"), env, new URL(request("obs-jardinets-0002").url), deps);
  data = await response.json();
  assert.equal(data.reused, true);
  assert.equal(data.alert, false, "un reintento idempotente no repite la voz");
  assert.equal(data.speech, null);
  DB.age();
  response = await handleSupervisorRequest(request("obs-jardinets-0003"), env, new URL(request("obs-jardinets-0003").url), deps);
  data = await response.json();
  assert.equal(data.alert, false);
  assert.equal(incidents.length, 1, "la observación continua no duplica el ticket");
});

test("un batch fallido después de crear el ticket conserva la voz pendiente para el reintento", async () => {
  const DB = fakeDatabase();
  let incidentCalls = 0;
  const env = {DB, AI:{run:async () => offVision()}};
  const deps = supervisorDeps({
    createIncident:async () => { incidentCalls += 1; return "INC-RECOVER-1"; }
  });
  const request = (id) => analysisRequest({station_id:"puesto-voz-recuperable",observation_id:id,metrics:{luminance:.1,dark_ratio:.8}});

  const first = request("obs-voice-recover-1");
  assert.equal((await handleSupervisorRequest(first, env, new URL(first.url), deps)).status, 200);
  DB.age();

  DB.failBatchOnce();
  const failed = request("obs-voice-recover-2");
  await assert.rejects(handleSupervisorRequest(failed, env, new URL(failed.url), deps), /batch_failed/);
  assert.equal(DB.requests.has("obs-voice-recover-2"), false);
  assert.equal(DB.leases.size, 0);

  const retry = request("obs-voice-recover-3");
  const response = await handleSupervisorRequest(retry, env, new URL(retry.url), deps);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.transition, "incident_confirmed");
  assert.equal(data.voice, "Pantalla apagada");
  assert.equal(data.speech.once_key, "INC-RECOVER-1:screen_off");
  assert.equal(incidentCalls, 2, "el ticket se vuelve a pedir de forma idempotente, pero la voz no se pierde");
});

test("la voz se reclama una sola vez por ticket e incidencia aunque concurran observaciones", async () => {
  const DB = fakeDatabase();
  const env = {DB};
  const first = await claimSupervisorAlert(env, "jardinets-1", "INC-SUP-1", "screen_off", 1000);
  const second = await claimSupervisorAlert(env, "jardinets-1", "INC-SUP-1", "screen_off", 1001);
  assert.deepEqual(first, {claimed:true,onceKey:"INC-SUP-1:screen_off"});
  assert.deepEqual(second, {claimed:false,onceKey:"INC-SUP-1:screen_off"});
});
