#!/bin/bash

echo "🚀 Dead Internet Media Deployment"
echo "================================"

# Check for Deno Deploy
if ! command -v deployctl &> /dev/null; then
    echo "Installing deployctl..."
    deno install -A jsr:@deno/deployctl
fi

# Git status
echo -e "\n📊 Git Status:"
git status --short

# Test locally first
echo -e "\n🧪 Local Test:"
deno run --allow-net --allow-env --allow-read main.ts &
PID=$!
sleep 2
curl -s http://localhost:8000/api/health | jq .
kill $PID 2>/dev/null

# Deployment instructions
echo -e "\n📋 Deploy Instructions:"
echo "1. Create project on Deno Deploy:"
echo "   deployctl projects create dead-internet-media"
echo ""
echo "2. Set environment variables:"
echo "   deployctl env set AI_API_KEY \"your-api-key\""
echo "   (Optional: deployctl env set PORT \"8080\")"
echo ""
echo "3. Deploy:"
echo "   deployctl deploy --prod main.ts"
echo ""
echo "🌐 Project will be available at:"
echo "   https://dead-internet-media.deno.dev"
echo ""
echo "🤖 API Key: Use your Airforce API key"
echo "   Model: gemma3-270m:free (kostenlos!)"
echo "   Rate Limit: 1 request/second, 1000/day"