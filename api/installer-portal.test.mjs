import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleInstaller,distanceKm,ingestEvent,sweepInstallers} from './src/installer-portal.js';
import {setup,call,account,event,signed} from './test-fixture.mjs';
test('geography: antimeridian, poles and strict 40 km boundary',()=>{
 assert.ok(distanceKm({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<23);
 const p={latitude:0,longitude:0};
 assert.ok(distanceKm(p,{latitude:39.999/6371.0088*180/Math.PI,longitude:0})<40);
 assert.ok(distanceKm(p,{latitude:40.001/6371.0088*180/Math.PI,longitude:0})>40);
 assert.ok(distanceKm({latitude:90,longitude:0},{latitude:90,longitude:100})<0.0001);
});
test('registration persists private profile, HttpOnly cookie and rejects missing auth/CSRF',async()=>{
 const {env,db}=setup(), a=account(), reg=await call(env,'/register',a);
 assert.equal(reg.status,201);assert.ok(reg.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));
 assert.equal(reg.body.profile.email,a.email);assert.equal(reg.body.profile.password_hash,undefined);
 assert.equal(reg.body.profile.radius_km,40);assert.equal(reg.body.profile.notify_zone,true);
 assert.notEqual(db.prepare('SELECT password_hash FROM installer_accounts').get().password_hash,a.password);
 assert.equal((await call(env,'/me')).status,401);
 assert.equal((await call(env,'/me',undefined,reg.cookie)).status,200);
 assert.equal((await call(env,'/me',undefined,reg.cookie)).body.profile.radius_km,40);
 assert.equal((await call(env,'/me',a,reg.cookie,'PATCH','https://evil.example')).status,403);
 assert.equal((await call(env,'/register',a)).status,409);
 assert.equal((await call(env,'/login',{email:a.email,password:'wrong-password-123'})).status,401);
 assert.equal((await call(env,'/login',{email:a.email,password:a.password})).status,200);
 await call(env,'/logout',{},reg.cookie);
 assert.equal((await call(env,'/me',undefined,reg.cookie)).status,401);
});
test('DEMO and radius_km persist on profile; notify_zone false skips alerts; wider radius receives farther jobs',async()=>{
 const {env,db}=setup();
 const demo=await call(env,'/register',account({available:true,demo:true,radius_km:40}));
 assert.equal(demo.status,201);assert.equal(demo.body.profile.available,false);assert.equal(demo.body.profile.radius_km,40);assert.equal(demo.body.profile.demo,true);
 const quiet=await call(env,'/register',account({notify_zone:false}));
 const far=await call(env,'/register',account({latitude:41.3874+(50/6371.0088)*180/Math.PI,radius_km:80}));
 await ingestEvent(await signed(env,event()),env);
 const notified=db.prepare('SELECT installer_id FROM installer_notifications').all().map(r=>r.installer_id);
 assert.ok(!notified.includes(demo.body.profile.id));
 assert.ok(!notified.includes(quiet.body.profile.id));
 assert.ok(notified.includes(far.body.profile.id));
});
test('invalid input cannot create partial accounts and auth limits apply',async()=>{
 const {env,db}=setup();
 for(const patch of [{latitude:null},{latitude:91},{longitude:181},{skills:[]},{country:'Spain'},{password:'short'}]) assert.equal((await call(env,'/register',account(patch))).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_accounts').get().n,0);
 for(let n=0;n<20;n++)await call(env,'/login',{email:'rate@example.test',password:'incorrect-1234'});
 assert.equal((await call(env,'/login',{email:'rate@example.test',password:'incorrect-1234'})).status,429);
});
test('signed fault only notifies available nearby specialists, persists and deduplicates',async()=>{
 const {env,db}=setup();
 const near=await call(env,'/register',account());
 const far=await call(env,'/register',account({latitude:42}));
 const other=await call(env,'/register',account({skills:['audio']}));
 const unavailable=await call(env,'/register',account({available:false}));
 const e=event();await ingestEvent(await signed(env,e),env);await ingestEvent(await signed(env,e),env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_incidents').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_notifications').get().n,1);
 const inbox=(await call(env,'/inbox',undefined,near.cookie)).body.notifications;
 assert.equal(inbox.length,1);assert.equal(inbox[0].address,null);assert.equal(inbox[0].latitude,undefined);
 for(const user of [far,other,unavailable])assert.equal((await call(env,'/inbox',undefined,user.cookie)).body.notifications.length,0);
 await assert.rejects(()=>ingestEvent(signedDummy(),env));
 await assert.rejects(async()=>ingestEvent(await signed(env,{...e,title:'Different'}),env),/ya usado/);
 assert.equal(db.prepare('SELECT title FROM installer_incidents').get().title,e.title);
});
function signedDummy(){return new Request('https://data.yokup.com/api/installer/events',{method:'POST',body:'{}'});}
test('two installers cannot accept the same job; ownership is required to resolve',async()=>{
 const {env,db}=setup();const a=await call(env,'/register',account()),b=await call(env,'/register',account());
 const e=event();await ingestEvent(await signed(env,e),env);
 const id=encodeURIComponent(db.prepare('SELECT id FROM installer_incidents').get().id);
 const results=await Promise.all([call(env,`/incidents/${id}/accept`,{},a.cookie),call(env,`/incidents/${id}/accept`,{},b.cookie)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winner=results[0].status===200?a:b,loser=winner===a?b:a;
 assert.equal((await call(env,'/inbox',undefined,winner.cookie)).body.notifications[0].address,'Dirección privada 12');
 const resolution={resolution:'Cable HDMI sustituido y reproducción comprobada.'};
 assert.equal((await call(env,`/incidents/${id}/resolve`,resolution,loser.cookie)).status,409);
 assert.equal((await call(env,`/incidents/${id}/resolve`,resolution,winner.cookie)).status,200);
 await ingestEvent(await signed(env,e),env);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM installer_incidents WHERE status!='resolved'").get().n,0);
});
test('new faults during an open incident never reopen on later retry, stale events ignored',async()=>{
 const {env,db}=setup();const e1=event(), e2=event();
 await ingestEvent(await signed(env,e1),env);await ingestEvent(await signed(env,e2),env);
 db.exec("UPDATE installer_incidents SET status='resolved'");
 await ingestEvent(await signed(env,e2),env);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM installer_incidents WHERE status='open'").get().n,0);
 await ingestEvent(await signed(env,event({occurred_at:new Date(Date.now()-3600000).toISOString()})),env);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM installer_incidents WHERE status='open'").get().n,0);
});
test('missing heartbeat opens once, next sweep repairs missing notifications, no reopening until new heartbeat',async()=>{
 const {env,db}=setup();await call(env,'/register',account());
 await ingestEvent(await signed(env,event({type:'heartbeat',occurred_at:new Date(Date.now()-180000).toISOString()})),env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_incidents').get().n,0);
 await sweepInstallers(env);await sweepInstallers(env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_incidents').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_notifications').get().n,1);
 db.exec("UPDATE installer_incidents SET status='resolved'");await sweepInstallers(env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_incidents').get().n,1);
});
test('webhook fails closed without a secret or with expired/invalid signature',async()=>{
 const {env}=setup(),r=await signed(env,event(),{'X-Admira-Timestamp':'1000000000'});
 assert.equal((await handleInstaller(r,env)).status,401);
 delete env.INSTALLER_ADMIRA_SECRET;
 assert.equal((await handleInstaller(signedDummy(),env)).status,503);
});

test('bounding prefilter keeps installers across antimeridian and near pole',async()=>{
 const {env,db}=setup();
 await call(env,'/register',account({latitude:0,longitude:-179.9}));
 await call(env,'/register',account({latitude:89.99,longitude:120}));
 const e=event();e.device={...e.device,id:'dateline',latitude:0,longitude:179.9};
 await ingestEvent(await signed(env,e),env);
 const p=event();p.device={...p.device,id:'pole',latitude:89.99,longitude:0};
 await ingestEvent(await signed(env,p),env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_notifications').get().n,2);
});
test('moving away or changing specialties revokes acceptance eligibility',async()=>{
 const {env,db}=setup(), original=account(),a=await call(env,'/register',original);
 await ingestEvent(await signed(env,event()),env);
 const id=encodeURIComponent(db.prepare('SELECT id FROM installer_incidents').get().id);
 await call(env,'/me',{...original,latitude:45},a.cookie,'PATCH');
 assert.equal((await call(env,`/incidents/${id}/accept`,{},a.cookie)).status,403);
 await call(env,'/me',{...original,skills:['audio']},a.cookie,'PATCH');
 assert.equal((await call(env,`/incidents/${id}/accept`,{},a.cookie)).status,403);
});
