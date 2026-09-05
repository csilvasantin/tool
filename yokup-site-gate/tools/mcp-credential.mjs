#!/usr/bin/env node
// Operator-only provisioning. Plaintext token is written once to a 0600 file.
import {randomBytes, createHash} from 'node:crypto';
import {mkdir,writeFile,mkdtemp,rm,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {parseAgentIdentity,machineSuffix,canonicalMachineSuffix,isKnownPersona} from '../../yokup-rtc/src/agent-identity.js';
const [action,actor,machine,projectList,outputFile]=process.argv.slice(2);
if(action!=='issue' || !outputFile) throw new Error('Uso: node tools/mcp-credential.mjs issue OraculoMacMini MacMini yokup /ruta/privada/yokup.json');
const parsed=parseAgentIdentity(actor), suffix=canonicalMachineSuffix(machineSuffix(machine));
if(!isKnownPersona(parsed.persona)||parsed.role!=='main'||!suffix||canonicalMachineSuffix(parsed.suffix)!==suffix) throw new Error('Identidad exacta y máquina requeridas');
const projects=projectList.split(',');
const response=await fetch('https://api.yokup.com/projects');if(!response.ok) throw new Error('Censo no disponible');
const census=await response.json();
for(const id of projects) {
 const p=census.projects.find(p=>p.id===id&&p.status!=='archivado');
 if(!p || !p.machines.some(m=>canonicalMachineSuffix(machineSuffix(m))===suffix) || !p.agents.some(a=>{const q=parseAgentIdentity(a);return q.persona===parsed.persona&&q.role==='main'&&(!q.suffix||canonicalMachineSuffix(q.suffix)===suffix);})) throw new Error('Proyecto no asignado: '+id);
}
const token='ykm_'+randomBytes(32).toString('base64url'), digest=createHash('sha256').update(token).digest('hex');
const now=Date.now(),expires_at=now+30*24*3600*1000;
const scopes=['read','inbox','send','work'];
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const temp=await mkdtemp(resolve(tmpdir(),'yokup-mcp-issue-'));
try {
 await writeFile(resolve(temp,'credential.sql'),`INSERT INTO yokup_mcp_credentials(token_hash,actor,machine,projects,scopes,created_at,expires_at) VALUES(${[digest,actor,machine,JSON.stringify(projects),JSON.stringify(scopes)].map(quote).join(',')},${now},${expires_at});`,{mode:0o600});
 const output=resolve(outputFile);await mkdir(dirname(output),{recursive:true,mode:0o700});
 // Do not overwrite existing credential or expose it in command output.
 await writeFile(output,JSON.stringify({endpoint:'https://yokup.com/mcp',actor,machine,projects,scopes,expires_at,token},null,2)+'\n',{mode:0o600,flag:'wx'});
 await chmod(output,0o600);
 try {execFileSync('npx',['wrangler@4.119.0','d1','execute','yokup-tickets','--remote','--file',resolve(temp,'credential.sql')],{cwd:new URL('../',import.meta.url),stdio:'pipe'});}
 catch {throw new Error('No se confirmó el alta remota. Conserva el archivo privado y verifica el hash antes de reintentar.');}
 console.log('Credencial individual creada (30 días). Archivo privado: '+output);
 console.log('Revocación: UPDATE yokup_mcp_credentials SET revoked_at='+Date.now()+' WHERE token_hash='+quote(digest)+';');
} finally {await rm(temp,{recursive:true,force:true});}
