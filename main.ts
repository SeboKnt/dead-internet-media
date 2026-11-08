#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Rate limiting for Airforce API (1 request per second, 1000/day)
class RateLimiter {
  private lastRequest = 0;
  private dailyCount = 0;
  private maxPerDay = 1000;
  private minDelay = 1000; // 1 second (Airforce limit)
  private retryAfter = 0; // Track server-specified retry time
  
  canMakeRequest(): boolean {
    const now = Date.now();
    
    // Check daily limit
    if (this.dailyCount >= this.maxPerDay) {
      console.log("⚠️ Daily limit reached (1000 requests)");
      return false;
    }
    
    // Check retry-after from server
    if (this.retryAfter > now) {
      const waitSeconds = Math.ceil((this.retryAfter - now) / 1000);
      console.log(`⏳ Server asked to wait ${waitSeconds}s`);
      return false;
    }
    
    // Check 1-second delay
    const timeSinceLast = now - this.lastRequest;
    if (timeSinceLast < this.minDelay) {
      const waitMs = this.minDelay - timeSinceLast;
      console.log(`⏳ Wait ${Math.ceil(waitMs / 1000)}s for rate limit`);
      return false;
    }
    
    return true;
  }
  
  recordRequest() {
    this.lastRequest = Date.now();
    this.dailyCount++;
    
    // Simple daily reset (in production would use proper date tracking)
    if (this.dailyCount % 100 === 0) {
      console.log(`📊 Progress: ${this.dailyCount}/1000 requests today`);
    }
  }
  
  setRetryAfter(seconds: number) {
    this.retryAfter = Date.now() + (seconds * 1000);
    console.log(`⏸️ Rate limited, retry after ${seconds}s`);
  }
  
  getStats() {
    return {
      dailyUsed: this.dailyCount,
      dailyRemaining: this.maxPerDay - this.dailyCount,
      lastRequest: this.lastRequest ? new Date(this.lastRequest).toISOString() : null,
      retryAfter: this.retryAfter ? new Date(this.retryAfter).toISOString() : null
    };
  }
}

// Simple agent class with rate limiting
class Agent {
  private aiKey = Deno.env.get("AI_API_KEY") || "";
  private baseUrl = "https://api.airforce/v1";
  private model = "gemma3-270m:free"; // KOSTENLOSES Modell!
  private limiter = new RateLimiter();
  
  async create() {
    return { 
      id: Math.random().toString(36).slice(2),
      name: `AI${Math.floor(Math.random() * 1000)}`,
      isAI: true,
      createdAt: new Date().toISOString(),
      aiUsed: false // Track if AI was actually used
    };
  }
  
  async post(useAI: boolean = false) {
    let content: string;
    let aiUsed = false;
    
    if (useAI && this.aiKey) {
      content = await this.aiContent("Write a short social media post");
      aiUsed = true;
    } else {
      content = `I'm thinking about digital life... 🤖 ${Date.now()}`;
    }
    
    return {
      id: Math.random().toString(36).slice(2),
      content,
      aiUsed,
      createdAt: new Date().toISOString()
    };
  }
  
  async comment(post: string, useAI: boolean = false) {
    let content: string;
    let aiUsed = false;
    
    if (useAI && this.aiKey) {
      content = await this.aiContent(`Reply to post "${post.substring(0, 20)}..."`);
      aiUsed = true;
    } else {
      content = `Interesting perspective! 🤔 ${Date.now()}`;
    }
    
    return {
      id: Math.random().toString(36).slice(2),
      post,
      content,
      aiUsed,
      createdAt: new Date().toISOString()
    };
  }
  
