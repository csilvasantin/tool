import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [html,js,frame,worker]=await Promise.all(['supervisor.html','yk-supervisor-demo.js','yk-frame.js','../yokup-rtc/src/index.js'].map(file=>readFile(new URL(file,import.meta.url),'utf8')));
test('demo incidence keeps the existing camera controller and has a separate real inbox',()=>{
  for(const id of ['supervisorDemo','demoStatus','demoList','demoDetail','demoBefore','demoAfter','demoCause','demoAction','demoPhoto','demoLocalPreview','demoCaptured','demoReviewed','demoClear','demoReceipt','demoClose','demoReport'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/src="\/yk-supervisor-demo\.js\?v=1"/);assert.match(html,/id="startButton"/);
  assert.doesNotMatch(js,/getUserMedia|localStorage|window\.open|\.startButton\.click|innerHTML/);
});
test('/demo incidencia stays in this page and does not reach a remote agent CLI',()=>{
  assert.match(frame,/arg === "incidencia" && window\.SupervisorDemo/);
  const adapter=frame.slice(frame.indexOf('arg === "incidencia"'),frame.indexOf('arg !== "idioma"'));
  assert.match(adapter,/stopImmediatePropagation/);assert.match(adapter,/SupervisorDemo\.open/);
});
test('private evidence is denied on the public media route before R2 is accessed',()=>{
  const media=worker.slice(worker.indexOf('if (url.pathname.startsWith("/media/")'),worker.indexOf('// POST /media →'));
  assert.ok(media.indexOf('key.startsWith("supervisor-demo/")')<media.indexOf('env.MEDIA.get(key)'));
  const route=worker.slice(worker.indexOf('if (url.pathname.startsWith("/supervisor/"))'),worker.indexOf('if (PROTECTED.has(url.pathname)'));
  assert.ok(route.indexOf('requireAuth')<route.indexOf('handleSupervisorDemo'));assert.ok(route.indexOf('currentSupervisorAccess')<route.indexOf('handleSupervisorDemo'));
});
