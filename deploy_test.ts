#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test script to verify Deno Deploy compatibility
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Test what Deno Deploy actually provides
console.log("=== Deno Deploy Environment Test ===");
console.log("DENO_DEPLOYMENT_ID:", Deno.env.get("DENO_DEPLOYMENT_ID"));
console.log("PORT:", Deno.env.get("PORT"));
console.log("DENO_REGION:", Deno.env.get("DENO_REGION"));

// Try different detection methods
const detectionMethods = {
  hasDenoDeploymentId: !!Deno.env.get("DENO_DEPLOYMENT_ID"),
  hasPortEnv: !!Deno.env.get("PORT"),
  portValue: Deno.env.get("PORT"),
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "no navigator"
};

console.log("\n=== Detection Results ===");
console.log(JSON.stringify(detectionMethods, null, 2));

// What would our code choose?
const isDenoDeploy = detectionMethods.hasDenoDeploymentId;
const chosenPort = isDenoDeploy ? 8080 : parseInt(Deno.env.get("PORT") || "8000");

console.log(`\n=== Final Decision ===");
console.log(`isDenoDeploy: ${isDenoDeploy}`);
console.log(`Chosen PORT: ${chosenPort}`);

// Simulate Deno Deploy scenarios
console.log("\n=== Testing Scenarios ===");

// Scenario 1: Local development
console.log("\n1. LOCAL DEV (no env):");
console.log(`   PORT=${Deno.env.get("PORT") || "8000"} -> uses: 8000`);

// Scenario 2: With PORT env
Deno.env.set("PORT", "3000");
console.log("\n2. WITH PORT=3000:");
console.log(`   PORT=3000 -> uses: 3000`);

// Scenario 3: Deno Deploy simulated
Deno.env.set("DENO_DEPLOYMENT_ID", "test-deploy-id");
Deno.env.set("PORT", ""); // Clear PORT
console.log("\n3. DENO DEPLOY (no PORT env):");
console.log(`   DENO_DEPLOYMENT_ID=test-deploy-id`);
console.log(`   PORT=${Deno.env.get("PORT") || "not set"} -> uses: 8080`);

// Scenario 4: Mixed (shouldn't happen but test)
Deno.env.set("DENO_DEPLOYMENT_ID", "test-deploy-id");
Deno.env.set("PORT", "9999");
console.log("\n4. DENO DEPLOY with PORT=9999:");
console.log(`   DENO_DEPLOYMENT_ID=test-deploy-id`);
console.log(`   PORT=9999 -> uses: 8080 (forced!)`);

// Clean up
Deno.env.delete("DENO_DEPLOYMENT_ID");
Deno.env.delete("PORT");

console.log("\n💡 RECOMMENDATION:");
console.log("If logging shows 'Listening on http://localhost:8000/' on Deno Deploy,");
console.log("then Deno Deploy might not set PORT or our code ignores it.");
console.log("\nMaybe we should ALWAYS use 8080 for serve()?");
console.log("Or use 0 to let Deno choose automatically?");

// Test with port 0 (automatic assignment)
console.log("\n=== Testing port 0 ===");
console.log("Port 0 lets the OS choose a free port automatically.");
console.log("This is safest but we won't know the port until runtime.");