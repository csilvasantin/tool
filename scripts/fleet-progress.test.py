import argparse
import importlib.util
from pathlib import Path
import unittest
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
if __name__=='__main__':unittest.main()
