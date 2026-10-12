// Declarative launch only. The installed Mac bridge resolves the project playlist.
import {projectContext} from './demo-ios.mjs';
export function parseAndroid(text) {
 const match=/^\/?demo\s+android(?:\s+(.*))?$/i.exec(String(text).trim());
 if(!match)return null;
 let rest=(match[1]||'').trim(),device='both';
 const target=/^(Fold8|fold|watch)(?:\s|$)/i.exec(rest);
 if(target){device=/watch/i.test(target[1])?'watch':'fold';rest=rest.slice(target[0].length).trim();}
 if(/^(Fold8|fold|watch|iphone|ios)(?:\s|$)/i.test(rest))throw Error('Elige Fold8 o watch, o ninguno para mostrar ambos.');
 const tags=rest.startsWith('#')?rest.split(/\s+/):[];
 if(tags.some(t=>!/^#[\p{L}\p{N}_-]{1,64}$/u.test(t)))throw Error('Usa #tag o varios tags separados por espacios.');
 const name=tags.length?'':rest.replace(/^playlist\s+/i,'').replace(/^"(.*)"$/,'$1');
 if(name.length>160)throw Error('Nombre de playlist demasiado largo.');
 return {device,model:device==='fold'?'Fold8':undefined,selector:tags.length?{kind:'tags',tags:tags.map(t=>t.slice(1).toLowerCase())}:name?{kind:'playlist',name}:{kind:'latest'}};
}
export async function runAndroid(text,root=window) {
 const command=parseAndroid(text);
 if(!command)throw Error('Comando Android no válido.');
 const contextRoot={location:root.location,document:root.document,AdmiraIOSDemoContext:root.AdmiraAndroidDemoContext||root.AdmiraIOSDemoContext};
 const context=projectContext(contextRoot);
 const request={version:1,platform:'android',project:context.project,origin:context.origin,device:command.device,model:command.model,selector:command.selector,playlistIds:context.playlistIds||[]};
 if(new TextEncoder().encode(JSON.stringify(request)).length>60000)throw Error('El contexto del proyecto es demasiado grande para la demo.');
 const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(request)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 root.location.assign('admira-android-demo://launch?request='+encoded);
 return {...request,playlist:{name:command.selector.name||(command.selector.kind==='tags'?'#'+command.selector.tags.join(' #'):'última playlist del proyecto')}};
}
