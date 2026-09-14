import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopTurnParticipant,desktopTurnParticipants} from '../src/desktop-turn-participant.js';
const now=1788602000000,birth=now-3600000;
const row=(persona='NeoMBP14',runtime='Claude')=>({persona,machine:'admira-macbookpronegro14',runtime,host:'app',session_id:'desktop:'+runtime.toLowerCase(),pid:33,process_birth:birth,source:'process_snapshot',verified:1,updated:now,
 app_turn:{state:'active',turn_key:'a'.repeat(64),started_at:now-60000,observed_at:now,ended_at:null,process_birth:birth,basis:runtime==='Claude'?'claude_desktop_transcript':'codex_desktop_turn_store'}});
test('Claude and Codex verified active turns have independent session clocks and no invented mission or score',()=>{
 const rows=desktopTurnParticipants([row(),row('TrinityMBP14','Codex')],now);
 assert.equal(rows.length,2);
 for(const p of rows){assert.equal(p.kind,'session');assert.equal(p.reference,'');assert.equal(p.elapsed_ms,60000);assert.equal(p.machine,'MBP14');assert.equal(p.title,'Actividad Desktop APP');assert.equal(p.session_basis,'verified_app_turn');assert.equal(p.activity_expires_at,now+30000);for(const k of ['points','total','mission_id','work_ref'])assert.equal(p[k],undefined);}
});
test('missing, stale, future, ended, foreign or wrong process evidence never becomes a participant',()=>{
 const base=row();
 for(const patch of [{app_turn:null},{host:'cli'},{verified:0},{source:'heartbeat'},{pid:0},{session_id:''},{updated:now-30001},{updated:now+5001},{process_birth:birth+1},{persona:'NeoMacMini'},{machine:'MacMini'}])assert.equal(desktopTurnParticipant({...base,...patch},now),null,JSON.stringify(patch));
 for(const patch of [{state:'ended'},{ended_at:now},{state:'ended',ended_at:now-600001},{state:'ended',ended_at:now-120000,started_at:now-60000},{observed_at:now-120001},{observed_at:now+5001},{started_at:now+1},{started_at:birth-1},{process_birth:birth+1},{basis:'unverified'},{turn_key:'raw-session-name'}])assert.equal(desktopTurnParticipant({...base,app_turn:{...base.app_turn,...patch}},now),null,JSON.stringify(patch));
});
test('duplicate snapshots collapse while concurrent process incarnations remain ambiguous',()=>{
 const a=row();assert.equal(desktopTurnParticipants([a,a],now).length,1);
 assert.equal(desktopTurnParticipants([a,{...a,pid:34}],now).length,0);
 assert.equal(desktopTurnParticipants([a],now+30001).length,0);
});

test('un turno verificado TERMINADO hace menos de 10 min mantiene la calle con el reloj parado; más tarde cae (Carlos, 14-sep-2026)',()=>{
 const r=row(); const ended={...r,app_turn:{...r.app_turn,state:'ended',started_at:now-300000,observed_at:now-90000,ended_at:now-90000}};
 const p=desktopTurnParticipant(ended,now);
 assert.ok(p); assert.equal(p.state,'running'); assert.equal(p.turn_state,'ended'); assert.equal(p.ended_at,now-90000);
 assert.equal(p.elapsed_ms,210000); assert.equal(p.activity_at,now-90000); assert.equal(p.activity_expires_at,now+30000);
 // La observación puede ser antigua (el observador deja de refrescar al terminar el turno): manda ended_at
 const old={...ended,app_turn:{...ended.app_turn,observed_at:now-400000,ended_at:now-400000,started_at:now-500000}};
 assert.ok(desktopTurnParticipant(old,now)); assert.equal(desktopTurnParticipant(old,now+200001+30000),null,'presencia caducada (30 s)');
 assert.equal(desktopTurnParticipant({...old,updated:Math.floor((now+200001)/1000)},now+200001),null,'más de 10 min tras el fin');
 assert.equal(desktopTurnParticipants([ended],now).length,1);
});
