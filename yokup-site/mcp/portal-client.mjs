#!/usr/bin/env node
// Private configuration file: {"endpoint":"https://data.yokup.com/mcp/installer","token":"..."}
// Never logs the credential. No automatic retries of mutations.
import {readFile,stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const path=process.argv[2];
if(!path)throw new Error('Indica el archivo privado de configuración MCP.');
const info=await stat(path);
if(!info.isFile()||(process.platform!=='win32'&&(info.mode&0o077)))throw new Error('La configuración debe ser un archivo privado con permisos 0600.');
const config=JSON.parse(await readFile(path,'utf8'));
if(!['https://data.yokup.com/mcp/installer','https://data.yokup.com/mcp/retailer'].includes(config.endpoint)||!/^ykp_[a-f0-9]{64}$/.test(config.token))throw new Error('Endpoint o formato de token no válido.');
let protocol='2025-11-25';
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 let message;
 try{
  message=JSON.parse(line);
  const response=await fetch(config.endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':protocol},body:JSON.stringify(message),signal:AbortSignal.timeout(35000)});
  if(response.status===202)continue;
  if(!response.ok)throw Object.assign(new Error(),{httpStatus:response.status});
  const data=await response.json();if(message.method==='initialize'&&data.result?.protocolVersion)protocol=data.result.protocolVersion;
  process.stdout.write(JSON.stringify(data)+'\n');
 }catch(e){
  if(message&&Object.hasOwn(message,'id'))process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:e.httpStatus?'MCP HTTP '+e.httpStatus:'Respuesta no confirmada. Comprueba el portal y conserva request_key antes de reintentar.'}})+'\n');
  else process.stderr.write('Mensaje MCP inválido o respuesta no confirmada.\n');
 }
}
