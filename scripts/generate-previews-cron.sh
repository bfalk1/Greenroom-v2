#!/bin/bash
cd /home/ec2-user/clawd/greenroom
/home/ec2-user/.nvm/current/bin/npx tsx scripts/generate-previews.ts >> /tmp/greenroom-previews.log 2>&1
