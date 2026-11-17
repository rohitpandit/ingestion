#!/usr/bin/env bash
# End-to-end check against a running API: register, upload the synthetic
# samples, wait for ingestion, run an analysis and print the result.
set -euo pipefail

API="${API:-http://localhost:4000/api}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
JAR="$(mktemp)"
SAMPLES="$(cd "$(dirname "$0")/.." && pwd)/samples/generated"
EMAIL="smoke-$(date +%s)@example.test"

post() { curl -sS -b "$JAR" -c "$JAR" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' "$@"; }

echo "1. register $EMAIL"
post -X POST "$API/auth/register" -d "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\"}" >/dev/null

echo "2. create workspace"
WORKSPACE=$(post -X POST "$API/workspaces" -d '{"name":"Smoke test"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "   workspace $WORKSPACE"

echo "3. upload samples (4 valid, 3 invalid)"
curl -sS -b "$JAR" -c "$JAR" -H "Origin: $ORIGIN" -X POST "$API/workspaces/$WORKSPACE/documents" \
  -F "files=@$SAMPLES/01-loan-application-form.pdf" \
  -F "files=@$SAMPLES/02-financial-statement.pdf" \
  -F "files=@$SAMPLES/03-trade-licence.pdf" \
  -F "files=@$SAMPLES/04-company-financials.csv" \
  -F "files=@$SAMPLES/invalid-not-really-a-pdf.pdf" \
  -F "files=@$SAMPLES/invalid-corrupt.pdf" \
  -F "files=@$SAMPLES/invalid-empty.csv" > /tmp/mdiw-upload.json
python3 -c "
import json
data = json.load(open('/tmp/mdiw-upload.json'))
print('   accepted:', [d['originalName'] for d in data['accepted']])
for r in data['rejected']:
    print('   rejected:', r['originalName'], '->', r['code'])
"

echo "4. wait for ingestion"
for _ in $(seq 1 40); do
  sleep 1
  curl -sS -b "$JAR" -c "$JAR" -H "Origin: $ORIGIN" "$API/workspaces/$WORKSPACE/documents" > /tmp/mdiw-docs.json
  if ! python3 -c "
import json,sys
docs = json.load(open('/tmp/mdiw-docs.json'))
sys.exit(0 if any(d['status'] in ('queued','processing') for d in docs) else 1)
"; then break; fi
done
python3 -c "
import json
for d in json.load(open('/tmp/mdiw-docs.json')):
    print(f\"   {d['originalName']}: {d['status']} type={d['detectedType']} facts={d['factCount']} {d['errorCode'] or ''}\")
"

echo "5. run analysis"
IDS=$(python3 -c "
import json
docs = json.load(open('/tmp/mdiw-docs.json'))
print(json.dumps([d['id'] for d in docs if d['status']=='ready']))
")
ANALYSIS=$(post -X POST "$API/workspaces/$WORKSPACE/analyses" \
  -d "{\"prompt\":\"Identify inconsistencies between the application form and supporting documents, and highlight discrepancies in names, addresses, licence details or revenue figures.\",\"documentIds\":$IDS}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "   analysis $ANALYSIS"

for _ in $(seq 1 40); do
  sleep 1
  curl -sS -b "$JAR" -c "$JAR" -H "Origin: $ORIGIN" "$API/analyses/$ANALYSIS" > /tmp/mdiw-analysis.json
  if ! python3 -c "
import json,sys
data = json.load(open('/tmp/mdiw-analysis.json'))
sys.exit(0 if data['status'] in ('queued','processing') else 1)
"; then break; fi
done

python3 -c "
import json
data = json.load(open('/tmp/mdiw-analysis.json'))
print('   status:', data['status'], data.get('error') or '')
r = data.get('result')
if not r: raise SystemExit(1)
print()
print('HEADLINE:', r['summary']['headline'])
print('SECTIONS:', r['sections'])
print()
print('DISCREPANCIES')
for d in r['discrepancies']:
    print(f\"  [{d['severity']}] {d['label']}: {d['description']}\")
    print(f\"      rationale: {d['rationale']}\")
print()
print('COMPARISON TABLE rows:', len(r['comparisonTable']['rows']))
for row in r['comparisonTable']['rows'][:12]:
    cells = ' | '.join((c['value'] or '-')[:28] for c in row['cells'])
    print(f\"  {row['agreement']:8} {row['label'][:34]:34} {cells}\")
print()
print('MISSING INFORMATION')
for m in r['missingInformation']:
    print(f\"  {m['documentName']} ({m['detectedType']}): {[x['label'] for x in m['missing']]}\")
print()
print('WARNINGS:', [w['message'] for w in r['warnings']])
"
echo
echo "Smoke test complete."
