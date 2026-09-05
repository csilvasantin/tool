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
        self.received=[]; self.response=ACK; self.status=200
        outer=self
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body=self.rfile.read(int(self.headers['Content-Length']))
                outer.received.append((self.path,json.loads(body),self.headers.get('User-Agent')))
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
    def invoke(self,source,*,host='app',mode='activity',mission='FLT-1827',options=None):
        with tempfile.TemporaryDirectory() as tmp:
            script=Path(tmp)/'mission-evidence.sh';shutil.copy2(source,script)
            (Path(tmp)/'quien-ejecuta.sh').write_text('printf "Morfeo %s MorfeoMacMini Claude\\n" "${YOKUP_HOST:-app}"\n')
            env={**os.environ,'YOKUP_API':f'http://127.0.0.1:{self.server.server_port}','YOKUP_ROLE':'main'}
            env.pop('YOKUP_HOST',None)
            if host is not None:env['YOKUP_HOST']=host
            args=['bash',str(script),mode,mission]
            args+=options if options is not None else ['--session-id','desktop:claude','--activity','implementation','--detail','Verifico el cambio real que acabo de aplicar']
            return subprocess.run(args,env=env,capture_output=True,text=True,timeout=10)
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

if __name__=='__main__':unittest.main()
