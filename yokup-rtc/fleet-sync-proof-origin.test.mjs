import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {missionProofOrigin,RTC_MEDIA_ORIGIN,OWN_MEDIA_ORIGINS} from './src/proof-origin.js';

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');

function extract(name) {
  const match=new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(source);
  assert.ok(match,`falta ${name}`);
  const start=match.index,brace=source.indexOf('{',start);
  let depth=0,quote='',escaped=false;
  for (let i=brace;i<source.length;i+=1) {
    const char=source[i];
    if (quote) {
      if (escaped) escaped=false;
      else if (char==='\\') escaped=true;
      else if (char===quote) quote='';
      continue;
    }
    if ('"\'`'.includes(char)) { quote=char; continue; }
    if (char==='{') depth+=1;
    else if (char==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error(`función incompleta: ${name}`);
}

// validateProofImage depende del modulo proof-origin: se le entrega igual que en el worker.
const build=new Function('OWN_MEDIA_ORIGINS',`
  ${extract('normalizeProofImage')}
  ${extract('embeddedImageMatchesMime')}
  ${extract('imageBytesMatchMime')}
  ${extract('unsafeEvidenceHost')}
  ${extract('validateProofImage')}
  return validateProofImage;
`);
const validateProofImage=build(OWN_MEDIA_ORIGINS);

test('sync valida api.yokup.com y workers.dev contra R2 sin self-fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let fetches=0,heads=0;
  globalThis.fetch=async()=>{ fetches+=1; throw new Error('self-fetch loop'); };
  const env={MEDIA:{async head(key){
    heads+=1;
    assert.equal(key,'fleet/proof.png');
    return {httpMetadata:{contentType:'image/png'}};
  }}};
  try {
    for (const url of [
      'https://api.yokup.com/media/fleet/proof.png',
      `${RTC_MEDIA_ORIGIN}/media/fleet/proof.png`
    ]) {
      const result=await validateProofImage(env,url,missionProofOrigin(url));
      assert.equal(result.value,url);
    }
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(heads,2);
  assert.equal(fetches,0,'la media propia no debe volver a entrar al Worker por HTTP');
});

test('hosts web parecidos siguen externos y fallan cerrados si devuelven HTML',async()=>{
  const originalFetch=globalThis.fetch;
  let fetches=0;
  globalThis.fetch=async()=>{
    fetches+=1;
    return {ok:true,headers:{get:()=> 'text/html'},arrayBuffer:async()=>new ArrayBuffer(0)};
  };
  try {
    for (const host of ['yokup.com','www.yokup.com']) {
      const url=`https://${host}/media/fleet/proof.png`;
      assert.equal(missionProofOrigin(url),RTC_MEDIA_ORIGIN);
      const result=await validateProofImage({},url,missionProofOrigin(url));
      assert.equal(result.value,null);
      assert.match(result.error,/content-type image/);
    }
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(fetches,2);
});

test('/fleet/sync consulta el proof final mediante el origen canónico',()=>{
  const proof=extract('hasMissionProof');
  const closure=extract('hasCanonicalFleetClosure');
  const sync=extract('fleetSync');
  assert.match(proof,/validateProofImage\(env, row\.proof_image, missionProofOrigin\(row\.proof_image\)\)/);
  assert.match(closure,/await hasMissionProof\(env, mid\)/);
  assert.match(closure,/task\.code === "z1"/);
  assert.match(sync,/canonicalCloseRequired && !\(prev && await hasCanonicalFleetClosure\(env, id\)\)/);
  assert.match(sync,/prev\.status === "resolved"[\s\S]*?await hasMissionProof\(env, id\)/);
  assert.doesNotMatch(proof,/validateProofImage\(env, row\.proof_image, "https:\/\/yokup-rtc/);
});

// EL CASO DE PRODUCCION (2026-09-02): la captura se sube a api.yokup.com pero el cierre
// se pide por el nombre de workers.dev, asi que quien llama pasa un origen que NO es el
// de la imagen. Antes de esto, `own` salia false, el worker se buscaba a si mismo por
// fetch y devolvia «no se pudo verificar el contenido» con una imagen que responde 200.
test('la media propia se reconoce aunque quien llama pase OTRO origen',async()=>{
  const originalFetch=globalThis.fetch;
  let fetches=0;
  globalThis.fetch=async()=>{ fetches+=1; throw new Error('self-fetch loop'); };
  const env={MEDIA:{async head(){ return {httpMetadata:{contentType:'image/jpeg'}}; }}};
  try {
    const url='https://api.yokup.com/media/fleet/a404eaff2d5f6243.jpeg';
    const result=await validateProofImage(env,url,RTC_MEDIA_ORIGIN);   // <- origen distinto
    assert.equal(result.value,url);
    assert.ok(!result.error, String(result.error));
  } finally { globalThis.fetch=originalFetch; }
  assert.equal(fetches,0,'no puede volver a entrar al Worker por HTTP para verse a si mismo');
});
