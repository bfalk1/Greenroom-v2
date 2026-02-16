#!/bin/bash
# Push and trigger Vercel deploy
set -e

cd /home/ec2-user/clawd/greenroom

# Push to GitHub
git push "$@"

# Trigger Vercel deploy webhook
echo "🚀 Triggering Vercel deploy..."
curl -s -X POST "https://api.vercel.com/v1/integrations/deploy/prj_RgwSiKgNmzL5Wfj7akHkOw3Mc3li/7CnSHs794C" | jq -r '.job.state // "TRIGGERED"'
