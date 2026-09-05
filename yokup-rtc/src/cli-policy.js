// Carlos, mission 1078: persistent fleet policy. Only a future explicit human
// instruction may change this versioned setting. Modes/start/restart never do.
export const CLI_POLICY = Object.freeze({cli_paused:true,reason:'cli_paused_by_carlos',revision:'1078'});
export function cliPolicyBlocked(target) { return CLI_POLICY.cli_paused && String(target?.host || '').trim().toLowerCase()==='cli'; }
export function cliPolicyKeyBlocked(key) { return CLI_POLICY.cli_paused && String(key || '').toLowerCase().endsWith('|cli'); }
export function cliPolicyError() { return Object.assign(new Error(CLI_POLICY.reason),{code:CLI_POLICY.reason,status:409}); }
export function cliPolicyFor(target) { return cliPolicyBlocked(target)?{...CLI_POLICY,start_allowed:false,automation_allowed:false}:{cli_paused:false,start_allowed:String(target?.host || '').trim().toLowerCase()==='app',automation_allowed:String(target?.host || '').trim().toLowerCase()==='app'}; }
