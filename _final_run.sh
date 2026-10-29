cd /d/Projects/NGO--main
O="$TEMP/final_d12"
mkdir -p "$O"
npx tsc --noEmit --incremental false > "$O/tsc.log" 2>&1; echo "tsc exit $?" >> "$O/summary.log"
npx eslint . > "$O/eslint.log" 2>&1; echo "eslint exit $?" >> "$O/summary.log"
npx vitest run --exclude "tests/live/**" > "$O/offline.log" 2>&1; echo "offline exit $?" >> "$O/summary.log"
npm run build > "$O/build.log" 2>&1; echo "build exit $?" >> "$O/summary.log"
npx vitest run --config vitest.live.config.ts tests/live/config-readiness.live.test.ts tests/live/operations.live.test.ts tests/live/integrations.live.test.ts tests/live/drive-oauth.live.test.ts > "$O/live.log" 2>&1; echo "live exit $?" >> "$O/summary.log"
echo done >> "$O/summary.log"
