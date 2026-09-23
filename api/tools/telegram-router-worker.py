#!/usr/bin/env python3
"""Bounded private voice-note transcriber. No bot token or Twilio access.
Run using the locally installed Whisper Python. See CALLS-TELEGRAM.md.
"""
import argparse
import json
import os
import tempfile
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import whisper

parser = argparse.ArgumentParser()
parser.add_argument('--secret-file', required=True)
parser.add_argument('--minutes', type=int, default=120)
parser.add_argument('--model', default='small', choices=['tiny', 'small', 'large-v3-turbo'])
args = parser.parse_args()
secret_path = Path(args.secret_file)
if secret_path.stat().st_mode & 0o077:
    raise SystemExit('La credencial debe tener permisos 600.')
secret = secret_path.read_text().strip()
base = 'https://data.yokup.com/api/calls/telegram-worker'
model = whisper.load_model(args.model, device='cpu')
print('Modelo local listo; no se usan créditos de telefonía.', flush=True)


def api(path, data=None, lease=None, raw=False):
    headers = {'Authorization': 'Bearer ' + secret, 'User-Agent': 'Yokup-Router-Voice/1.0'}
    if lease:
        headers['X-Job-Lease'] = lease
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, headers=headers,
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=40) as response:
        body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            raise ValueError('Audio demasiado grande')
        return body if raw else json.loads(body)


def transcribe(job):
    lease, job_id = job['lease'], str(job['id'])
    audio = api('/audio/' + job_id, lease=lease, raw=True)
    # Raw audio is never retained beyond the job; transcripts stay in Yokup.
    with tempfile.TemporaryDirectory(prefix='yokup-voice-') as folder:
        path = os.path.join(folder, 'voice.ogg')
        Path(path).write_bytes(audio)
        result = model.transcribe(path, language='es', fp16=False,
            condition_on_previous_text=False, temperature=0,
            initial_prompt='Una respuesta breve sobre reiniciar un router: sí, no, listo, cancelar.')
    text = result.get('text', '').strip()[:500]
    segments = result.get('segments', [])
    uncertain = not text or not segments or any(
        s.get('no_speech_prob', 0) > .6 or s.get('avg_logprob', 0) < -1
        for s in segments)
    api('/result/' + job_id, {'transcript': text, 'uncertain': uncertain}, lease=lease)
    print('Nota de voz procesada y audio temporal eliminado.', flush=True)


deadline = time.monotonic() + min(max(args.minutes, 1), 180) * 60
with ThreadPoolExecutor(max_workers=1) as pool:
    current = None
    while time.monotonic() < deadline:
        try:
            api('/poll', {})
            if current and current.done():
                try:
                    current.result()
                except Exception as error:
                    # Never print request URLs, headers, voice or transcript.
                    print('No se pudo procesar una nota (' + type(error).__name__ + ').', flush=True)
                current = None
            if current is None:
                job = api('/job', {}).get('job')
                if job:
                    current = pool.submit(transcribe, job)
        except Exception as error:
            print('Servicio temporalmente no disponible (' + type(error).__name__ + ').', flush=True)
        time.sleep(4)
print('Ensayo local detenido al terminar su ventana de ejecución.', flush=True)
