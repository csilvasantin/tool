#!/usr/bin/env python3
"""Fixed Lab Hue actuator. Secrets/config only from vault; cloud events are not optical proof."""
import argparse, fcntl, http.cookiejar, json, os, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

GETTER = Path.home() / 'Claude/admira-vault/vault-get.sh'
ROOT = Path.home() / '.config/admiranext/lab-hue'

def vault(name):
    r = subprocess.run(['bash', str(GETTER), name], capture_output=True, text=True, timeout=25)
    if r.returncode or not r.stdout.strip():
        raise RuntimeError('vault_value_unavailable:' + name)
    return r.stdout.strip()

def hue_payload(mode, state, baseline, supports_rgb):
    levels = {'normal':100, 'incident':0, 'bugito':25, 'supervisor':75, 'admirito':50}
    if state not in levels: raise ValueError('unknown_state')
    if mode == 'intensity':
        pct = levels[state]
        return {'on':False,'transitiontime':2} if pct == 0 else {'on':True,'bri':max(1,int(254*pct/100+.5)),'ct':baseline['ct'],'transitiontime':2}
    if mode != 'rgb' or not supports_rgb: raise ValueError('rgb_light_required')
    colors = {'bugito':[0.675,0.322], 'incident':[0.444,0.517], 'supervisor':[0.17,0.70]}
    return {'on':True,'bri':baseline['bri'],'effect':'none','transitiontime':2,**({'xy':colors[state]} if state in colors else {'ct':baseline['ct']})}

class Controller:
    def __init__(self, config):
        self.config = config
        self.api = config.get('event_api','https://api.admira.biz/agents/lab-lighting')
        if self.api != 'https://api.admira.biz/agents/lab-lighting': raise RuntimeError('fixed_api_required')
        self.base = 'http://' + config['bridge_ip'] + '/api/' + config['api_key']
        self.opener = None
        self.auth_at = 0
        self.last_revision = None
    def request(self, url, data=None, method=None, opener=None):
        req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0 (AdmiraNeXT Lab Hue)'}, method=method)
        with (opener or urllib.request.build_opener()).open(req, timeout=15) as r: return json.load(r)
    def desired(self):
        if not self.opener or time.time()-self.auth_at > 1800:
            self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            token = vault('ADMIRA_AGENT_LOGIN_TOKEN')
            req = urllib.request.Request('https://api.admira.biz/auth/agente',data=b'{}',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Agente':'OraculoMacMini Lab Hue','User-Agent':'Mozilla/5.0 (AdmiraNeXT Lab Hue)'})
            with self.opener.open(req,timeout=20) as r:
                if not json.load(r).get('ok'): raise RuntimeError('agent_login_failed')
            self.auth_at=time.time()
        try: return self.request(self.api,opener=self.opener)
        except urllib.error.HTTPError as e:
            if e.code in (401,403): self.opener=None
            raise RuntimeError('event_api_http_'+str(e.code)) from None
    def apply(self, desired):
        ids = self.config.get('light_ids') or []
        if not ids or any(not str(x).isdigit() for x in ids): raise RuntimeError('explicit_lights_required')
        # Validate ALL targets before mutating any; never use group 0 / every room.
        lights={lid:self.request(self.base+'/lights/'+lid) for lid in ids}
        for light in lights.values():
            if not light.get('state',{}).get('reachable'): raise RuntimeError('target_unreachable')
            if self.config['mode']=='rgb' and light.get('type')!='Extended color light': raise RuntimeError('rgb_light_required')
        if desired['revision']==self.last_revision: return None
        payload=hue_payload(self.config['mode'],desired['state'],self.config['baseline'],all(l.get('type')=='Extended color light' for l in lights.values()))
        for lid in ids:
            response=self.request(self.base+'/lights/'+lid+'/state',payload,'PUT')
            if not isinstance(response,list) or any('error' in item for item in response): raise RuntimeError('hue_rejected')
        time.sleep(.5)
        for lid in ids:
            state=self.request(self.base+'/lights/'+lid)['state']
            if not state.get('reachable') or state['on']!=payload['on']: raise RuntimeError('hue_readback_mismatch')
            if payload['on'] and abs(state['bri']-payload['bri'])>2: raise RuntimeError('hue_brightness_mismatch')
            if 'ct' in payload and payload['on'] and abs(state.get('ct',0)-payload['ct'])>2: raise RuntimeError('hue_white_mismatch')
            if 'xy' in payload and (len(state.get('xy',[]))!=2 or any(abs(a-b)>.06 for a,b in zip(state['xy'],payload['xy']))): raise RuntimeError('hue_color_mismatch')
        self.last_revision=desired['revision']
        return {'state':desired['state'],'intensity':desired['intensity'],'mode':self.config['mode'],'bridge_verified':True,'optically_verified':False,'at':int(time.time()*1000)}

def private_json(path, value):
    temp=path.with_suffix('.tmp')
    with os.fdopen(os.open(temp,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600),'w') as f: json.dump(value,f)
    os.replace(temp,path)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--once',action='store_true');p.add_argument('--inspect',action='store_true');a=p.parse_args()
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (ROOT/'controller.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise SystemExit('controller_already_running')
        config=json.loads(vault('ADMIRANEXT_LAB_HUE_CONFIG'));controller=Controller(config)
        if a.inspect:
            print(json.dumps({'site':config['site'],'mode':config['mode'],'lights':{i:{k:l.get(k) for k in ('name','type','state')} for i in config['light_ids'] for l in [controller.request(controller.base+'/lights/'+i)]}}));return
        while True:
            try:
                desired=controller.desired();result=controller.apply(desired)
                if result:private_json(ROOT/'status.json',result);print(json.dumps(result),flush=True)
            except Exception as error:
                # Exception text from urllib may contain URLs with API keys. Never log it.
                result={'error':type(error).__name__,'reason_type':type(getattr(error,'reason',None)).__name__,'errno':getattr(getattr(error,'reason',None),'errno',None),'bridge_verified':False,'at':int(time.time()*1000)}
                private_json(ROOT/'status.json',result);print(json.dumps(result),flush=True)
                if a.once:raise SystemExit(1)
            if a.once:return
            time.sleep(3)

if __name__=='__main__': main()
