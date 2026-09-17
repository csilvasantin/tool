import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SUPERVISOR_MODEL,
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

function fakeDatabase() {
  let station = null;
  const observations = [];
  const requests = new Map();
  const alerts = new Set();
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async first() {
      if (sql.startsWith("SELECT * FROM supervisor_stations")) return station;
      if (sql.startsWith("SELECT status,response_json,updated_at FROM supervisor_requests")) return requests.get(args[0]) || null;
      return null;
    },
    async all() {
      if (sql.includes("FROM supervisor_observations")) return {results:observations.slice().reverse()};
      return {results:[]};
    },
    async run() {
      if (sql.startsWith("INSERT INTO supervisor_stations")) {
        station = {
          id:args[0],project_id:args[1],label:args[2],location:args[3],canonical_screen:args[4],expected_screens:args[5],
          status:args[6],issue_code:args[7],confidence:args[8],summary:args[9],visible_screens:args[10],active_screens:args[11],
          consecutive_failures:args[12],open_ticket_id:args[13],last_seen_at:args[14],last_alert_at:args[15],updated_by:args[16]
        };
      } else if (sql.startsWith("INSERT INTO supervisor_observations")) {
        observations.push({id:args[0],captured_at:args[2],observed_at:args[3],status:args[4],issue_code:args[5],confidence:args[6],visible_screens:args[7],active_screens:args[8],summary:args[9],ticket_id:args[12]});
      } else if (sql.startsWith("INSERT OR IGNORE INTO supervisor_requests")) {
        if (requests.has(args[0])) return {meta:{changes:0}};
        requests.set(args[0], {status:"processing",response_json:null,updated_at:args[4]});
      } else if (sql.startsWith("INSERT OR IGNORE INTO supervisor_alerts")) {
        if (alerts.has(args[0])) return {meta:{changes:0}};
        alerts.add(args[0]);
      } else if (sql.startsWith("UPDATE supervisor_requests SET status='done'")) {
        const row = requests.get(args[2]);
        if (row) requests.set(args[2], {status:"done",response_json:args[0],updated_at:args[1]});
      } else if (sql.startsWith("DELETE FROM supervisor_requests")) {
        requests.delete(args[0]);
      } else if (sql.startsWith("DELETE FROM supervisor_observations") && observations.length > 120) {
        observations.splice(0, observations.length - 120);
      }
      return {meta:{changes:1}};
    }
  });
  return {prepare:(sql) => statement(sql), station:() => station, age:() => { if (station) station.last_seen_at = Date.now() - 6000; }};
}

test("dos fotogramas apagados crean un único ticket y devuelven la voz robot", async () => {
  const DB = fakeDatabase(), incidents = [];
  const env = {DB, AI:{run:async () => ({answer:'{"scene_visible":true,"screens":[{"state":"off","confidence":0.97,"description":"sin luz"}],"summary":"La pantalla está apagada."}'})}};
  const deps = {
    json:(body,status=200) => new Response(JSON.stringify(body), {status,headers:{"content-type":"application/json"}}),
    ensureSchema:async () => {},
    createIncident:async (_env, body) => { incidents.push(body); return "INC-SUP-1"; },
    resolveIncident:async () => null,
    addEvent:async () => {},
    session:{email:"csilva@admira.com"}
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
  assert.equal(incidents[0].resource, "CanalKiosk:Jardinets:DGX");
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

test("la voz se reclama una sola vez por ticket e incidencia aunque concurran observaciones", async () => {
  const DB = fakeDatabase();
  const env = {DB};
  const first = await claimSupervisorAlert(env, "jardinets-1", "INC-SUP-1", "screen_off", 1000);
  const second = await claimSupervisorAlert(env, "jardinets-1", "INC-SUP-1", "screen_off", 1001);
  assert.deepEqual(first, {claimed:true,onceKey:"INC-SUP-1:screen_off"});
  assert.deepEqual(second, {claimed:false,onceKey:"INC-SUP-1:screen_off"});
});
