import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
// ITIL (FLT-101300): vista «Inventario ITIL» del portal del comercio (también en «Ver como» marca).
test('portal del comercio: Inventario ITIL por Xpacio con grupos, códigos, chip de garantía y alta/edición en el mismo look',()=>{
 const html=read('retailer.html'),js=read('retailer-itil.js'),css=read('retailer-itil.css');
 assert.match(html,/\/retailer-itil\.js\?v=\d+/);assert.match(html,/\/retailer-itil\.css\?v=\d+/);
 assert.match(html,/id="itil" class="itil"/);assert.match(html,/Inventario ITIL/);assert.match(html,/id="itil-dialog"/);assert.match(html,/id="itil-retire-dialog"/);
 assert.ok(html.indexOf('id="itil"')>html.indexOf('id="workspace"')&&html.indexOf('id="itil"')<html.indexOf('id="agent-connections"'),'dentro del espacio de trabajo: se oculta con la sesión');
 for(const f of ['itil_code','name','category','role','group_name','position','orientation','parent_itil_code','manufacturer','model','serial','supplier','purchase_date','invoice_ref','warranty_start','warranty_end','installed_at','installed_by','maintenance_interval_days','note'])assert.match(html,new RegExp('name="'+f+'"'),f);
 assert.match(html,/pattern="\[A-Z0-9\]\{2,12\}\(-\[A-Z0-9\]\{2,12\}\)\{1,3\}"/);
 for(const c of ['pantalla','player','tpv','audio','iot','red','kiosk','mobiliario','iluminacion','otro'])assert.match(html,new RegExp('<option value="'+c+'">'));
 assert.doesNotMatch(js,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
 assert.match(js,/api\('\/itil'\)/);assert.match(js,/'\/itil\/inventory\?site_id='/);assert.match(js,/api\('\/itil\/cis',body\)/);assert.match(js,/'\/retire'/);assert.match(js,/adopt_device_id/);
 for(const chip of ['chip-ok','chip-warn','chip-bad','chip-none'])assert.match(js,new RegExp(chip));
 assert.match(js,/portal-auth/);assert.match(js,/can_edit/);assert.match(js,/credentials:'include'/);
 assert.match(css,/\.itil-cards/);assert.match(css,/@media\(max-width:650px\)/);
});
