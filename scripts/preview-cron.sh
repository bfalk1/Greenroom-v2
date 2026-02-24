#!/bin/bash
# Preview generation cron script
# Runs the preview generator for any samples missing previews

cd /home/ec2-user/clawd/greenroom-v2
export PATH="/home/ec2-user/.local/share/pnpm/global/5/node_modules/.bin:$PATH"

# Log with timestamp
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Running preview generator..."

# Run the generator (it skips samples that already have previews)
npx tsx scripts/generate-previews.ts 2>&1 | tail -20

echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Done"
