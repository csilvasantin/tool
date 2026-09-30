#!/usr/bin/env node
// ITIL (FLT-101300) · clave de lectura para una solución de la Galaxia. Solo operador autorizado.
// Genera la clave (yki_ + 64 hex), la escribe UNA vez en un archivo 0600 y deja al lado el SQL con su SHA-256.
// No ejecuta nada en remoto: el operador aplica el SQL con wrangler (ver docs/itil-yokup.md).
//   node api/tools/itil-read-key.mjs issue <solución> /ruta/privada/clave.json [--origins https://www.xpaceos.com,https://xpaceos.com] [--brands alsea,jti] [--days 365]
import {randomBytes,createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const SOLUTIONS=['xpaceos','pixeria','admira-app','clearchannel-tv'];
export const KNOWN_ORIGINS=['https://www.xpaceos.com','https://xpaceos.com','https://www.pixeria.com','https://pixeria.com','https://www.admira.app','https://admira.app','https://www.clearchannel.tv','https://clearchannel.tv'];
const quote=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
export function readKeyRecord(solution,{origins=[],brands=null,days=365,now=Date.now(),token='yki_'+randomBytes(32).toString('hex')}={}){
 if(!SOLUTIONS.includes(solution))throw new Error('Solución: '+SOLUTIONS.join(', '));
 if(origins.some(o=>!KNOWN_ORIGINS.includes(o)))throw new Error('Orígenes válidos: '+KNOWN_ORIGINS.join(', '));
 if(brands&&brands.some(b=>!/^[a-z0-9-]{1,40}$/.test(b)))throw new Error('brand_key no válido');
 if(!Number.isInteger(days)||days<1||days>730)throw new Error('--days de 1 a 730');
 const id=crypto.randomUUID(),hash=createHash('sha256').update(token).digest('hex'),expires=now+days*86400000;
 return {token,id,expires_at:expires,sql:`INSERT INTO itil_read_keys(id,solution,key_hash,origins,brands,created_at,expires_at) VALUES(${[id,solution,hash,JSON.stringify(origins),brands&&JSON.stringify(brands)].map(quote).join(',')},${now},${expires});`,
  revoke:`UPDATE itil_read_keys SET revoked_at=${now} WHERE id=${quote(id)};`};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const argv=process.argv.slice(2),opt=name=>{const i=argv.indexOf(name);if(i<0)return null;const v=argv[i+1];argv.splice(i,2);return v;};
 const origins=(opt('--origins')||'').split(',').filter(Boolean),brands=opt('--brands'),days=Number(opt('--days')||365);
 const [action,solution,out]=argv;
 if(action!=='issue'||!out)throw new Error('Uso: node api/tools/itil-read-key.mjs issue <solución> /ruta/privada/clave.json [--origins …] [--brands …] [--days 365]');
 const r=readKeyRecord(solution,{origins,brands:brands?brands.split(','):null,days}),file=resolve(out);
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 await writeFile(file,JSON.stringify({endpoint:'https://data.yokup.com/api/itil/xpacios/{admira_store_id}',header:'X-Yokup-Itil-Key',solution,origins,expires_at:r.expires_at,token:r.token},null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(file+'.sql',r.sql+'\n',{mode:0o600,flag:'wx'});
 console.log('Clave privada: '+file+' (0600, no la pegues en chats ni en el repo).');
 console.log('Alta (operador): cd api && npx wrangler d1 execute yokup-db --remote --file '+file+'.sql');
 console.log('Revocación: '+r.revoke);
}
