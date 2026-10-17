#!/usr/bin/env python3
"""Submit ONE operator-reviewed capture from the existing Insta360; never opens a camera.
Run twice with two distinct, freshly inspected captures. Backend independently checks
fresh healthy player measurements. No phone credentials can close an incident.
"""
import argparse, http.cookiejar, json, re, subprocess, time, urllib.request
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('ticket');p.add_argument('photo',type=Path)
    p.add_argument('--captured-at',type=int,required=True,help='actual capture time in Unix milliseconds')
    p.add_argument('--reviewed-recovered',action='store_true',required=True,help='operator has visually confirmed the Fold has recovered in this capture')
    a=p.parse_args()
    if not re.fullmatch(r'INC-[A-Z0-9]{4,16}',a.ticket):p.error('ticket inválido')
    if not 0<=time.time()*1000-a.captured_at<120000:p.error('captura no reciente')
    photo=a.photo.read_bytes()
    if not photo.startswith(b'\xff\xd8\xff'):p.error('captura JPEG real requerida')
    helper=Path.home()/'Claude/admira-vault/vault-get.sh'
    result=subprocess.run(['bash',str(helper),'ADMIRA_AGENT_LOGIN_TOKEN'],capture_output=True,text=True,timeout=30)
    secret=result.stdout.strip() if result.returncode==0 else ''
    if not secret:raise RuntimeError('Entrada oficial de agentes no disponible')
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    auth=urllib.request.Request('https://api.yokup.com/auth/agente',data=b'{}',headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json','X-Agente':'OraculoMacMini · Supervisor Insta360','User-Agent':'Mozilla/5.0 (Admirito Supervisor)'})
    with opener.open(auth,timeout=25) as r:
        if not json.load(r).get('ok'):raise RuntimeError('Entrada no confirmada')
    del secret
    req=urllib.request.Request('https://api.yokup.com/agents/player-incidents/'+a.ticket+'/recovery',data=photo,headers={'Content-Type':'image/jpeg','X-Camera-Source':'macmini-insta360','X-Optical-Review':'recovered','X-Captured-At':str(a.captured_at),'User-Agent':'Mozilla/5.0 (Admirito Supervisor)'})
    with opener.open(req,timeout=25) as r:reply=json.load(r)
    print(json.dumps(reply,ensure_ascii=False))
if __name__=='__main__':main()
