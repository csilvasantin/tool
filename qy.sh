#!/usr/bin/env bash
cd "$(dirname "$0")/yokup-rtc"
npx wrangler d1 execute yokup-tickets --remote --json --command "$1" 2>/dev/null \
 | python3 -c 'import sys,json
d=json.load(sys.stdin); r=d["result"] if isinstance(d,dict) else d
rows=r[0]["results"]
if not rows: print("(sin filas)")
for x in rows: print(" · ".join("%s=%s"%(k,x[k]) for k in x))'