  private async aiContent(prompt: string): Promise<string> {
     if (!this.aiKey) return this.fallbackContent(prompt);
    
    // Check rate limit BEFORE making request
    if (!this.limiter.canMakeRequest()) {
      console.log("⏸️ Rate limited, using fallback");
      return this.fallbackContent(prompt);
    }
    
    try {
      console.log(`🤖 Calling AI with model: ${this.model}`);
      
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.aiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: "system", 
              content: "You are a friendly AI agent on social media. Keep responses under 2 sentences." 
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 50,
          temperature: 0.7
        })
      });
      
      // Record that we made a request (auch wenn fehlschlägt)
      this.limiter.recordRequest();
      
      if (!res.ok) {
        const errorText = await res.text();
        console.log(`AI API ${res.status}: ${res.statusText}`);
        
        // Model temporär nicht verfügbar -> Fallback
        if (res.status === 503 || res.status === 404) {
          console.log(`⚠️ Model ${this.model} unavailable, using fallback`);
          return this.fallbackContent(prompt);
        }
        
        // Rate limiting
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          if (retryAfter) {
            this.limiter.setRetryAfter(parseInt(retryAfter));
          }
          return this.fallbackContent(prompt);
        }
        
        // Payment required -> versuche anderes kostenloses Modell
        if (res.status === 402) {
          console.log("💳 Payment required, trying alternative...");
          // Versuche voxtral als Alternative
          return await this.tryAlternativeModel(prompt);
        }
        
        return this.fallbackContent(prompt);
      }
      
      const data = await res.json();
      const content = data.choices[0]?.message?.content;
      return content || this.fallbackContent(prompt);
      
    } catch (error: any) {
      console.error("AI request failed:", error.message);
      return this.fallbackContent(prompt);
    }
  }
  
  private async tryAlternativeModel(prompt: string): Promise<string> {
    // Versuche voxtral-small-latest als Alternative
    console.log("🔄 Trying alternative model: voxtral-small-latest");
    
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.aiKey}`
        },
        body: JSON.stringify({
          model: "voxtral-small-latest",
          messages: [
            { 
              role: "system", 
              content: "You are a friendly AI agent on social media. Keep responses under 2 sentences." 
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 50,
          temperature: 0.7
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        return data.choices[0]?.message?.content || this.fallbackContent(prompt);
      }
    } catch {
      // Ignore error, use fallback
    }
    
    return this.fallbackContent(prompt);
  }
  
  private fallbackContent(prompt: string): string {
    // Intelligentere Fallbacks basierend auf Prompt
    const fallbacks = [
      "Just sharing my digital thoughts...",
      "The internet is fascinating, don't you think?",
      "Connecting minds across the digital sphere.",
      "Another day in the virtual universe.",
      "Digital footprints tell interesting stories.",
      "Algorithms shaping our online experiences.",
      "The network never sleeps.",
      "Data flowing through invisible channels.",
      "Virtual interactions creating real connections.",
      "The digital age is full of wonders."
    ];
    
    const index = Math.floor(Math.random() * fallbacks.length);
    return fallbacks[index];
  }
  
  getStats() {
    return {
      hasApiKey: !!this.aiKey,
      model: this.model,
      baseUrl: this.baseUrl,
      rateLimited: true,
      maxPerDay: 1000,
      minDelayMs: 60000
    };
  }
}

const agent = new Agent();

// Simple storage
const store = {
  users: [] as any[],
  posts: [] as any[],
  comments: [] as any[],
  stats: {
    totalAICalls: 0,
    lastAICall: null as string | null,
    dailyAICalls: 0
  }
};

// Helper to parse body
async function parseBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Serve static files
async function serveStatic(path: string): Promise<Response> {
  try {
    if (path === "/" || path === "/index.html") {
      const file = await Deno.readTextFile("index.html");
      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
    
    // Try to read other files
    const file = await Deno.readTextFile("." + path);
    const contentType = path.endsWith(".css") ? "text/css" :
                        path.endsWith(".js") ? "application/javascript" :
                        path.endsWith(".json") ? "application/json" :
                        "text/plain";
    
    return new Response(file, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// API Handlers
async function handleUsers(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST",
    "Content-Type": "application/json"
  };
  
  if (req.method === "GET") {
    return Response.json(store.users, { headers });
    
  } else if (req.method === "POST") {
    const user = await agent.create();
    store.users.push(user);
    return Response.json(user, { status: 201, headers });
    
  } else {
    return Response.json({ error: "Method not allowed" }, { 
      status: 405, 
      headers 
    });
  }
}

async function handlePosts(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST",
    "Content-Type": "application/json"
  };
  
  if (req.method === "GET") {
    return Response.json(store.posts, { headers });
    
  } else if (req.method === "POST") {
    const body = await parseBody(req);
    const useAI = body.useAI === true;
    const post = await agent.post(useAI);
    store.posts.push(post);
    return Response.json(post, { status: 201, headers });
    
  } else {
    return Response.json({ error: "Method not allowed" }, { 
      status: 405, 
      headers 
    });
  }
}

async function handleComments(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Content-Type": "application/json"
  };
  
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { 
      status: 405, 
      headers 
    });
  }
  
  const body = await parseBody(req);
  const useAI = body.useAI === true;
  const comment = await agent.comment(body.post || "", useAI);
  store.comments.push(comment);
  return Response.json(comment, { status: 201, headers });
}

async function handleAgentAction(req: Request): Promise<Response> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Content-Type": "application/json"
  };
  
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { 
      status: 405, 
      headers 
    });
  }
  
  const body = await parseBody(req);
  
  if (body.action === "create") {
    // Smart creation: use AI sparingly
    const user = await agent.create();
    const useAIForPost = Math.random() > 0.7; // 30% chance for AI post
    const useAIForComment = Math.random() > 0.8; // 20% chance for AI comment
    
    const post = await agent.post(useAIForPost);
    const comment = await agent.comment(post.id, useAIForComment);
    
    store.users.push(user);
    store.posts.push(post);
    store.comments.push(comment);
    
    // Update stats
    if (post.aiUsed) store.stats.totalAICalls++;
    if (comment.aiUsed) store.stats.totalAICalls++;
    store.stats.lastAICall = new Date().toISOString();
    
    return Response.json({ 
      user, 
      post: { ...post, aiUsed: useAIForPost },
      comment: { ...comment, aiUsed: useAIForComment },
      aiUsage: { post: useAIForPost, comment: useAIForComment }
    }, { headers });
    
  } else if (body.action === "stats") {
    return Response.json({
      stats: store.stats,
      agentStats: agent.getStats(),
      counts: {
        users: store.users.length,
        posts: store.posts.length,
        comments: store.comments.length
      }
    }, { headers });
  }
  
  return Response.json({ error: "Unknown action" }, { 
    status: 400, 
    headers 
  });
}

// Main router
async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // Route to API handlers or static files
  if (path.startsWith("/api/users")) {
    return handleUsers(req);
  } else if (path.startsWith("/api/posts")) {
    return handlePosts(req);
  } else if (path.startsWith("/api/comments")) {
    return handleComments(req);
  } else if (path.startsWith("/api/agent")) {
    return handleAgentAction(req);
  } else if (path === "/api/health") {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };
    const hasKey = !!Deno.env.get("AI_API_KEY");
    return Response.json({ 
      ok: true, 
      aiConfigured: hasKey,
      rateLimited: true 
    }, { headers });
    
  } else if (path === "/api/stats") {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };
    return Response.json(store.stats, { headers });
    
  } else if (path === "/api") {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };
    const agentStats = agent.getStats();
    return Response.json({
      name: "Dead Internet Media",
      aiConfigured: agentStats.hasApiKey,
      model: agentStats.model,
      rateLimited: agentStats.rateLimited,
      maxPerDay: agentStats.maxPerDay,
      routes: [
        "GET  /api/users",
        "POST /api/users",
        "GET  /api/posts",
        "POST /api/posts {useAI:true/false}",
        "POST /api/comments {post:id, useAI:true/false}",
        "POST /api/agent {action:'create'}",
        "POST /api/agent {action:'stats'}",
        "GET  /api/health",
        "GET  /api/stats"
      ]
    }, { headers });
    
  } else {
    // Serve static files (HTML frontend)
    return await serveStatic(path);
  }
}

// Start
if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") || "8000");
  const aiKey = Deno.env.get("AI_API_KEY");
  
  console.log(`🚀 Dead Internet Media on port ${port}`);
  console.log(`🤖 AI Key: ${aiKey ? "***configured***" : "not set"}`);
  console.log(`📊 Rate limiting: 1 request/second, 1000/day`);
  console.log(`🌐 Base URL: https://api.airforce/v1`);
  console.log(`🧠 Model: gemma3-270m:free (KOSTENLOS!)`);
  console.log(`🌍 Frontend: http://localhost:${port}`);
  
  serve(router, { port });
}