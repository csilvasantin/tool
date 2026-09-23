// macOS: generated locally; no voice service or telephone credits.
import {mkdirSync,writeFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {telegramPromptStates,telegramPrompt,telegramAudio} from '../src/calls-telegram-prompts.js';
const dest=fileURLToPath(new URL('../../yokup-site/assets/router-voice/',import.meta.url));
mkdirSync(dest,{recursive:true});const temp=mkdtempSync(tmpdir()+'/router-voice-');
try{for(const s of telegramPromptStates){
 const key=telegramAudio(s),text=telegramPrompt(s);writeFileSync(temp+'/prompt.txt',text);
 execFileSync('/usr/bin/say',['-v','Mónica','-r','165','-f',temp+'/prompt.txt','-o',temp+'/voice.aiff']);
 execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-y','-i',temp+'/voice.aiff','-ac','1','-ar','24000','-c:a','libopus','-b:a','32k',dest+key+'.ogg']);
 if(statSync(dest+key+'.ogg').size<1000)throw new Error('Audio vacío: ejecuta el generador con acceso al sintetizador de macOS.');
 console.log(key);
}writeFileSync(dest+'prompts.json',JSON.stringify(Object.fromEntries(telegramPromptStates.map(s=>[telegramAudio(s),telegramPrompt(s)])),null,2)+'\n');}finally{rmSync(temp,{recursive:true,force:true});}
