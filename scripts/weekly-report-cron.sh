#!/bin/bash
# Weekly report cron job: run scanner, generate report, build email JSON, broadcast to all users
# Called by OpenClaw cron every Saturday at 10 AM IST (4:30 AM UTC)

set -e
cd /mnt/data/workspace/tikrr

echo "=== Step 1: Running daily anomaly scanner ==="
node scripts/daily-anomaly-scanner.js 2>&1

echo "=== Step 2: Generating weekly report ==="
node scripts/weekly-report-generator.js 2>&1

echo "=== Step 3: Building email report JSON ==="
node scripts/generate-report-json.js 2>&1

echo "=== Step 4: Sending to all users ==="
python3 scripts/send-weekly-broadcast.py 2>&1

echo "=== Done! ==="
