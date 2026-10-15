import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./ticket.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function notaCierre(){'),html.indexOf('window.addNote=async'));
function setup(){
 const note={value:''},listeners=[];
 const dialog={open:false,returnValue:'',addEventListener(name,fn){listeners.push(fn)},showModal(){this.open=true},close(value){this.open=false;this.returnValue=value;listeners.splice(0).forEach(fn=>fn())}};
 const calls=[];let renders=0;
 const ctx=vm.createContext({window:{},WORKER:'https://example.invalid',id:'INC-TEST1',$:id=>id==='tkClose'?dialog:note,fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));return{json:async()=>({ok:true})}},render:()=>renders++,alert:()=>{throw Error('unexpected alert')}});
 vm.runInContext(source,ctx);return{ctx,dialog,note,calls,renders:()=>renders};
}
test('abrir y cancelar el cierre nunca cambia el estado',async()=>{
 const t=setup();const pending=t.ctx.window.setStatus('resolved');assert.equal(t.dialog.open,true);assert.equal(t.calls.length,0);t.dialog.close('cancel');await pending;assert.equal(t.calls.length,0);
});
test('confirmar conserva la nota limitada y cierra una sola vez',async()=>{
 const t=setup();const pending=t.ctx.window.setStatus('resolved');t.note.value='  '+('x'.repeat(550))+'  ';t.dialog.close('confirm');await pending;assert.deepEqual(t.calls,[{id:'INC-TEST1',status:'resolved',author:'Técnico',note:'x'.repeat(500)}]);assert.equal(t.renders(),1);
});
test('escape y reentrada no envían cierres adicionales',async()=>{
 const t=setup();const pending=t.ctx.window.setStatus('resolved');await t.ctx.window.setStatus('resolved');assert.equal(t.calls.length,0);t.dialog.close('');await pending;assert.equal(t.calls.length,0);
});
test('pasar a en curso conserva el mismo endpoint y no pide nota',async()=>{
 const t=setup();await t.ctx.window.setStatus('in_progress');assert.equal(t.dialog.open,false);assert.deepEqual(t.calls,[{id:'INC-TEST1',status:'in_progress',author:'Técnico'}]);
});
