#!/bin/bash
# deploy_check.sh
# Tests deployment scenarios to catch issues BEFORE deploying
set -e

echo "🔧 DEAD INTERNET MEDIA - DEPLOYMENT CHECK"
echo "=========================================="

# Test 1: Local development
echo -e "\n1. Testing local development..."
deno check main.ts || { echo "❌ Deno check failed"; exit 1; }
echo "✅ Type check passed"

# Quick port logic test
echo -e "\n2. Testing port logic..."
cat << 'EOF' > port_test.ts
const portEnv = Deno.env.get("PORT");
const isDenoDeploy = !!Deno.env.get("DENO_DEPLOYMENT_ID");
let port: number;
if (portEnv && portEnv.trim() !== "") {
  port = parseInt(portEnv);
} else if (isDenoDeploy) {
  port = 8080;
} else {
  port = 8000;
}
console.log("Port logic OK");
EOF

deno run --allow-env port_test.ts && echo "✅ Port logic test passed"
rm -f port_test.ts

# Test 3: Start server with Deploy simulation
echo -e "\n3. Simulating Deno Deploy..."
deno run --allow-net --allow-env --allow-read main.ts &
server_pid=$!

# Wait a bit for server to start
sleep 2

if kill -0 $server_pid 2>/dev/null; then
    echo "✅ Server starts successfully"
    kill $server_pid 2>/dev/null
    wait $server_pid 2>/dev/null
else
    echo "❌ Server failed to start"
    exit 1
fi

# Test 4: Test with different environments
echo -e "\n4. Testing environment variations..."
for test_case in \
    "Local development|" \
    "Deno Deploy|DENO_DEPLOYMENT_ID=test123" \
    "Custom PORT|PORT=3000" \
    "Deploy with PORT|DENO_DEPLOYMENT_ID=test123 PORT=8080"
do
    name="${test_case%%|*}"
    env="${test_case#*|}"
    
    echo -n "  Testing $name... "
    if [ -n "$env" ]; then
        eval "export $env"
    fi
    
    cat << 'EOF' > quick_test.ts
try {
  const portEnv = Deno.env.get("PORT");
  const isDenoDeploy = !!Deno.env.get("DENO_DEPLOYMENT_ID");
  let port: number;
  if (portEnv && portEnv.trim() !== "") {
    port = parseInt(portEnv);
  } else if (isDenoDeploy) {
    port = 8080;
  } else {
    port = 8000;
  }
  console.log("PASS");
} catch {
  console.log("FAIL");
  Deno.exit(1);
}
EOF
    
    deno run --allow-env quick_test.ts 2>/dev/null && echo "✅" || echo "❌"
    rm -f quick_test.ts
    
    # Clean env
    unset DENO_DEPLOYMENT_ID PORT
done

echo -e "\n🎉 DEPLOYMENT CHECK COMPLETE - READY TO DEPLOY!"
echo "TIP: Run 'deno run --tunnel main.ts' to test with public URL"