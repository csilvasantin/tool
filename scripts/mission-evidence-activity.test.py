"""Exercise the actual shell emitters against a local API, never an agent/app."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SOURCE=Path(__file__).resolve().parents[1]/'yokup-rtc/tools/mission-evidence.sh'
VAULT=Path('/Users/csilvasantin/Claude/admira-vault/mission-evidence.sh')
ACK={'ok':True,'mission':'FLT-1827','work_binding':{'bound':True},'work_activity':{'accepted':True,'activity_at':1788600700000,'activity_kind':'implementation','basis':'explicit_bound_progress','ttl_ms':120000}}

class ActivityEmitterTests(unittest.TestCase):
    def setUp(self):
        self.received=[]; self.authorization=[]; self.transport_calls=[]; self.vault_calls=[]
        self.response=ACK; self.status=200
        outer=self
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body=self.rfile.read(int(self.headers['Content-Length']))
                outer.received.append((self.path,json.loads(body),self.headers.get('User-Agent')))
                outer.authorization.append(self.headers.get('Authorization'))
                self.send_response(outer.status); self.end_headers(); self.wfile.write(json.dumps(outer.response).encode())
            def log_message(self,*args): pass
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def sources(self):
        # CI has the canonical tool source. On this host also prove the installed
        # vault variant, whose capture implementation intentionally differs.
        return [SOURCE]+([VAULT] if VAULT.exists() else [])
    def invoke(self,source,*,host='app',mode='activity',mission='FLT-1827',options=None,
               api=None,token=None,fake_transport=False,vault_token=None):
        with tempfile.TemporaryDirectory() as tmp:
            script=Path(tmp)/'mission-evidence.sh';shutil.copy2(source,script)
            (Path(tmp)/'quien-ejecuta.sh').write_text('printf "Morfeo %s MorfeoMacMini Claude\\n" "${YOKUP_HOST:-app}"\n')
            env={**os.environ,'YOKUP_API':api or f'http://127.0.0.1:{self.server.server_port}','YOKUP_ROLE':'main'}
            env.pop('YOKUP_HOST',None)
            env.pop('YOKUP_CLI_EXECUTOR_TOKEN',None)
            if token is not None:env['YOKUP_CLI_EXECUTOR_TOKEN']=token
            # Always shadow the vault with a disposable helper. No test reads
            # credentials or calls the real vault, even for an allowed host.
            vault_log=Path(tmp)/'vault.log'
            env['ACTIVITY_TEST_VAULT_LOG']=str(vault_log)
            env['ACTIVITY_TEST_VAULT_TOKEN']=vault_token or ''
            (Path(tmp)/'vault-get.sh').write_text(
                'printf "%s\\n" "$1" >> "$ACTIVITY_TEST_VAULT_LOG"\n'
                '[ -n "$ACTIVITY_TEST_VAULT_TOKEN" ] || exit 1\n'
                'printf "%s\\n" "$ACTIVITY_TEST_VAULT_TOKEN"\n')
            if host is not None:env['YOKUP_HOST']=host
            args=['bash',str(script),mode,mission]
            args+=options if options is not None else ['--session-id','desktop:claude','--activity','implementation','--detail','Verifico el cambio real que acabo de aplicar']
            transport_log=Path(tmp)/'transport.json'
            if fake_transport:
                # Replace only curl through an exported shell function; the
                # canonical emitter and its host validation run unchanged.
                fake_curl=Path(tmp)/'curl.py'
                fake_curl.write_text('''import json,os,sys
args=sys.argv[1:]; headers=[]
for index,arg in enumerate(args[:-1]):
    if arg == '-H':
        value=args[index+1]
        headers.extend(open(value[1:]).read().splitlines() if value.startswith('@') else [value])
with open(os.environ['ACTIVITY_TEST_TRANSPORT_LOG'],'w') as output:
    json.dump({'args':args,'headers':headers,'payload':json.load(sys.stdin)},output)
print(os.environ['ACTIVITY_TEST_ACK'])
''')
                env.update(ACTIVITY_TEST_CURL=str(fake_curl),ACTIVITY_TEST_TRANSPORT_LOG=str(transport_log),ACTIVITY_TEST_ACK=json.dumps(ACK))
                args=['bash','-c','curl() { python3 "$ACTIVITY_TEST_CURL" "$@"; }; export -f curl; exec bash "$@"','emitter-test',*args[1:]]
            result=subprocess.run(args,env=env,capture_output=True,text=True,timeout=10)
            if vault_log.exists():self.vault_calls.extend(vault_log.read_text().splitlines())
            if transport_log.exists():self.transport_calls.append(json.loads(transport_log.read_text()))
            return result
    def test_exact_current_mission_replaces_closed_child_only_on_explicit_update(self):
        for source in self.sources():
            result=self.invoke(source);self.assertEqual(result.returncode,0,result.stderr)
            path,payload,ua=self.received[-1]
            self.assertEqual(path,'/fleet/progress');self.assertEqual(payload['mission'],'FLT-1827')
            self.assertEqual(payload['owner'],'MorfeoMacMini')
            self.assertEqual(payload['work_session'],{'runtime':'Claude','host':'app','session_id':'desktop:claude'})
            self.assertEqual(payload['activity'],{'kind':'implementation','detail':'Verifico el cambio real que acabo de aplicar'})
            self.assertNotIn('image',payload);self.assertEqual(ua,'YokupMissionEvidence/1.0')
            self.assertTrue(json.loads(result.stdout)['accepted'])
        self.assertEqual(len(self.received),len(self.sources()))
    def test_neither_implicit_host_nor_cli_nor_incomplete_activity_contacts_api(self):
        for source in self.sources():
            for host,options in [(None,None),('cli',None),('app',[]),('app',['--session-id','desktop:claude','--activity','implementation'])]:
                self.assertNotEqual(self.invoke(source,host=host,options=options).returncode,0)
        self.assertEqual(self.received,[])
    def test_old_api_unbound_and_rejected_activity_never_report_success(self):
        for source in self.sources():
            for response in [{'ok':True},{**ACK,'work_binding':{'bound':False}}, {**ACK,'work_activity':{'accepted':False,'reason':'private-upstream'}}]:
                self.response=response;out=self.invoke(source)
                self.assertNotEqual(out.returncode,0);self.assertNotIn('"ok": true',out.stdout)
                self.assertNotIn('private-upstream',out.stdout+out.stderr)
    def test_closed_child_request_does_not_fall_back_to_parent_or_retry(self):
        self.status=409;self.response={'ok':False,'code':'mission_closed'}
        for source in self.sources():
            before=len(self.received);out=self.invoke(source,mission='FLT-1827:b')
            self.assertNotEqual(out.returncode,0);self.assertEqual(len(self.received),before+1)
            self.assertEqual(self.received[-1][1]['mission'],'FLT-1827:b')
    def test_final_cannot_emit_activity(self):
        for source in self.sources():self.assertNotEqual(self.invoke(source,mode='final').returncode,0)
        self.assertEqual(self.received,[])

    def test_owned_https_bases_use_explicit_token_without_secret_in_arguments(self):
        token='fictitious-executor-test-token'
        for api in ['https://api.yokup.com','https://rtc.yokup.com/']:
            out=self.invoke(SOURCE,api=api,token=token,fake_transport=True)
            self.assertEqual(out.returncode,0,out.stderr)
            request=self.transport_calls[-1]
            self.assertIn('Authorization: Bearer '+token,request['headers'])
            self.assertIn(api.rstrip('/')+'/fleet/progress',request['args'])
            self.assertEqual(request['args'][0],'-q')
            self.assertNotIn('-L',request['args'])
            self.assertNotIn(token,json.dumps(request['args'])+out.stdout+out.stderr)
        self.assertEqual(self.vault_calls,[])

    def test_owned_host_uses_vault_fallback_and_fails_without_a_token(self):
        out=self.invoke(SOURCE,api='https://api.yokup.com',fake_transport=True,vault_token='fictitious-vault-token')
        self.assertEqual(out.returncode,0,out.stderr)
        self.assertEqual(self.vault_calls,['YOKUP_CLI_EXECUTOR_TOKEN'])
        self.assertIn('Authorization: Bearer fictitious-vault-token',self.transport_calls[-1]['headers'])
        self.assertNotIn('fictitious-vault-token',out.stdout+out.stderr+json.dumps(self.transport_calls[-1]['args']))
        self.transport_calls.clear()
        out=self.invoke(SOURCE,api='https://rtc.yokup.com',fake_transport=True)
        self.assertNotEqual(out.returncode,0)
        self.assertEqual(self.transport_calls,[])
        self.assertIn('YOKUP_CLI_EXECUTOR_TOKEN',out.stderr)

    def test_third_party_overrides_never_receive_auth_or_query_vault(self):
        for api in ['https://example.test','http://api.yokup.com','https://api.yokup.com.evil.test',
                    'https://api.yokup.com@evil.test','https://api.yokup.com:8443',
                    'https://api.yokup.com?redirect=evil.test']:
            for token in [None,'fictitious-private-token']:
                out=self.invoke(SOURCE,api=api,token=token,fake_transport=True,vault_token='fictitious-vault-token')
                self.assertEqual(out.returncode,0,out.stderr)
                self.assertFalse(any(h.lower().startswith('authorization:') for h in self.transport_calls[-1]['headers']))
                self.assertNotIn('fictitious-private-token',out.stdout+out.stderr)
        self.assertEqual(self.vault_calls,[])

    def test_local_api_remains_usable_without_auth_even_with_a_token_in_environment(self):
        out=self.invoke(SOURCE,token='fictitious-local-token',vault_token='fictitious-vault-token')
        self.assertEqual(out.returncode,0,out.stderr)
        self.assertEqual(self.authorization,[None])
        self.assertEqual(self.vault_calls,[])

    def test_multiline_credential_is_rejected_without_request_or_secret_output(self):
        out=self.invoke(SOURCE,api='https://api.yokup.com',token='fictitious-secret\r\nX-Injected: yes',fake_transport=True)
        self.assertNotEqual(out.returncode,0)
        self.assertEqual(self.transport_calls,[])
        self.assertNotIn('fictitious-secret',out.stdout+out.stderr)

if __name__=='__main__':unittest.main()
