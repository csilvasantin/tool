import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,stat,writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {diffSnapshots,fileRecord,inventoryDeployment,isPublicCandidate,manifestDigest,parseDeployments,readSnapshot,restoreSnapshot,verifySnapshot} from "./pages-snapshots.mjs";

const temp=()=>mkdtemp(join(tmpdir(),"yokup-snapshot-test-"));
const absent=async path=>{try{await stat(path);return false;}catch(e){return e.code==="ENOENT";}};
const signed=manifest=>({...manifest,integrity:{algorithm:"sha256",manifestSha256:manifestDigest(manifest)}});
async function fixtureServer(){
  const binary=Buffer.from([0,255,17,42]);
  const server=createServer((req,res)=>{
    if(req.url==="/"||req.url==="/index.html"||req.url==="/ghost"){res.setHeader("content-type","text/html");res.end('<script src="/app.js?v=v.03.08.2026.r1"></script><img src="/pixel.bin"><a href="/ghost">ghost</a>');}
    else if(req.url.startsWith("/app.js"))res.end("window.answer=42;\n");
    else if(req.url==="/pixel.bin")res.end(binary);
    else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  return{server,url:`http://127.0.0.1:${server.address().port}/`,binary};
}

test("inventario guarda bytes, manifiesto firmado y enlaces same-origin",async t=>{
  const root=await temp(),{server,url,binary}=await fixtureServer();t.after(()=>server.close());
  const manifest=await inventoryDeployment({url,outDir:root,paths:["pixel.bin"],deployment:{id:"dep-1"}});
  assert.equal(manifest.createdBy,"SubOraculoMini");assert.match(manifest.integrity.manifestSha256,/^[a-f0-9]{64}$/);assert.deepEqual(manifest.files.map(x=>x.path),["app.js","ghost","index.html","pixel.bin"]);
  const ghost=manifest.files.find(x=>x.path==="ghost");assert.equal(ghost.restorable,false);assert.equal(ghost.localPath,"");
  const pixel=manifest.files.find(x=>x.path==="pixel.bin");assert.deepEqual(await readFile(join(root,pixel.blob)),binary);await verifySnapshot(root);
});

test("lista plural de Cloudflare se normaliza y las herramientas no son assets",()=>{
  assert.deepEqual(parseDeployments({result:[{id:"a",url:"https://a.pages.dev",environment:"production"},{deployment_id:"b",aliases:["https://b.pages.dev"]}]}).map(x=>x.id),["a","b"]);
  assert.equal(isPublicCandidate("pages-snapshots.mjs"),false);assert.equal(isPublicCandidate("pages-snapshots.test.mjs"),false);assert.equal(isPublicCandidate("index.html"),true);
});

test("Wrangler 4.81 capitalizado produce deployments reales",()=>{
  const rows=parseDeployments([{Id:"abc-123",Environment:"Production",Deployment:"https://abc-123.yokup.pages.dev",Status:"Success"},{Id:"def-456",Environment:"Preview",Deployment:"https://def-456.yokup.pages.dev",Status:"Success"}]);
  assert.deepEqual(rows,[{id:"abc-123",url:"https://abc-123.yokup.pages.dev",environment:"Production",created_on:""},{id:"def-456",url:"https://def-456.yokup.pages.dev",environment:"Preview",created_on:""}]);
});

test("diff semántico separa sello efímero de cambio real",()=>{
  const rec=(path,value)=>fileRecord(path,Buffer.from(value));
  const left={files:[rec("index.html",'<script src="/app.js?v=v.03.08.2026.r1"></script>'),rec("app.js","window.answer=42;"),rec("data.json",'{"b":2,"a":1}') ]};
  const right={files:[rec("index.html",'<script src="/app.js?v=v.03.08.2026.r2"></script>'),rec("app.js","window.answer=43;"),rec("data.json",'{"a":1,"b":2}') ]};
  const diff=diffSnapshots(left,right);assert.deepEqual(diff.metadataOnly,["data.json","index.html"]);assert.deepEqual(diff.semanticChanged,["app.js"]);
});

test("alias /highscore y highscore.html tratan el sello rN como metadato",()=>{
  const html=revision=>Buffer.from(`<!doctype html><script src="/game.js?v=r${revision}"></script>`);
  const left={files:[fileRecord("highscore",html(1),"text/html; charset=utf-8"),fileRecord("highscore.html",html(1),"text/html")]};
  const right={files:[fileRecord("highscore",html(2),"text/html; charset=utf-8"),fileRecord("highscore.html",html(2),"text/html")]};
  assert.deepEqual(left.files.map(x=>x.kind),["text","text"]);assert.deepEqual(diffSnapshots(left,right).metadataOnly,["highscore","highscore.html"]);
});

test("sniff reconoce HTML sin extensión pero conserva binario real sin extensión",()=>{
  assert.equal(fileRecord("agentes",Buffer.from("<!doctype html><title>Agentes</title>")).kind,"text");
  const binary=fileRecord("payload",Buffer.from([0,255,60,1]),"application/octet-stream");
  assert.equal(binary.kind,"binary");assert.equal(binary.semanticSha256,binary.sha256);
});

test("query funcional no se confunde con cache-buster",()=>{
  const left={files:[fileRecord("index.html",Buffer.from('<a href="/feature?v=paid">Plan</a>'))]},right={files:[fileRecord("index.html",Buffer.from('<a href="/feature?v=free">Plan</a>'))]};
  assert.deepEqual(diffSnapshots(left,right).semanticChanged,["index.html"]);
});

test("espacios y saltos dentro de contenido preformateado siguen siendo semánticos",()=>{
  const jsA='window.label=`línea con espacios   \n\n\nfin`;\n';
  const jsB='window.label=`línea con espacios\n\nfin`;\n';
  const htmlA='<pre>línea con espacios   \n\n\nfin</pre>';
  const htmlB='<pre>línea con espacios\n\nfin</pre>';
  const left={files:[fileRecord("app.js",Buffer.from(jsA)),fileRecord("index.html",Buffer.from(htmlA))]};
  const right={files:[fileRecord("app.js",Buffer.from(jsB)),fileRecord("index.html",Buffer.from(htmlB))]};
  assert.deepEqual(diffSnapshots(left,right).semanticChanged,["app.js","index.html"]);
});

test("un HTML físico idéntico al shell no se descarta como fallback",async t=>{
  const body='<!doctype html><title>Shell compartido</title>';
  const server=createServer((req,res)=>{
    if(req.url==="/index.html"||req.url==="/twin.html")res.end(body);
    else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());
  const root=await temp(),url=`http://127.0.0.1:${server.address().port}/`;
  const manifest=await inventoryDeployment({url,outDir:root,paths:["twin.html"]});
  const twin=manifest.files.find(x=>x.path==="twin.html");
  assert.ok(twin,"twin.html físico debe constar en el inventario");
  assert.equal(twin.restorable,true);
});

test("candidatos críticos no servidos quedan explícitos en coverage",async t=>{
  const shell='<!doctype html><title>Shell</title>',source=await temp();await mkdir(join(source,"functions/api"),{recursive:true});
  for(const [path,body] of [["_headers","headers"],["_redirects","redirects"],["_routes.json","{}"],["functions/api/fleet-census.js","export default {}"]])await writeFile(join(source,path),body);
  const server=createServer((req,res)=>{if(req.url==="/index.html"||req.url==="/_headers")res.end(shell);else{res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());const root=await temp();
  const manifest=await inventoryDeployment({url:`http://127.0.0.1:${server.address().port}/`,outDir:root,sourceRoot:source});
  const missing=new Map(manifest.coverage.unavailable.map(x=>[x.path,x]));
  for(const path of ["_headers","_redirects","_routes.json","functions/api/fleet-census.js"]){assert.equal(missing.get(path)?.critical,true);assert.equal(manifest.files.some(x=>x.path===path),false);}
  assert.equal(missing.get("_headers").reason,"ambiguous-index-response");assert.equal(missing.get("_redirects").reason,"http-404");await verifySnapshot(root);
});

test("enlaces relativos conservan su directorio y un fallback SPA no se vuelve asset restaurable",async t=>{
  const shell='<!doctype html><title>Shell</title>',shot=Buffer.from([1,2,3,4]);
  const server=createServer((req,res)=>{
    if(req.url==="/index.html"||req.url==="/auth-gate.js"||req.url==="/proof/ghost.jpg"){
      res.setHeader("content-type","text/html");res.end(shell);
    }else if(req.url==="/proof/page.html"){
      res.setHeader("content-type","text/html");res.end('<img src="shot.jpg"><img src="ghost.jpg"><script>const x=`<img src="${pc.img}">`</script>');
    }else if(req.url==="/proof/shot.jpg"){
      res.setHeader("content-type","image/jpeg");res.end(shot);
    }else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());
  const root=await temp(),url=`http://127.0.0.1:${server.address().port}/`;
  const manifest=await inventoryDeployment({url,outDir:root,paths:["proof/page.html","auth-gate.js"]});
  assert.ok(manifest.files.some(x=>x.path==="proof/shot.jpg"&&x.restorable));
  assert.equal(manifest.files.some(x=>x.path==="shot.jpg"),false);
  assert.equal(manifest.files.some(x=>x.path==="auth-gate.js"),false);
  assert.equal(manifest.files.some(x=>x.path.includes("${")),false);
  assert.ok(manifest.coverage.unavailable.some(x=>x.path==="auth-gate.js"&&x.reason==="ambiguous-index-response"));
});

test("once fallbacks con extensión y expresiones inline nunca se restauran",async t=>{
  const falseAssets=["auth-gate.js","FLT-1140-before.jpg","FLT-1140-after.jpg","FLT-1112.jpg","marketplace.html","panel.html","report.jpg","proof.jpg","capture.jpg","avatar.jpg","missing.css"];
  const tags=falseAssets.map(path=>path.endsWith(".html")?`<a href="/${path}">x</a>`:`<img src="/${path}">`).join("");
  const shell=`<!doctype html>${tags}<img src="\${AF_YOKUP}"><script>const a="<img src='\${esc(src)}'>";const b='\${pc.img}';const c='\${YOKUP_MISION}'</script>`;
  const server=createServer((req,res)=>{res.setHeader("content-type","text/html");res.end(shell);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());const snapshot=await temp(),target=await temp();
  const manifest=await inventoryDeployment({url:`http://127.0.0.1:${server.address().port}/`,outDir:snapshot});
  for(const path of falseAssets){assert.equal(manifest.files.some(x=>x.path===path&&x.restorable),false);assert.ok(manifest.coverage.unavailable.some(x=>x.path===path));}
  assert.equal(manifest.coverage.requested.some(x=>/[{}]|%7B/i.test(x)),false);
  await restoreSnapshot({snapshotDir:snapshot,targetDir:target,apply:true,backupDir:join(target,"backup")});
  for(const path of falseAssets)assert.equal(await absent(join(target,path)),true);
});

test("version.json ignora sólo procedencia volátil",()=>{
  const rec=value=>fileRecord("version.json",Buffer.from(JSON.stringify(value))),base={note:"baseline",featureFlag:"on"};
  const a={files:[rec({...base,version:"r1",deployedAt:"ayer",git:"aaa",deployer:"NeoMBP16"})]},b={files:[rec({...base,version:"r2",deployedAt:"hoy",git:"bbb",deployer:"OraculoMacMini"})]};
  assert.deepEqual(diffSnapshots(a,b).metadataOnly,["version.json"]);
  const c={files:[rec({...base,featureFlag:"off",version:"r2"})]};assert.deepEqual(diffSnapshots(a,c).semanticChanged,["version.json"]);
});

test("restore es dry-run, respalda sobrescritos y preserva exclusivos",async t=>{
  const snapshot=await temp(),target=await temp(),backup=await temp(),{server,url,binary}=await fixtureServer();t.after(()=>server.close());
  await inventoryDeployment({url,outDir:snapshot,paths:["pixel.bin"]});
  await writeFile(join(target,"index.html"),"ORIGINAL");await writeFile(join(target,"exclusive.txt"),"NO TOCAR");
  const dryBackup=join(target,"no-creado"),dry=await restoreSnapshot({snapshotDir:snapshot,targetDir:target,backupDir:dryBackup});
  assert.equal(dry.applied,false);assert.equal(await readFile(join(target,"index.html"),"utf8"),"ORIGINAL");assert.equal(await absent(dryBackup),true);
  const done=await restoreSnapshot({snapshotDir:snapshot,targetDir:target,apply:true,backupDir:backup});
  assert.equal(done.applied,true);assert.match(await readFile(join(target,"index.html"),"utf8"),/app\.js/);assert.deepEqual(await readFile(join(target,"pixel.bin")),binary);
  assert.equal(await readFile(join(backup,"index.html"),"utf8"),"ORIGINAL");assert.equal(await readFile(join(target,"exclusive.txt"),"utf8"),"NO TOCAR");
});

test("clean route y directorio físico coexisten; sólo el físico se restaura",async t=>{
  const icon=Buffer.from([0x89,0x50,0x4e,0x47,1,2,3]),server=createServer((req,res)=>{if(req.url==="/"||req.url==="/index.html")res.end('<a href="/app">App</a>');else if(req.url==="/app")res.end('<img src="/app/icon.png">');else if(req.url==="/app/icon.png"){res.setHeader("content-type","image/png");res.end(icon);}else{res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());const snapshot=await temp(),target=await temp(),source=await temp();await mkdir(join(source,"app"),{recursive:true});await writeFile(join(source,"app/icon.png"),icon);
  const manifest=await inventoryDeployment({url:`http://127.0.0.1:${server.address().port}/`,outDir:snapshot,sourceRoot:source});const alias=manifest.files.find(x=>x.path==="app"),asset=manifest.files.find(x=>x.path==="app/icon.png");
  assert.equal(alias.restorable,false);assert.equal(alias.localPath,"");assert.equal(asset.restorable,true);assert.equal(asset.localPath,"app/icon.png");assert.notEqual(alias.blob,asset.blob);
  await restoreSnapshot({snapshotDir:snapshot,targetDir:target,apply:true,backupDir:join(target,"backup")});assert.equal(await absent(join(target,"app")),false);assert.equal((await stat(join(target,"app"))).isDirectory(),true);assert.deepEqual(await readFile(join(target,"app/icon.png")),icon);
});

test("backup ocupado falla antes de escribir y post-write inválido revierte",async t=>{
  const snapshot=await temp(),target=await temp(),occupied=await temp(),backup=await temp(),{server,url}=await fixtureServer();t.after(()=>server.close());await inventoryDeployment({url,outDir:snapshot});
  await writeFile(join(target,"index.html"),"ORIGINAL");await writeFile(join(occupied,"OLDER_BACKUP"),"PRESERVAR");
  await assert.rejects(()=>restoreSnapshot({snapshotDir:snapshot,targetDir:target,apply:true,backupDir:occupied}),/Backup no vacío/);
  assert.equal(await readFile(join(target,"index.html"),"utf8"),"ORIGINAL");assert.equal(await readFile(join(occupied,"OLDER_BACKUP"),"utf8"),"PRESERVAR");
  await assert.rejects(()=>restoreSnapshot({snapshotDir:snapshot,targetDir:target,apply:true,backupDir:backup,afterWrite:async({path,dest})=>{if(path==="index.html")await writeFile(dest,"TAMPER");}}),/post-write/);
  assert.equal(await readFile(join(target,"index.html"),"utf8"),"ORIGINAL");assert.equal(await readFile(join(backup,"index.html"),"utf8"),"ORIGINAL");assert.equal(await absent(join(target,"app.js")),true);
});

test("integridad rechaza traversal, duplicados y blob corrupto o ausente",async t=>{
  const root=await temp(),{server,url}=await fixtureServer();t.after(()=>server.close());await inventoryDeployment({url,outDir:root});const original=await readSnapshot(root);
  const {integrity,...base}=original;await assert.rejects(()=>verifySnapshot(root,base),/Falta digest/);
  const forged=files=>signed({...base,coverage:{requested:files.map(x=>x.path),stored:files.map(x=>x.path),unavailable:[]},files});
  for(const path of ["../escape","/absoluto","dir\\escape","%2e%2e/escape"]){const bad=forged([{...original.files[0],path}]);await assert.rejects(()=>verifySnapshot(root,bad),/Ruta insegura/);}
  await assert.rejects(()=>verifySnapshot(root,forged([original.files[0],original.files[0]])),/duplicada/);
  for(const patch of [{semanticSha256:"0".repeat(64)},{bytes:1},{kind:"binary"},{urlPath:"otra-ruta"},{restorable:false,localPath:"no-debe-existir"}]){
    const bad=forged([{...original.files[0],...patch}]);await assert.rejects(()=>verifySnapshot(root,bad),/Metadatos|URL inconsistente|Alias con ruta/);
  }
  const first=original.files[0];await writeFile(join(root,first.blob),"CORRUPTO");await assert.rejects(()=>verifySnapshot(root,original),/Integridad inválida/);
  const absentHash="f".repeat(64),missing=forged([{...first,path:"missing.html",urlPath:"missing.html",sha256:absentHash,blob:`blobs/${absentHash}`}]);await assert.rejects(()=>verifySnapshot(root,missing),/ENOENT/);
});
