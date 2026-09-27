import test from 'node:test';
import assert from 'node:assert/strict';
import { machineSuffix, parseAgentIdentity, scopedAgentIdentity, groupingIdentityKey, isKnownPersona } from './src/agent-identity.js';
import { resolveDecisionIdentity, selectDecisionProjectAssignment, resolveDecisionProject } from './src/decision-project.js';
import '../yokup-site/yk-agent-identity.js';
const personas = ['Arquitecto', 'Morfeo', 'Neo', 'Oraculo', 'Trinity', 'Niobe', 'Cypher', 'Jobs'];
for (const persona of personas) test(`${persona}: identidad completa y asignación para ventanas en GrokBotBox`, () => {
  const agent = `${persona}GrokBotBox`;
  assert.equal(isKnownPersona(persona), true);
  assert.equal(scopedAgentIdentity(persona, 'grokbotbox'), agent);
  assert.deepEqual(resolveDecisionIdentity(persona, 'GrokBotBox'), {ok:true, agent, machine:'GrokBotBox'});
  assert.equal(parseAgentIdentity(agent).suffix, 'GrokBotBox');
  for (const role of ['', 'Sub', 'Infra']) {
    assert.equal(parseAgentIdentity(role + agent).persona, persona);
    assert.equal(globalThis.ykAgentIdentity.display(role + agent, 'GrokBotBox'), role + agent);
  }
  assert.equal(globalThis.ykAgentIdentity.canonicalMachine(agent), 'GrokBotBox');
  const project = {id:'yokup', name:'Yokup', status:'activo'};
  const members = [{project_id:'yokup',kind:'agent',ref:agent},{project_id:'yokup',kind:'machine',ref:'grokbotbox'}];
  const assignment = selectDecisionProjectAssignment([project], members, agent, 'GrokBotBox', 'yokup');
  assert.equal(assignment, project);
  assert.equal(resolveDecisionProject({agent, machine:'GrokBotBox', project_id:'yokup', project:'Yokup', project_slug:'YOKUP'}, assignment).ok, true);
  assert.equal(selectDecisionProjectAssignment([project], members, agent, 'MacMini', 'yokup'), null);
  assert.equal(resolveDecisionIdentity(agent, 'MacMini').ok, false);
  assert.notEqual(groupingIdentityKey(agent), groupingIdentityKey(`${persona}GrokBot`));
});
test('la caja no colisiona con GrokBot ni con Smith; los equipos desconocidos siguen rechazados', () => {
  assert.equal(machineSuffix('GrokBot'), 'GrokBot');
  assert.equal(machineSuffix('GrokBotBox'), 'GrokBotBox');
  assert.equal(machineSuffix('GrokBotBox-evil'), '');
  assert.equal(resolveDecisionIdentity('Neo', 'GrokBotBox-evil').ok, false);
  assert.notEqual(groupingIdentityKey('CypherGrokBotBox'), groupingIdentityKey('SmithGrokBotBox'));
});
