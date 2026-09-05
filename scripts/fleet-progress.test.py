import argparse
import importlib.util
from pathlib import Path
import unittest
import io
import contextlib
import urllib.error
from unittest.mock import patch, MagicMock
spec=importlib.util.spec_from_file_location('progress',Path(__file__).with_name('fleet-progress.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ProgressTests(unittest.TestCase):
    def test_exact_one_shot_payload(self):
        args=argparse.Namespace(mission='DCL-real',owner='OraculoMacMini',runtime='Codex',host='app',session_id='desktop:codex',activity='verification',detail='Contrasto pruebas reales antes del cierre')
        payload=module.payload_for(args)
        self.assertEqual(payload['activity'],{'kind':'verification','detail':args.detail})
        self.assertEqual(payload['work_session'],{'runtime':'Codex','host':'app','session_id':'desktop:codex'})
        self.assertNotIn('image',payload)
    def test_old_api_or_unbound_cannot_claim_success(self):
        for data in ({'ok':True},{'ok':True,'work_binding':{'bound':True}}, {'ok':True,'work_binding':{'bound':False},'work_activity':{'accepted':True}}):
            with self.assertRaises(ValueError):module.verify_response(data)
    def test_ack_required(self):
        data={'ok':True,'mission':'DCL-real','work_binding':{'bound':True},'work_activity':{'accepted':True,'activity_at':1788597000000,'activity_kind':'verification','basis':'explicit_bound_progress','ttl_ms':120000}}
        self.assertTrue(module.verify_response(data)['bound'])
        data['work_activity']['basis']='heartbeat'
        with self.assertRaises(ValueError):module.verify_response(data)
    def test_transport_is_identified_and_checks_ack(self):
        data={'ok':True,'mission':'DCL-real','work_binding':{'bound':True},'work_activity':{'accepted':True,'activity_at':1788597000000,'activity_kind':'verification','basis':'explicit_bound_progress','ttl_ms':120000}}
        import json
        response=MagicMock(); response.__enter__.return_value=io.StringIO(json.dumps(data))
        with patch.object(module.urllib.request,'urlopen',return_value=response) as request, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(module.main(self.args()),0)
        req=request.call_args.args[0]
        self.assertEqual(req.get_header('User-agent'),'YokupFleetProgress/1.0')
        self.assertIsNone(req.get_header('Authorization'))
        request.assert_called_once()
    def test_http_network_and_old_api_fail_without_secret_body_or_retry(self):
        cases=[(urllib.error.HTTPError(module.API_URL,403,'private upstream error',{},io.BytesIO(b'private-token')), 'http_rejected'),(urllib.error.URLError('private-host-token'),'network_unavailable')]
        for error, expected in cases:
            output=io.StringIO()
            with patch.object(module.urllib.request,'urlopen',side_effect=error) as request, contextlib.redirect_stdout(output):
                self.assertEqual(module.main(self.args()),1)
            self.assertIn(expected,output.getvalue()); self.assertNotIn('private',output.getvalue()); request.assert_called_once()
        response=MagicMock(); response.__enter__.return_value=io.StringIO('{"ok":true}')
        with patch.object(module.urllib.request,'urlopen',return_value=response),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(module.main(self.args()),1)
    def args(self):
        return ['--mission','DCL-real','--owner','OraculoMacMini','--runtime','Codex','--host','app','--session-id','desktop:codex','--activity','verification','--detail','Contrasto pruebas de la misión real']
if __name__=='__main__':unittest.main()
