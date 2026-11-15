#!/bin/zsh
# Build and publish Lanternfolk to https://lanternfolk.hayaix.tech
# (private S3 bucket behind CloudFront; AWS CLI profile "hayaitech").
set -euo pipefail
cd "$(dirname $0)/.."
export AWS_PROFILE=${AWS_PROFILE:-hayaitech} AWS_PAGER=""
BUCKET=lanternfolk-site-931122829234
DIST_ID=${DIST_ID:-$(cat tools/.distribution-id 2>/dev/null || true)}

npm run typecheck
npm test
NODE_ENV=production npm run build
# Hashed assets: cache for a year. Everything else: always revalidate.
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 sync dist "s3://$BUCKET" --delete --exclude "assets/*" --exclude "*.md" --cache-control "public,max-age=60,must-revalidate"
if [[ -n "$DIST_ID" ]]; then
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query 'Invalidation.Status' --output text
fi
echo "Deployed to https://lanternfolk.hayaix.tech"
