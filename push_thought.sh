#!/usr/bin/env bash
set -euo pipefail

cd /home/administratorzifeng/daoxu-site

# 校验 thought.json 完整性与 markdown 结构
python3 ./validate_thought.py thought.json

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
