#!/usr/bin/env node
/**
 * Inventario y recuperación segura de deployments inmutables de Yokup Pages.
 * Autor operativo: SubOraculoMini.
 *
 * La restauración nunca borra archivos exclusivos del destino, es dry-run por
 * defecto y, al aplicar, respalda cada fichero que vaya a sobrescribir.
 */
import {createHash} from "node:crypto";
import {cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, stat, unlink, writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {basename, dirname, join, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";

export const SNAPSHOT_SCHEMA=2;
export const SNAPSHOT_SIGNER="SubOraculoMini";
const TEXT_EXT=/\.(?:html?|css|m?js|json|webmanifest|txt|xml|svg|md)$/i;
const SKIP_PARTS=new Set(["node_modules",".git",".wrangler","__pycache__"]);
const CRITICAL_PATHS=new Set(["_headers","_redirects","_routes.json","functions/api/fleet-census.js"]);

const sha256=value=>createHash("sha256").update(value).digest("hex");
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function textualContent(path,bytes,contentType=""){
  const type=String(contentType).split(";",1)[0].trim().toLowerCase();
  return TEXT_EXT.test(path)||type.startsWith("text/")||/^(?:application|image)\/(?:[\w.+-]+\+)?(?:json|javascript|xml|svg\+xml)$/.test(type)||/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(bytes.toString("utf8",0,256));
}
export function semanticBytes(path,bytes,contentType=""){
  if(!textualContent(path,bytes,contentType))return bytes;
  let text=bytes.toString("utf8");
  if(/\.(?:json|webmanifest)$/i.test(path)||/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(contentType)){
    try{
      const parsed=JSON.parse(text);
      if(basename(path).toLowerCase()==="version.json")for(const field of ["version","deployedAt","deployer","machine","signature","git","gitShort","gitFull","dirty"])delete parsed[field];
      return Buffer.from(JSON.stringify(stable(parsed)));
    }catch{}
  }
  // Sólo src/href HTML: JS/CSS/texto y whitespace siguen byte-sensibles.
  const html=/\.html?$/i.test(path)||/^text\/html(?:;|$)/i.test(contentType)||/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(text);
  if(html)text=text.replace(/\b(src|href)(\s*=\s*)(["'])([^"']*)\3/gi,(all,attr,eq,quote,value)=>{
    const normalized=value.replace(/([?&]v=)(?:(?:v\.)?\d{2}\.\d{2}\.\d{4}\.r\d+|v\.\d{4}\.\d{2}\.\d{2}\.\d{6}|r\d+)/g,"$1<DEPLOY>");
    return attr+eq+quote+normalized+quote;
  });
  return Buffer.from(text);
}
export function fileRecord(path,bytes,contentType=""){const text=textualContent(path,bytes,contentType);return{path,bytes:bytes.length,sha256:sha256(bytes),semanticSha256:sha256(semanticBytes(path,bytes,contentType)),kind:text?"text":"binary",contentType:String(contentType).split(";",1)[0].trim().toLowerCase()};}
export function manifestDigest(manifest){const {integrity,...core}=manifest;return sha256(JSON.stringify(stable(core)));}

function safeRelative(value){
  const raw=String(value||"");let decoded=raw;
  try{decoded=decodeURIComponent(raw);}catch{throw new Error(`Ruta codificada inválida: ${value}`);}
  if(raw.startsWith("/")||decoded.startsWith("/")||raw.includes("\\")||decoded.includes("\\"))throw new Error(`Ruta insegura en snapshot: ${value}`);
  const clean=decoded;
  if(!clean||clean.split("/").some(p=>!p||p==="."||p===".."))throw new Error(`Ruta insegura en snapshot: ${value}`);
  return clean;
}
async function rejectSymlinkPath(root,rel){
  let current=resolve(root);for(const part of safeRelative(rel).split("/")){current=join(current,part);try{if((await lstat(current)).isSymbolicLink())throw new Error(`Enlace simbólico no permitido: ${rel}`);}catch(e){if(e.code!=="ENOENT")throw e;else break;}}
}
function targetPath(root,rel){
  const safe=safeRelative(rel),out=resolve(root,safe);
  if(out!==resolve(root)&&!out.startsWith(resolve(root)+sep))throw new Error(`Ruta fuera del destino: ${rel}`);
  return out;
}
async function walk(root,dir=root){
  const out=[];
  for(const ent of await readdir(dir,{withFileTypes:true})){
    if(SKIP_PARTS.has(ent.name)||ent.name.startsWith(".snapshot"))continue;
    const full=join(dir,ent.name),rel=relative(root,full).split(sep).join("/");
    if(ent.isSymbolicLink())continue;
    if(ent.isDirectory())out.push(...await walk(root,full)); else out.push(rel);
  }
  return out;
}
export function isPublicCandidate(rel){
  const name=basename(rel),parts=rel.split("/");
  if(parts.some(p=>p.startsWith(".")||SKIP_PARTS.has(p)))return false;
  if(/\.test\.mjs$|\.py$|\.md$|\.bak(?:-|$)/i.test(name))return false;
  if(/^deploy(?:-[a-z-]+)?\.(?:m?js)$/i.test(name)||name==="pages-snapshots.mjs"||/^(?:package(?:-lock)?\.json|wrangler\.toml)$/i.test(name))return false;
  return true;
}
export async function publicCandidates(sourceRoot){return(await walk(sourceRoot)).filter(isPublicCandidate).sort();}

function links(html,pageUrl){
  const out=[],source=String(html||"");let i=0;
  while(i<source.length){
    const start=source.indexOf("<",i);if(start<0)break;
    if(source.startsWith("<!--",start)){const end=source.indexOf("-->",start+4);i=end<0?source.length:end+3;continue;}
    const nameMatch=/^<\s*([a-z][a-z0-9:-]*)\b/i.exec(source.slice(start));if(!nameMatch){i=start+1;continue;}
    const tag=nameMatch[1].toLowerCase();let end=start+nameMatch[0].length,quote="";
    for(;end<source.length;end++){const ch=source[end];if(quote){if(ch===quote)quote="";}else if(ch==='"'||ch==="'")quote=ch;else if(ch===">")break;}
    const open=source.slice(start,Math.min(end+1,source.length));
    for(const match of open.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)){
      const raw=match[2].trim();if(!raw||/[{}]|\$\{|<%|%>|\[\[|\]\]/.test(raw))continue;
      try{const u=new URL(raw,pageUrl);if(u.origin===pageUrl.origin&&!u.pathname.endsWith("/"))out.push(u.pathname.replace(/^\//,""));}catch{}
    }
    i=end+1;
    if(tag==="script"||tag==="style"){const close=new RegExp(`</${tag}\\s*>`,"ig");close.lastIndex=i;const hit=close.exec(source);i=hit?close.lastIndex:source.length;}
  }
  return out;
}
async function fetchOne(base,rel,fetchImpl){
  const url=new URL("/"+safeRelative(rel),base),res=await fetchImpl(url,{cache:"no-store",redirect:"follow"});
  if(res.status===404)return{unavailable:"http-404",status:404};if(!res.ok)throw new Error(`${res.status} ${url}`);return{bytes:Buffer.from(await res.arrayBuffer()),contentType:res.headers.get("content-type")||"",status:res.status,responseUrl:res.url||url.href,contentLocation:res.headers.get("content-location")||res.headers.get("x-matched-path")||""};
}
export async function inventoryDeployment({url,outDir,sourceRoot,paths=[],fetchImpl=fetch,deployment={}}){
  const base=new URL(url),queue=new Map();
  const enqueue=(path,restorable=false,localPath="",origin="linked",sourceSha="")=>{const rel=safeRelative(path),old=queue.get(rel),next={restorable,localPath:restorable?(localPath||rel):"",origin,sourceSha};if(!old||restorable&&!old.restorable||origin==="source")queue.set(rel,next);};
  enqueue("index.html",true,"index.html","index");for(const p of paths)enqueue(p,true,p,"explicit");
  for(const p of CRITICAL_PATHS)enqueue(p,false,"","critical-probe");
  if(sourceRoot)for(const p of await publicCandidates(sourceRoot)){const bytes=await readFile(targetPath(sourceRoot,p));enqueue(p,true,p,"source",sha256(bytes));}
  const files=new Map(),coverage={requested:[],unavailable:[]};let shellHash="";
  for(const [rel,meta] of queue){
    coverage.requested.push(rel);const fetched=await fetchOne(base,rel,fetchImpl);
    if(fetched.unavailable){coverage.unavailable.push({path:rel,reason:fetched.unavailable,critical:CRITICAL_PATHS.has(rel)});continue;}
    const {bytes,contentType}=fetched,hash=sha256(bytes),htmlResponse=/^text\/html(?:;|$)/i.test(contentType)||/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(bytes.toString("utf8",0,512));
    if(rel==="index.html")shellHash=sha256(bytes);
    else{
      const ext=(/\.([a-z0-9]{1,8})$/i.exec(rel)||[])[1]?.toLowerCase()||"",sameShell=!!(shellHash&&hash===shellHash),isHtmlExt=/^html?$/.test(ext);
      const imageExt=/^(?:png|jpe?g|gif|webp|avif|ico)$/.test(ext),imageMagic=bytes.length>3&&(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47||bytes[0]===0xff&&bytes[1]===0xd8||bytes.toString("ascii",0,4)==="GIF8"||bytes.toString("ascii",0,4)==="RIFF");
      let reason="";
      if(ext&&!isHtmlExt&&htmlResponse)reason=sameShell?"ambiguous-index-response":"content-type-mismatch";
      else if(isHtmlExt&&!htmlResponse)reason="content-type-mismatch";
      else if(imageExt&&!/^image\//i.test(contentType)&&!imageMagic)reason="content-type-mismatch";
      else if(/^(?:json|webmanifest)$/.test(ext)){try{JSON.parse(bytes.toString("utf8"));}catch{reason="content-type-mismatch";}}
      if(!reason&&sameShell&&(ext||CRITICAL_PATHS.has(rel))){
        let httpEvidence=false;try{httpEvidence=!!fetched.contentLocation&&new URL(fetched.contentLocation,base).pathname.replace(/^\//,"")===rel;}catch{}
        const localMatch=meta.origin==="source"&&meta.sourceSha===hash,explicitTwin=meta.origin==="explicit"&&isHtmlExt;
        if(!localMatch&&!explicitTwin&&!httpEvidence&&(ext||CRITICAL_PATHS.has(rel)))reason="ambiguous-index-response";
      }
      if(reason){coverage.unavailable.push({path:rel,reason,critical:CRITICAL_PATHS.has(rel)});continue;}
    }
    files.set(rel,{bytes,contentType,...meta});
    if(/\.html?$/i.test(rel)||(!/\.[a-z0-9]{1,8}$/i.test(rel)&&/^\s*</.test(bytes.toString("utf8"))))for(const linked of links(bytes.toString("utf8"),new URL(fetched.responseUrl)))enqueue(linked,/\.[a-z0-9]{1,8}$/i.test(linked)&&meta.restorable,linked,"linked");
  }
  await mkdir(join(outDir,"blobs"),{recursive:true});
  const records=[];
  for(const [rel,item] of [...files].sort(([a],[b])=>a.localeCompare(b))){const record={...fileRecord(rel,item.bytes,item.contentType),urlPath:rel,origin:item.origin,restorable:!!item.restorable,localPath:item.restorable?item.localPath:""};record.blob=`blobs/${record.sha256}`;const dest=targetPath(outDir,record.blob);try{await stat(dest);}catch(e){if(e.code!=="ENOENT")throw e;await writeFile(dest,item.bytes);}records.push(record);}
  coverage.stored=records.map(r=>r.path);const core={schema:SNAPSHOT_SCHEMA,createdBy:SNAPSHOT_SIGNER,createdAt:new Date().toISOString(),deployment:{...deployment,url:base.href},coverage,files:records};
  const manifest={...core,integrity:{algorithm:"sha256",manifestSha256:manifestDigest(core)}};
  await writeFile(join(outDir,"snapshot.json"),JSON.stringify(manifest,null,2)+"\n");return manifest;
}

export function diffSnapshots(left,right){
  const a=new Map((left.files||[]).map(x=>[x.path,x])),b=new Map((right.files||[]).map(x=>[x.path,x]));
  const result={added:[],removed:[],semanticChanged:[],metadataOnly:[],unchanged:[]};
  for(const path of [...new Set([...a.keys(),...b.keys()])].sort()){
    if(!a.has(path))result.added.push(path);else if(!b.has(path))result.removed.push(path);
    else if(a.get(path).sha256===b.get(path).sha256)result.unchanged.push(path);
    else if(a.get(path).semanticSha256===b.get(path).semanticSha256)result.metadataOnly.push(path);
    else result.semanticChanged.push(path);
  }return result;
}
export async function readSnapshot(dir){const m=JSON.parse(await readFile(join(dir,"snapshot.json"),"utf8"));if(m.schema!==SNAPSHOT_SCHEMA)throw new Error("Versión de snapshot no soportada");return m;}
export async function verifySnapshot(dir,manifest){
  manifest=manifest||await readSnapshot(dir);
  if(!manifest.integrity)throw new Error("Falta digest de integridad del manifiesto");
  if(manifest.integrity.algorithm!=="sha256"||manifestDigest(manifest)!==manifest.integrity.manifestSha256)throw new Error("Digest del manifiesto inválido");
  if(!manifest.coverage||!Array.isArray(manifest.coverage.requested)||!Array.isArray(manifest.coverage.stored)||!Array.isArray(manifest.coverage.unavailable))throw new Error("Cobertura del inventario ausente");
  const requested=new Set(manifest.coverage.requested.map(safeRelative));if(requested.size!==manifest.coverage.requested.length)throw new Error("Cobertura solicitada duplicada");
  const storedCoverage=manifest.coverage.stored.map(safeRelative),filePaths=(manifest.files||[]).map(x=>safeRelative(x.path));
  if(JSON.stringify(storedCoverage)!==JSON.stringify(filePaths))throw new Error("Cobertura almacenada inconsistente");
  const accounted=new Set(storedCoverage);for(const miss of manifest.coverage.unavailable){const path=safeRelative(miss&&miss.path);if(accounted.has(path)||!requested.has(path)||!String(miss&&miss.reason||""))throw new Error(`Cobertura no disponible inconsistente: ${path}`);accounted.add(path);}
  if(accounted.size!==requested.size||[...requested].some(path=>!accounted.has(path)))throw new Error("Cobertura del inventario incompleta");
  const seen=new Set(),locals=new Set();for(const rec of manifest.files||[]){const rel=safeRelative(rec.path);if(rec.urlPath!==rel)throw new Error(`URL inconsistente: ${rel}`);if(seen.has(rel))throw new Error(`Ruta duplicada en snapshot: ${rel}`);seen.add(rel);if(!rec.blob||rec.blob!==`blobs/${rec.sha256}`)throw new Error(`Blob inválido: ${rel}`);const blob=safeRelative(rec.blob);await rejectSymlinkPath(dir,blob);const bytes=await readFile(targetPath(dir,blob)),actual=fileRecord(rel,bytes,rec.contentType||"");if(actual.sha256!==rec.sha256)throw new Error(`Integridad inválida: ${rel}`);if(actual.bytes!==rec.bytes||actual.kind!==rec.kind||actual.semanticSha256!==rec.semanticSha256)throw new Error(`Metadatos de integridad inválidos: ${rel}`);if(rec.restorable){const local=safeRelative(rec.localPath);if(locals.has(local))throw new Error(`Ruta física duplicada: ${local}`);locals.add(local);}else if(rec.localPath)throw new Error(`Alias con ruta física inválida: ${rel}`);}return manifest;
}
export async function restoreSnapshot({snapshotDir,targetDir,apply=false,backupDir,afterWrite}){
  const manifest=await verifySnapshot(snapshotDir),plan=[];
  for(const rec of (manifest.files||[]).filter(x=>x.restorable&&x.localPath)){
    await rejectSymlinkPath(targetDir,rec.localPath);const source=targetPath(snapshotDir,rec.blob),dest=targetPath(targetDir,rec.localPath);let current=null;
    try{current=await readFile(dest);}catch(e){if(e.code!=="ENOENT")throw e;}
    if(current&&sha256(current)===rec.sha256)continue;plan.push({path:rec.localPath,recordPath:rec.path,action:current?"replace":"create",source,dest,current,expected:rec.sha256});
  }
  if(!apply)return{applied:false,plan,preservedExclusive:true};
  let backup=backupDir;
  if(backup){try{if((await readdir(backup)).length)throw new Error(`Backup no vacío: ${backup}`);}catch(e){if(e.code==="ENOENT")await mkdir(backup,{recursive:true});else throw e;}}
  else backup=await mkdtemp(join(tmpdir(),"yokup-restore-backup-"));
  for(const item of plan)if(item.current){const back=targetPath(backup,item.path);await mkdir(dirname(back),{recursive:true});const handle=await open(back,"wx");try{await handle.writeFile(item.current);}finally{await handle.close();}}
  try{
    for(const item of plan){
      await mkdir(dirname(item.dest),{recursive:true});const temp=item.dest+`.restore-${process.pid}`;await cp(item.source,temp);await rename(temp,item.dest);
      if(afterWrite)await afterWrite({path:item.path,dest:item.dest});
      const written=await readFile(item.dest);if(sha256(written)!==item.expected)throw new Error(`Verificación post-write falló: ${item.path}`);
    }
  }catch(error){
    for(const item of [...plan].reverse()){if(item.current)await cp(targetPath(backup,item.path),item.dest);else await unlink(item.dest).catch(()=>{});}throw error;
  }
  return{applied:true,plan:plan.map(({path,action})=>({path,action})),backupDir:backup,preservedExclusive:true};
}

export function parseDeployments(value){
  const raw=Array.isArray(value)?value:(value&&value.result)||[];
  return raw.map(d=>{const url=d.url||d.Deployment||d.aliases?.[0];return{id:d.id||d.Id||d.deployment_id||keyUrl(url),url,environment:d.environment||d.Environment||"unknown",created_on:d.created_on||d.createdAt||d.Created||""};}).filter(d=>d.url);
}
const keyUrl=url=>sha256(String(url)).slice(0,12);
function argMap(argv){const out={_:[]};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith("--"))out[a.slice(2)]=argv[i+1]&&!argv[i+1].startsWith("--")?argv[++i]:true;else out._.push(a);}return out;}
async function cli(argv=process.argv.slice(2)){
  const args=argMap(argv),cmd=args._[0];
  if(cmd==="diff"){const a=await readSnapshot(args.left),b=await readSnapshot(args.right);console.log(JSON.stringify(diffSnapshots(a,b),null,2));return;}
  if(cmd==="restore"){const result=await restoreSnapshot({snapshotDir:args.snapshot,targetDir:args.target,apply:!!args.apply,backupDir:args.backup});console.log(JSON.stringify(result,null,2));return;}
  if(cmd!=="inventory")throw new Error("Uso: inventory|diff|restore");
  let deployments;
  if(args.url)deployments=[{id:args.id||keyUrl(args.url),url:args.url,environment:"explicit"}];
  else if(args["deployments-json"])deployments=parseDeployments(JSON.parse(await readFile(args["deployments-json"],"utf8")));
  else deployments=parseDeployments(JSON.parse(execFileSync("npx",["wrangler","pages","deployment","list","--project-name",args.project||"yokup","--json"],{encoding:"utf8"})));
  const limit=Number(args.limit||deployments.length),root=resolve(args.out||".snapshots/yokup"),made=[];
  for(const dep of deployments.slice(0,limit)){const dir=join(root,safeRelative(dep.id));made.push(await inventoryDeployment({url:dep.url,outDir:dir,sourceRoot:args.source?resolve(args.source):undefined,deployment:dep}));}
  console.log(JSON.stringify({signer:SNAPSHOT_SIGNER,count:made.length,snapshots:made.map(m=>m.deployment)},null,2));
}
if(import.meta.url===pathToFileURL(process.argv[1]||"").href)cli().catch(e=>{console.error(e.message);process.exitCode=1;});
