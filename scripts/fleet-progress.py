#!/usr/bin/env python3
"""One actual work update. Never run this from a presence/idle timer."""
import argparse
import json
import sys
import urllib.error
import urllib.request

API_URL = 'https://api.yokup.com/fleet/progress'
KINDS = ('coordination', 'implementation', 'verification')

def payload_for(args):
    detail = args.detail.strip()
    if not 8 <= len(detail) <= 240 or any(ord(c) < 32 for c in detail):
        raise ValueError('detail debe describir trabajo real en 8–240 caracteres sin controles')
    for value in (args.mission, args.owner, args.runtime, args.session_id):
        if not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError('misión, owner y sesión exacta son obligatorios')
    return {'mission': args.mission.strip(), 'owner': args.owner.strip(), 'detail': detail,
            'work_session': {'runtime': args.runtime.strip(), 'host': args.host, 'session_id': args.session_id.strip()},
            'activity': {'kind': args.activity, 'detail': detail}}

def verify_response(data):
    signal = data.get('work_activity') or {}
    binding = data.get('work_binding') or {}
    at = signal.get('activity_at')
    if data.get('ok') is not True or binding.get('bound') is not True or signal.get('accepted') is not True:
        raise ValueError('La API no ha confirmado vínculo y actividad; no se declara avance aceptado')
    if signal.get('basis') != 'explicit_bound_progress' or type(at) not in (int, float) or at <= 0 or signal.get('ttl_ms') != 120000:
        raise ValueError('Respuesta de actividad ausente o incompatible; comprueba la versión publicada')
    return {'ok': True, 'mission': data.get('mission'), 'activity_at': at,
            'activity_kind': signal.get('activity_kind'), 'ttl_ms': signal['ttl_ms'], 'bound': True}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ('mission','owner','runtime','session-id','detail'):
        parser.add_argument('--'+field, required=True)
    parser.add_argument('--host', required=True, choices=('app','cli'))
    parser.add_argument('--activity', required=True, choices=KINDS)
    args = parser.parse_args(argv)
    try:
        payload = payload_for(args)
        request = urllib.request.Request(API_URL, data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(request, timeout=10) as response:
            result = verify_response(json.load(response))
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (ValueError, urllib.error.URLError, TimeoutError):
        # Do not echo arbitrary upstream bodies, request metadata or credentials.
        print(json.dumps({'ok': False, 'error':'Actividad no confirmada. Revisa misión abierta, owner, sesión exacta y API publicada.'}, ensure_ascii=False))
        return 1

if __name__ == '__main__':
    sys.exit(main())
