#!/bin/zsh
# Dev helpers for driving the IWER emulator from the shell.
cd "$(dirname $0)/.."
ev() { EXPR="$1" npx iwsdk browser run tools/eval.mjs 2>/dev/null | head -1; }
tgt() { ev "lanternfolk.targets['$1']"; }
seq() { npx iwsdk xr run-sequence --timeout 60000 --input-json "$1" 2>&1 | python3 -c "import json,sys;d=json.load(sys.stdin);r=d.get('data',{}).get('result',d);print(json.dumps({k:r.get(k) for k in ('completed','events','warnings','error')})[:600])"; }
