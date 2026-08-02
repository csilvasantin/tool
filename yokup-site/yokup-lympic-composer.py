#!/usr/bin/env python3
"""
Chiptune Olímpico ORIGINAL para Yokup Highscore.
Estilo Amstrad CPC / Spectrum: square (melodía) + triangle (bajo) + clicks 8-bit.
NO contiene audio extraido de YouTube ni de Daley Thompson's Decathlon (© Ocean).
Sintetizado con stdlib (wave + math) -> WAV 16-bit PCM monoaural.
"""
import math, wave, struct

SR = 48000
PASO = 0.20       # crotchet = 0.20 s (≈ 300 negreas/min)
VOL_MEL = 0.28
VOL_BAS = 0.09
VOL_CLK = 0.14

N = {
 "do":261.63,"re":293.66,"mi":329.63,"fa":349.23,"sol":392.00,
 "la":440.00,"si":493.88,"DO":523.25,"RE":587.33,"MI":659.25,
 "FA":698.46,"SOL":783.99,"LA":880.00,"SI":987.77,
}

# 8 compases. Melodía en C mayor, asciende + cascade, estatua griega.
MEL = [
 ["DO",0.5],["MI",0.5],["SOL",1],    ["DO",0.5],["MI",0.5],
 ["SOL",0.5],["SI",0.5],["SOL",1],   ["MI",0.5],["DO",0.5],
 ["RE",0.5],["FA",0.5],["LA",1],    ["FA",0.5],["RE",0.5],
 ["SOL",0.5],["SI",0.5],["SOL",1],  ["DO",2],
]
# Bajo en triángulo: progresión I-v-vi-IV-V-I (triángulo).
BAJO = [["do",2],["sol",2],["la",2],["fa",2],["sol",2],["do",2],["sol",2],["do",3]]

def square(t,f,duty=0.5):
    p=(t*f)%1.0
    return 1.0 if p<duty else -1.0
def tri(t,f):
    p=(t*f)%1.0
    return 2.0*abs(2.0*(p-0.25))-1.0
def click(tt,f):
    p=(tt*f)%1.0
    return 0.6*math.sin(8*math.pi*p)*(1.0-p)

def build(notes,wf):
    buf=[]; t=0.0
    for f,dur,vol in notes:
        n=int(dur*SR)
        for i in range(n):
            buf.append(vol*wf(t+i/SR, f))
        t+=dur
    return buf

def main():
    mel=build([(N[name],dur,VOL_MEL) for name,dur in MEL], square)
    bas=build([(N[name]/2,dur,VOL_BAS) for name,dur in BAJO], tri)
    L=max(len(mel),len(bas))
    mel += [0.0]*(L-len(mel))
    bas += [0.0]*(L-len(bas))
    # 4 campanillos 8-bit en la última medida (cuartos), triunfo final
    for k in range(4):
        pos=int(L-0.5*SR)+k*int(0.5*SR)
        for i in range(int(0.5*SR)):
            if 0<=pos+i<L:
                mel[pos+i]+=VOL_CLK*click((pos+i)/SR, 880.0)
    mixed=[max(-1.0,min(1.0, mel[i]+bas[i])) for i in range(L)]
    out="/Users/Carlos/Documents/Codex/Graficos/tool/yokup-site/media/lympic.wav"
    wv=wave.open(out,"wb")
    wv.setnchannels(1);wv.setsampwidth(2);wv.setframerate(SR)
    wv.writeframes(b"".join(struct.pack("<h",int(s*32767)) for s in mixed))
    wv.close()
    print("OK %.2fs -> %s"%(L/SR,out))

if __name__=="__main__":
    main()
