#!/usr/bin/env node
// Standard MCP stdio bridge for clients without HTTP bearer-secret support.
// Credential stays in a private file. Stdout is exclusively JSON-RPC.
import {readFile,stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const path=process.argv[2];
if(!path) throw new Error('Falta la ruta al archivo privado de credencial');
const mode=(await stat(path)).mode;
if(process.platform!=='win32' && (mode&0o077)) throw new Error('La credencial debe tener permisos 0600');
const credential=JSON.parse(await readFile(path,'utf8'));
if(credential.endpoint!=='https://yokup.com/mcp' || !/^ykm_[A-Za-z0-9_-]{43}$/.test(credential.token)) throw new Error('Credencial no válida');
let protocol='2025-11-25';
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
 let message;
 try {
  message=JSON.parse(line);
  const response=await fetch(credential.endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+credential.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':protocol},body:JSON.stringify(message),signal:AbortSignal.timeout(35000)});
  if(response.status===202) continue;
  if(!response.ok) throw new Error('MCP HTTP '+response.status);
  const result=await response.json();
  if(message.method==='initialize' && result.result?.protocolVersion) protocol=result.result.protocolVersion;
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  if(message && Object.hasOwn(message,'id')) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:e.message.startsWith('MCP HTTP')?e.message:'No se confirmó la petición; consulta yokup_delivery antes de repetir una escritura.'}})+'\n');
  else process.stderr.write('Petición MCP inválida o no confirmada.\n');
 }
}
