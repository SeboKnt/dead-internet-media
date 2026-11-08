# Deno Deploy Port Fix Guide

## Das Problem
Deno Deploy startet mehrere Instanzen, aber unsere Server hängen an Port 8000 => Port Conflict!

## Die Lösung
1. **Benutze PORT Environment Variable wenn gesetzt** (macht Deno Deploy häufig)
2. **Falls nicht gesetzt: Port 8080 für Deploy, 8000 lokal**
3. **KEINE navigator/userAgent checks** (existiert nicht auf Server)

## Korrekte Implementierung

```typescript
// Start
if (import.meta.main) {
  // Bestimme Port: 
  // 1. Use PORT env if set (Deno Deploy might set this)
  // 2. If DENO_DEPLOYMENT_ID exists -> 8080
  // 3. Otherwise -> 8000
  const portEnv = Deno.env.get("PORT");
  const isDenoDeploy = !!Deno.env.get("DENO_DEPLOYMENT_ID");
  
  let port: number;
  if (portEnv) {
    port = parseInt(portEnv);
  } else if (isDenoDeploy) {
    port = 8080; // Default for Deno Deploy
  } else {
    port = 8000; // Local development
  }
  
  const aiKey = Deno.env.get("AI_API_KEY");
  
  console.log(`🚀 Dead Internet Media on port ${port}`);
  console.log(`🤖 AI Key: ${aiKey ? "***configured***" : "not set"}`);
  console.log(`📊 Rate limiting: 1 request/second, 1000/day`);
  console.log(`🌐 Base URL: https://api.airforce/v1`);
  console.log(`🧠 Model: gemma3-270m:free (KOSTENLOS!)`);
  
  if (isDenoDeploy) {
    const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
    console.log(`🌍 Running on Deno Deploy: https://${deploymentId}.deno.dev`);
  } else {
    console.log(`🌍 Local: http://localhost:${port}`);
  }
  
  serve(router, { port });
}
```

## Workflow Verbesserung

### Vor Deployment Check:
```bash
# 1. Teste lokale Deployment Simulation
DENO_DEPLOYMENT_ID="test-deploy" deno run --allow-net --allow-env --allow-read main.ts

# 2. Teste mit PORT env
PORT=8080 deno run --allow-net --allow-env --allow-read main.ts

# 3. Teste beides
DENO_DEPLOYMENT_ID="test" PORT=8080 deno run --allow-net --allow-env --allow-read main.ts
```

### Automatischer Test:
```bash
#!/bin/bash
# test_deploy.sh
export DENO_DEPLOYMENT_ID="test_$(date +%s)"
export PORT="8080"

echo "Testing deployment..."
timeout 5 deno run --allow-net --allow-env --allow-read main.ts &
PID=$!

sleep 2
if ps -p $PID > /dev/null; then
  echo "✅ Server started successfully"
  kill $PID
else
  echo "❌ Server failed to start"
  exit 1
fi
```