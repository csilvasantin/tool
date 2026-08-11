import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const helperSource = fs.readFileSync(new URL("./highscore-desktop-app.js", import.meta.url), "utf8");
const sandbox = { module:{ exports:{} }, exports:{} };
vm.runInNewContext(identitySource, sandbox);
vm.runInNewContext(helperSource, sandbox);
const identity = sandbox.ykAgentIdentity;
const apps = sandbox.module.exports;

function payload(updated = 995) {
  return {
    control_machines:[{
      machine:"MacBookAirAzul", updated:995, slots:[
        {persona:"Neo",runtime:"Claude",host:"app",session_id:"desktop:claude"},
        {persona:"Trinity",runtime:"Codex",host:"app",session_id:"desktop:codex"},
        {persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith"},
      ],
    }],
    presence:[{
      persona:"Neo",machine:"MacBookAirAzul",runtime:"Claude",host:"app",session_id:"desktop:claude",
      pid:321,updated,verified:1,source:"process_snapshot",
    }],
  };
}

test("amarillo sólo significa process_snapshot verificado y fresco", () => {
  const rows = apps.items(payload(), identity, 1000);
  const neo = apps.find(rows, "NeoMBAAzul", "MBAAzul", identity);
  const trinity = apps.find(rows, "TrinityMBAAzul", "MBAAzul", identity);
  assert.equal(neo.active, true);
  assert.equal(neo.pid, 321);
  assert.equal(trinity.active, false);
  assert.equal(trinity.watcher, true);
  const stale = apps.find(apps.items(payload(940), identity, 1000), "NeoMBAAzul", "MBAAzul", identity);
  assert.equal(stale.active, false, "un latido viejo no puede dejar el icono amarillo");
});

test("el equipo forma parte de la identidad del toggle y no se cruza", () => {
  const rows = apps.items(payload(), identity, 1000);
  assert.equal(apps.find(rows, "NeoMBAAzul", "MBAPlata", identity), null);
  assert.equal(apps.find(rows, "SubNeoMBAAzul", "MBAAzul", identity), null,
    "una capa no puede apagar por accidente la app principal");
  assert.equal(apps.find(rows, "SmithMBAAzul", "MBAAzul", identity), null,
    "una ranura CLI no se presenta como DesktopAPP apagada");
});

test("start y stop envían el destino exacto y stop conserva el PID verificado", () => {
  const neo = apps.find(apps.items(payload(), identity, 1000), "NeoMBAAzul", "MBAAzul", identity);
  assert.deepEqual(JSON.parse(JSON.stringify(apps.target(neo, "start"))), {
    action:"start",machine:"MacBookAirAzul",persona:"Neo",runtime:"Claude",host:"app",session_id:"desktop:claude",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(apps.target(neo, "stop"))), {
    action:"stop",machine:"MacBookAirAzul",persona:"Neo",runtime:"Claude",host:"app",session_id:"desktop:claude",pid:321,
  });
});

test("el corredor visible es un switch real, amarillo encendido y gris apagado", () => {
  assert.match(html, /class="agent-scope-running" type="button" role="switch" data-agent-desktop-app=/);
  assert.match(html, /aria-checked="' \+ active/);
  assert.match(html, /\.agent-scope-running\[aria-checked="true"\][^{]*\{[^}]*color:var\(--accent\)/);
  assert.match(html, /\.agent-scope-running\{[^}]*color:var\(--dim\)/);
  assert.match(html, /hsToggleDesktopApp\(button\.getAttribute\("data-agent"\), button\.getAttribute\("data-team"\)\)/);
  assert.match(html, /fetch\(YK \+ "\/fleet\/agent\/control"/);
  assert.match(html, /hsVerifyDesktopApp\(item\.key, wanted, Date\.now\(\) \+ 45000\)/);
  assert.doesNotMatch(html, /data-agent-running-plus|Corredor extra:/);
});
