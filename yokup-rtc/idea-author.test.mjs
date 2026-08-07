import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveIdeaAuthor, sessionDisplayName} from './src/idea-author.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('navegador autenticado puede omitir author y usa el nombre Google firmado', () => {
  assert.deepEqual(resolveIdeaAuthor({
    session:{email:'maria.lopez@admira.com', name:'María López'}, explicitAuthor:''
  }), {
    ok:true, author:'María López', source:'session', identity:'maria.lopez@admira.com'
  });
});

test('una sesión antigua sin name usa alias visible, nunca el email completo', () => {
  assert.equal(sessionDisplayName({email:'maria.lopez@admira.com'}), 'Maria Lopez');
  const actor = resolveIdeaAuthor({session:{email:'maria.lopez@admira.com'}});
  assert.equal(actor.author, 'Maria Lopez');
  assert.doesNotMatch(actor.author, /@/);
});

test('el navegador no puede suplantar author explícito', () => {
  const actor = resolveIdeaAuthor({
    session:{email:'ana@admira.com', name:'Ana Real'}, explicitAuthor:'Otra Persona'
  });
  assert.equal(actor.author, 'Ana Real');
  assert.equal(actor.source, 'session');
});

test('CLI legado conserva author sólo tras validar su credencial de agente', () => {
  assert.deepEqual(resolveIdeaAuthor({trustedAgent:true, explicitAuthor:'NeoMacMini'}), {
    ok:true, author:'NeoMacMini', source:'agent', identity:'agent:neomacmini'
  });
  const empty = resolveIdeaAuthor({trustedAgent:true, explicitAuthor:'   '});
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 400);
  assert.equal(empty.code, 'author_required');
});

test('sin sesión ni token no se acepta author ni queda vacío/anónimo', () => {
  const spoof = resolveIdeaAuthor({explicitAuthor:'Carlos'});
  assert.equal(spoof.ok, false);
  assert.equal(spoof.status, 401);
  assert.equal(spoof.code, 'identity_required');
  assert.doesNotMatch(source.slice(source.indexOf('if (url.pathname === "/ideas"'), source.indexOf('// (Re)asigna la silla', source.indexOf('if (url.pathname === "/ideas"'))), /author\s*=\s*String\(b\.author \|\| ""\)/);
});

test('un borrador del Consejo conserva sólo la firma canónica de su seat', () => {
  const actor = resolveIdeaAuthor({
    session:{email:'ana@admira.com', name:'Ana'}, explicitAuthor:'CEO · Falso',
    councilAuthor:'CEO · Steve Jobs', councilSeat:'ceo'
  });
  assert.deepEqual(actor, {
    ok:true, author:'CEO · Steve Jobs', source:'council-preview', identity:'council:ceo'
  });
});

test('POST /ideas valida sesión/token y persiste trazabilidad atómica', () => {
  const start = source.indexOf('if (url.pathname === "/ideas" && (req.method === "GET" || req.method === "POST"))');
  const endpoint = source.slice(start, source.indexOf('// (Re)asigna la silla', start));
  assert.match(endpoint, /const session = await requireAuth\(env, req\)/);
  assert.match(endpoint, /env\.IDEAS_AGENT_TOKEN, env\.FLEET_TOKEN/);
  assert.match(endpoint, /resolveIdeaAuthor\(\{ session, explicitAuthor:b\.author, trustedAgent/);
  assert.match(endpoint, /if \(!actor\.ok\) return json/);
  assert.match(endpoint, /await env\.DB\.batch\(\[/);
  assert.match(endpoint, /INSERT INTO ideas \(id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project\)/);
  // Lo que se protege es que la autoría se escriba en el MISMO batch que el alta
  // —atómico—, no la lista exacta de columnas: desde el 7-ago ese UPDATE lleva
  // también de qué vídeo salió la idea (FLT-1267).
  assert.match(endpoint, /UPDATE ideas SET author_source=\?,author_identity=\?[^"]*WHERE id=\?/);
  assert.match(endpoint, /author_source:actor\.source/);
});

test('/auth/login incorpora el nombre verificado a la sesión', () => {
  assert.match(source, /makeSession\(env, email, g\.name \|\| ""\)/);
  assert.match(source, /const p = b64uJson\(\{ email, name:/);
  assert.doesNotMatch(source, /author\s*\|\|\s*"Carlos"/);
});
