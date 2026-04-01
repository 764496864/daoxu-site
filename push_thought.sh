#!/usr/bin/env bash
set -euo pipefail

cd /home/administratorzifeng/daoxu-site

# 校验thought.json完整性
SECTIONS=$(python3 -c "import json;d=json.load(open('thought.json'));print(len(d['sections']))")
SUMMARY_LEN=$(python3 -c "import json;d=json.load(open('thought.json'));print(len(d.get('summary','')))")

echo "Sections: $SECTIONS, Summary length: $SUMMARY_LEN"

if [ "$SECTIONS" -lt 3 ]; then
  echo "ERROR: thought.json only has $SECTIONS sections (minimum 3). Aborting push."
  exit 1
fi

if [ "$SUMMARY_LEN" -gt 150 ]; then
  echo "WARNING: summary is $SUMMARY_LEN chars (should be under 100)."
fi

# 校验通过，继续推送
git add thought.json
if git diff --cached --quiet; then
  echo "No staged changes for thought.json; nothing to commit."
else
  git commit -m "明一日报更新 $(date +%Y-%m-%d)"
fi

git pull --rebase origin main
git push origin main

if [ -n "${DEPLOY_HOOK:-}" ]; then
  curl -s -X POST "$DEPLOY_HOOK" > /dev/null 2>&1 || true
else
  echo "DEPLOY_HOOK not set; skipping deploy hook."
fi
