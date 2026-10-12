// Shared native demo contract: Studio, Store, TV, App and Biz.
export function parseIOS(text) {
 const match=/^\/?demo\s+ios(?:\s+(.*))?$/i.exec(String(text).trim());
 if(!match)return null;
 let rest=(match[1]||'').trim(),device='both';
 const target=/^(iphone|watch)(?:\s|$)/i.exec(rest);
 if(target){device=target[1].toLowerCase();rest=rest.slice(target[0].length).trim();}
 if(/^(iphone|watch)(?:\s|$)/i.test(rest))throw Error('Elige iphone o watch, o ninguno para mostrar ambos.');
 const tags=rest.startsWith('#')?rest.split(/\s+/):[];
 if(tags.some(t=>!/^#[\p{L}\p{N}_-]{1,64}$/u.test(t)))throw Error('Usa #tag o varios tags separados por espacios.');
 const name=tags.length?'':rest.replace(/^playlist\s+/i,'').replace(/^"(.*)"$/,'$1');
 if(name.length>160)throw Error('Nombre de playlist demasiado largo.');
 return {device,selector:tags.length?{kind:'tags',tags:tags.map(t=>t.slice(1).toLowerCase())}:name?{kind:'playlist',name}:{kind:'latest'}};
}
export function projectContext(root=window) {
 const supplied=typeof root.AdmiraIOSDemoContext==='function'?root.AdmiraIOSDemoContext():root.AdmiraIOSDemoContext;
 const url=new URL(root.location.href),select=root.document.querySelector('#adapter-project,[data-active-project],#project-select');
 const project=String(supplied?.project||select?.value||select?.dataset?.activeProject||url.searchParams.get('project')||url.searchParams.get('proyecto')||'').trim();
 if(!/^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(project)||project==='general')throw Error('Selecciona primero un proyecto para la demo iOS.');
 return {...supplied,project,origin:url.origin};
}
export async function runIOS(text,root=window) {
 const command=parseIOS(text),context=projectContext(root);
 if(!command)throw Error('Comando iOS no válido.');
 // Resolve centrally on the presentation Mac: associations survive domain changes.
 const request={version:1,project:context.project,origin:context.origin,device:command.device,selector:command.selector,playlistIds:context.playlistIds||[]};
 if(new TextEncoder().encode(JSON.stringify(request)).length>60000)throw Error('El contexto del proyecto es demasiado grande para la demo.');
 const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(request)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 root.location.assign('admira-ios-demo://launch?request='+encoded);
 return {...request,playlist:{name:command.selector.name|| (command.selector.kind==='tags'?'#'+command.selector.tags.join(' #'):'última playlist del proyecto')}};
}
