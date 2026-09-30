import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
test('portal del comercio: «Ver como», ficha del equipo y garantías con assets versionados y solo textContent',()=>{
 const html=read('retailer.html'),incident=read('retailer-incidencia.html'),js=read('retailer-portal.js'),accounts=read('retailer-accounts.js');
 for(const page of [html,incident]){assert.match(page,/id="account-switch"/);assert.match(page,/\/retailer-accounts\.js\?v=\d+/);assert.match(page,/\/retailer-portal\.css\?v=4/);}
 assert.match(html,/\/retailer-portal\.js\?v=8/);assert.match(html,/id="lifecycle-dialog"/);assert.match(html,/Garantías por vencer/);assert.match(html,/id="device-state"/);
 for(const f of ['category','status','manufacturer','model','serial','supplier','purchase_date','invoice_ref','warranty_start','warranty_end','installed_at','installed_by','maintenance_interval_days','last_maintenance_at','retired_at','notes'])assert.match(html,new RegExp('name="'+f+'"'),f);
 for(const src of [js,accounts])assert.doesNotMatch(src,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
 assert.match(js,/'\/lifecycle',body,'PUT'\)/);assert.match(js,/chip-ok/);assert.match(js,/chip-warn/);assert.match(js,/chip-bad/);assert.match(js,/chip-none/);
 assert.match(accounts,/call\('\/switch',\{retailer_id:select\.value\}\)/);assert.match(accounts,/call\('\/accounts'\)/);
});
