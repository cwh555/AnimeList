#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HEAD="072f3dbd0a6dd125c65c15ed061f724e58ac3222"
PAYLOAD_DIR=".serial-cover-final-payload-small"
EXTRACT_DIR="/tmp/serial-cover-final"

checks=(
  "c9ef31aa0996e29db08ae68272dc908e460f22f0d0a92e65ea16b8dbbf30fe56  $PAYLOAD_DIR/piece-000"
  "4a77aa3a62cea69249f4cff424497779ff79eefc8ce9f98b86ec5c25af3d52af  $PAYLOAD_DIR/piece-001"
  "557a1071e765f137d2760e2ffddcc3988c7cd4bc0eb42d1f89902174c0f07d6d  $PAYLOAD_DIR/piece-002"
  "d1eca74c0c200bfe0f7214a5d9a5444a81049d623b73501b19d5f7ff4602961c  $PAYLOAD_DIR/piece-003"
  "9a07c1b45b9baa5af25dd3a35c0c6002b57fb89689cc4841226968f2f9b60585  $PAYLOAD_DIR/piece-004"
  "302a17975ba375330ab1253cb35dbf965929455c3bfc9590d03f7489528867b9  $PAYLOAD_DIR/piece-005"
  "22d4786300cd74572e79338f55cb270e6d7afed88d464e0400752b2bf2c14d7e  $PAYLOAD_DIR/piece-006"
  "29c151f996379f4db38a5b5047b3da3362a4c36a63a9d9327519107b98744740  $PAYLOAD_DIR/piece-007"
  "1e5ef44b3be445ea1c018e771fe6f923d73f96f6a84922fb4e43b9754de5601f  $PAYLOAD_DIR/piece-008"
  "e7dfabeed34273bb334af74652aa5e46f211814104ca5e0881cca7be56c72649  $PAYLOAD_DIR/piece-009"
  "415cba82bdd8ffa1ff55dc8aac98aa5d55539901667f1713bfc331e7f24504e5  $PAYLOAD_DIR/piece-010"
  "6eebff481d51d7a3fda2e204b9dc97f5478eae093d069d7c5516ce859861d65c  $PAYLOAD_DIR/piece-011"
)
for check in "${checks[@]}"; do echo "$check" | sha256sum -c -; done

cat "$PAYLOAD_DIR"/piece-* > /tmp/serial-cover-final.b64
echo "78027a222420c7879ad0ff646baa75685331c1873cd3b52d25a60c830d21681b  /tmp/serial-cover-final.b64" | sha256sum -c -
base64 --decode /tmp/serial-cover-final.b64 > /tmp/serial-cover-final.tar.gz
echo "b13a9960e222f6f7741e3d44f628f18aa8efb83e8ce169e76b76179c145efe7b  /tmp/serial-cover-final.tar.gz" | sha256sum -c -
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
tar -xzf /tmp/serial-cover-final.tar.gz -C "$EXTRACT_DIR"

cp .github/scripts/serial-cover-final-live.ts /tmp/serial-cover-final-live.ts
(
  cd "$EXTRACT_DIR"
  git apply "$GITHUB_WORKSPACE/.serial-cover-final-fix.patch"
  echo "061a45800a56a6a3200d44c5a86f68c39ff58228ce521f0b33cb5f4d6c55b016  src/serial-cover-provider.ts" | sha256sum -c -
  echo "de93b97cbd11c96a0ee55e09044a727795d5cbd7df21029747b04186842f0729  src/serial-entry-cover.ts" | sha256sum -c -
  echo "1b51a389e28fe04a2b90a43fd66bb0941c1e05b0c5a10d5aa0b61107d1d8ced8  src/serial-cover-service.ts" | sha256sum -c -
  echo "8441fc40ec4a029df487e6849202754cc451332991913af1c54f01a369fbc71f  src/serial-cover-text.ts" | sha256sum -c -
  echo "5fdb4326e710849a196ea8026d28c19f2f8729706ba2e64d227059ea48416586  tests/serial-entry-cover.test.ts" | sha256sum -c -
)

git fetch origin chore/serial-cover-final-publish feature/serial-entry-covers
test "$(git rev-parse origin/chore/serial-cover-final-publish)" = "$EXPECTED_HEAD"
test "$(git rev-parse origin/feature/serial-entry-covers)" = "$EXPECTED_HEAD"
git checkout -B chore/serial-cover-final-publish origin/chore/serial-cover-final-publish
cp -a "$EXTRACT_DIR"/. .

npm ci
npm run check
npm run release:check
ANIMELIST_TEST_VAULT_NO_OPEN=1 npm run test-vault

mkdir -p .tmp .github/scripts
cp /tmp/serial-cover-final-live.ts .github/scripts/serial-cover-final-live.ts
cat > .tmp/obsidian-live.ts <<'TS'
export async function requestUrl(options: { url: string; method?: string; body?: string; headers?: Record<string, string> }): Promise<{ json: unknown; text: string }> {
  const response = await fetch(options.url, { method: options.method ?? "GET", body: options.body, headers: options.headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`) as Error & { status: number; response: { status: number; headers: Headers } };
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };
    throw error;
  }
  return { json: text ? JSON.parse(text) : {}, text };
}
TS
set +e
npx esbuild .github/scripts/serial-cover-final-live.ts --bundle --platform=node --format=esm --target=node24 --alias:obsidian=./.tmp/obsidian-live.ts --outfile=.tmp/serial-cover-final-live.mjs > serial-cover-live.log 2>&1
status=$?
if [ "$status" -eq 0 ]; then
  node .tmp/serial-cover-final-live.mjs >> serial-cover-live.log 2>&1
  status=$?
fi
set -e
cat serial-cover-live.log
if [ "$status" -ne 0 ]; then exit "$status"; fi
node -e 'const r=require("./serial-cover-live-report.json"); if(r.length!==40) throw new Error(`Expected 40, got ${r.length}`)'

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add src/serial-cover-provider.ts src/serial-entry-cover.ts src/serial-cover-service.ts src/serial-cover-text.ts tests/serial-entry-cover.test.ts
git commit -m "fix: use reliable Bangumi serial cover lookup"
git push --force-with-lease=refs/heads/chore/serial-cover-final-publish:$EXPECTED_HEAD origin HEAD:chore/serial-cover-final-publish
