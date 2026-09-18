import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPERVISOR_DEFAULT_PROJECT_ID,
  SUPERVISOR_DEFAULT_PROJECT_LABEL,
  normalizeAccessDirectory,
  resolveSupervisorProject,
  supervisorAccessForSession,
  supervisorSessionInfo
} from "./src/supervisor-access.js";

test("el directorio normaliza correos y sólo acepta superusuarios que también están en whitelist", () => {
  const directory = normalizeAccessDirectory({
    emails:[" Viewer@Example.com ", "admin@example.com", "admin@example.com", "no-es-correo"],
    superusers:[" ADMIN@example.com ", "fuera@example.com", "tampoco-es-correo"]
  });

  assert.deepEqual([...directory.emails].sort(), ["admin@example.com", "viewer@example.com"]);
  assert.deepEqual([...directory.superusers], ["admin@example.com"]);
  assert.deepEqual(normalizeAccessDirectory(null), {emails:new Set(), superusers:new Set()});
});

test("la capacidad de cambiar proyecto nace del directorio, no de claims manipulables de la sesión", () => {
  const directory = normalizeAccessDirectory({
    emails:["viewer@example.com", "admin@example.com"],
    superusers:["admin@example.com"]
  });

  assert.deepEqual(supervisorAccessForSession(directory, {
    email:"viewer@example.com", role:"superuser", is_superuser:true,
    capabilities:{supervisor_project_switch:true}
  }), {
    defaultProjectId:SUPERVISOR_DEFAULT_PROJECT_ID,
    defaultProjectLabel:SUPERVISOR_DEFAULT_PROJECT_LABEL,
    allowed:true,
    canChangeProject:false
  });
  assert.equal(supervisorAccessForSession(directory, {email:" ADMIN@EXAMPLE.COM "}).canChangeProject, true);
  assert.equal(supervisorAccessForSession(directory, {email:"fuera@example.com"}).allowed, false);
  assert.equal(supervisorAccessForSession(directory, {email:"fuera@example.com"}).canChangeProject, false);
});

test("un usuario normal queda fijado a admira-tv y un superusuario puede elegir otro proyecto", () => {
  const viewer = {defaultProjectId:SUPERVISOR_DEFAULT_PROJECT_ID, allowed:true, canChangeProject:false};
  const admin = {...viewer, canChangeProject:true};

  assert.deepEqual(resolveSupervisorProject(viewer), {ok:true, projectId:"admira-tv"});
  assert.deepEqual(resolveSupervisorProject(viewer, " ADMIRA-TV "), {ok:true, projectId:"admira-tv"});
  assert.deepEqual(resolveSupervisorProject(viewer, "xpaceos"), {ok:false, status:403, error:"project_forbidden"});
  assert.deepEqual(resolveSupervisorProject(admin, " XpaceOS "), {ok:true, projectId:"xpaceos"});
  assert.deepEqual(resolveSupervisorProject(admin, "../secreto"), {ok:false, status:400, error:"project_id_required"});
  assert.deepEqual(resolveSupervisorProject({...viewer,allowed:false}), {ok:false,status:403,error:"supervisor_forbidden"});
});

test("la sesión pública expone sólo capability y proyecto por defecto, nunca el directorio", () => {
  const info = supervisorSessionInfo({
    defaultProjectId:"admira-tv",
    defaultProjectLabel:"admira.tv",
    canChangeProject:true,
    emails:new Set(["secret@example.com"]),
    superusers:new Set(["admin@example.com"])
  });

  assert.deepEqual(info, {
    capabilities:{supervisor_project_switch:true},
    defaults:{supervisor_project_id:"admira-tv", supervisor_project_label:"admira.tv"}
  });
  assert.equal(JSON.stringify(info).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(info).includes("admin@example.com"), false);
});
