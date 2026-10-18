import importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('hue',pathlib.Path(__file__).with_name('lab-hue-controller.py'));hue=importlib.util.module_from_spec(spec);spec.loader.exec_module(hue)
class Tests(unittest.TestCase):
 def test_real_white_only_payload_and_exact_percentages(self):
  for state,bri in [('normal',254),('bugito',64),('admirito',127),('supervisor',191)]:
   d=hue.hue_payload('intensity',state,{'bri':254,'ct':366},False);self.assertEqual(d['bri'],bri);self.assertTrue(d['on']);self.assertNotIn('effect',d);self.assertNotIn('xy',d)
  self.assertEqual(hue.hue_payload('intensity','incident',{},False),{'on':False,'transitiontime':2})
 def test_rgb_cannot_be_enabled_on_white_ceiling(self):
  with self.assertRaises(ValueError):hue.hue_payload('rgb','bugito',{'bri':254,'ct':366},False)
  self.assertIn('xy',hue.hue_payload('rgb','bugito',{'bri':254,'ct':366},True))
  self.assertEqual(hue.hue_payload('rgb','normal',{'bri':254,'ct':366},True)['ct'],366)
 def test_no_physical_write_when_light_unreachable(self):
  c=hue.Controller({'bridge_ip':'local','api_key':'unused','light_ids':['9'],'mode':'intensity','baseline':{'ct':366}})
  calls=[]
  def request(url,data=None,method=None):calls.append(method);return {'state':{'reachable':False}}
  c.request=request
  with self.assertRaises(RuntimeError):c.apply({'state':'bugito','revision':'1'})
  self.assertEqual(calls,[None])
if __name__=='__main__':unittest.main()
