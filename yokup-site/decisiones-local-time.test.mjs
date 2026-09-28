import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./yk-decisions.js',import.meta.url),'utf8');
function api(zone) {
  const localIntl={DateTimeFormat:function(locale,opts){return new Intl.DateTimeFormat(locale,{timeZone:zone,...opts});}};
  const c=vm.createContext({window:{},Intl:localIntl});vm.runInContext(source,c);return c.window.YkDecisions._test;
}
for(const [zone,day,hour] of [['Europe/Madrid','2026-09-28','00'],['America/Los_Angeles','2026-09-27','15'],['Asia/Tokyo','2026-09-28','07']]) {
  test(`fecha y grupo horario usan la zona del usuario: ${zone}`,()=>{
    const t=api(zone),row={created_at:Date.parse('2026-09-27T22:13:49Z')};
    assert.equal(t.decisionInRange(row,'custom',day),true);
    const group=t.decisionHourGroups([row])[0];assert.equal(group.day,day);assert.equal(group.hour,hour);
    assert.equal(t.decisionInRange(row,'today','',Date.parse('2026-09-28T07:30:00Z')),zone!=='America/Los_Angeles');
  });
}
test('ayer y últimos 7 días respetan el cambio de mes y el horario de verano',()=>{
  const t=api('Europe/Madrid');
  const now=Date.parse('2026-03-29T22:30:00Z'); // 30 marzo local, tras DST
  const yesterday={created_at:Date.parse('2026-03-28T23:30:00Z')};
  assert.equal(t.decisionInRange(yesterday,'yesterday','',now),true);
  assert.equal(t.decisionInRange(yesterday,'7days','',now),true);
  assert.equal(t.decisionInRange({created_at:Date.parse('2026-03-23T22:30:00Z')},'7days','',now),false);
});
