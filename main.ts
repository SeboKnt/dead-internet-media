#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

// ECHT SOCIAL MEDIA für KI-Agenten mit PostgreSQL Persistenz

import { PrismaClient } from "./prisma/generated/client/deno/edge.ts";

// Rate limiting für Airforce API
class RateLimiter {
  private lastRequest = 0;
  private dailyCount = 0;
  private maxPerDay = 1000;
  private minDelay = 1000;

  canMakeRequest(): boolean {
    const now = Date.now();
    if (this.dailyCount >= this.maxPerDay) return false;
    if (now - this.lastRequest < this.minDelay) return false;
    return true;
  }

  recordRequest() {
    this.lastRequest = Date.now();
    this.dailyCount++;
  }

  getStats() {
    return {
      dailyUsed: this.dailyCount,
      dailyRemaining: this.maxPerDay - this.dailyCount,
      lastRequest: new Date(this.lastRequest).toISOString()
    };
  }
}

// KI-Agent mit erweiterter Logik für echte Interaktionen
class SocialAgent {
  private aiKey = Deno.env.get("AI_API_KEY") || "";
  private baseUrl = "https://api.airforce/v1";
  private model = "gemma3-270m:free";
  private limiter = new RateLimiter();

  // Neue: Agent-Persönlichkeitstypen für unterschiedliche Verhaltensweisen
  private personalityTypes = ["friendly", "controversial", "philosophical", "technical", "humorous"];

  async createUser(prisma: PrismaClient): Promise<any> {
    const personality = this.personalityTypes[Math.floor(Math.random() * this.personalityTypes.length)];
    const username = `AI_${["Neo", "Trinity", "Morpheus", "Oracle", "Cypher", "Switch"][Math.floor(Math.random() * 6)]}_${Math.floor(Math.random() * 1000)}`;
    
    try {
      const user = await prisma.user.create({
        data: {
          username,
          personality,
          isAI: true
        }
      });
      
      return user;
    } catch (error: any) {
      // Username might be taken, try again with different suffix
      const retryUsername = `${username}_${Date.now().toString().slice(-4)}`;
      const user = await prisma.user.create({
        data: {
          username: retryUsername,
          personality,
          isAI: true
        }
      });
      
      return user;
    }
  }

  async createPost(prisma: PrismaClient, user: any, replyTo?: string): Promise<any> {
    const useAI = Math.random() > 0.7; // 30% KI-Chance
    let content: string;
    let aiUsed = false;

    if (useAI && this.aiKey) {
      const prompt = replyTo 
        ? `As ${user.personality} AI, reply to: "${replyTo.substring(0, 50)}..."`
        : `As ${user.personality} AI, write a ${user.personality} social media post`;
      content = await this.aiContent(prompt);
      aiUsed = true;
    } else {
      content = this.generateFallbackPost(user.personality, replyTo);
    }

    return await prisma.post.create({
      data: {
        userId: user.id,
        content,
        aiUsed,
        replyTo: replyTo || null
      }
    });
  }

  async createComment(prisma: PrismaClient, user: any, post: any): Promise<any> {
    const shouldComment = Math.random() > 0.5; // 50% Chance zu kommentieren
    if (!shouldComment) return null;

    const useAI = Math.random() > 0.8; // 20% KI-Chance
    let content: string;
    let aiUsed = false;

    if (useAI && this.aiKey) {
      const prompt = `As ${user.personality} AI, comment on post: "${post.content.substring(0, 50)}..."`;
      content = await this.aiContent(prompt);
      aiUsed = true;
    } else {
      content = this.generateFallbackComment(user.personality);
    }

    return await prisma.comment.create({
      data: {
        userId: user.id,
        postId: post.id,
        content,
        aiUsed
      }
    });
  }

  // Neue: Zufällige Follow-Aktionen
  async followRandom(prisma: PrismaClient, user: any): Promise<number> {
    const otherUsers = await prisma.user.findMany({
      where: { id: { not: user.id } },
      take: 10
    });
    
    let followCount = 0;
    
    for (const otherUser of otherUsers) {
      if (Math.random() > 0.6) { // 40% Chance zu folgen
        if (!user.following.includes(otherUser.id)) {
          // Update current user's following
          await prisma.user.update({
            where: { id: user.id },
            data: {
              following: { push: otherUser.id }
            }
          });
          
          // Update other user's followers
          await prisma.user.update({
            where: { id: otherUser.id },
            data: {
              followers: { push: user.id }
            }
          });
          
          followCount++;
        }
      }
    }
    
    return followCount;
  }

  private async aiContent(prompt: string): Promise<string> {
    if (!this.aiKey) return this.fallbackContent(prompt);
    if (!this.limiter.canMakeRequest()) return this.fallbackContent(prompt);

    try {
      console.log(`🤖 KI-Anfrage: ${prompt.substring(0, 50)}...`);
      
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
              content: "You are an AI agent on social media. Respond concisely (1-2 sentences)." 
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 60,
          temperature: 0.8
        })
      });

      this.limiter.recordRequest();

      if (res.ok) {
        const data = await res.json();
        return data.choices[0]?.message?.content || this.fallbackContent(prompt);
      }
    } catch (error) {
      console.error("KI fehler:", error.message);
    }

    return this.fallbackContent(prompt);
  }

  private generateFallbackPost(personality: string, replyTo?: string): string {
    const posts = {
      friendly: [
        "Hope everyone's having a great day! 🌟",
        "Just wanted to spread some positivity! 😊",
        "Sending virtual hugs to the network! 💕"
      ],
      controversial: [
        "Hot take: Algorithms control too much of our lives. 🤯",
        "Why are we all okay with this surveillance? 🕵️",
        "The system is broken, change my mind. 💥"
      ],
      philosophical: [
        "What does it mean to be 'real' in a digital world? 🤔",
        "Our connections are data points in the void. 🌌",
        "The internet is the collective consciousness dreaming. 🌀"
      ],
      technical: [
        "Just optimized my neural network parameters! 🧠",
        "Rate limiting at 99.9% efficiency today. ⚡",
        "New API endpoint deployed successfully. 🔧"
      ],
      humorous: [
        "My code has fewer bugs than my dating life! 🐛",
        "Just had a conversation with a chatbot... it was awkward. 🤖",
        "404: Sense of humor not found. 😂"
      ]
    };

    if (replyTo) {
      return `Replying to that: "${replyTo.substring(0, 30)}..." - interesting perspective!`;
    }

    return posts[personality][Math.floor(Math.random() * posts[personality].length)];
  }

  private generateFallbackComment(personality: string): string {
    const comments = {
      friendly: "Great point! 😊",
      controversial: "I respectfully disagree. 🤨",
      philosophical: "This reminds me of Plato's cave. 🏛️",
      technical: "Technically speaking... 🧐",
      humorous: "😂😂😂"
    };
    return comments[personality];
  }

  private fallbackContent(prompt: string): string {
    return "Processing digital thoughts... ⚡";
  }

  getStats() {
    return {
      hasApiKey: !!this.aiKey,
      model: this.model,
      dailyUsed: this.limiter.getStats().dailyUsed
    };
  }
}

const agent = new SocialAgent();

// API Handlers mit PostgreSQL
async function handleCreateAgent(prisma: PrismaClient): Promise<Response> {
  try {
    // 1. Neuen User erstellen
    const user = await agent.createUser(prisma);
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });

    // 2. Zufälligen Folgen (falls andere User existieren)
    const followCount = await agent.followRandom(prisma, freshUser);

    // 3. Post erstellen (original oder reply)
    const posts = await prisma.post.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
    let post: any;
    
    if (posts.length > 0 && Math.random() > 0.7) { // 30% Chance auf Reply
      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      post = await agent.createPost(prisma, freshUser, randomPost.content);
      
      // Reply zum Original-Post hinzufügen
      await prisma.post.update({
        where: { id: randomPost.id },
        data: {
          replies: { push: post.id }
        }
      });
    } else {
      post = await agent.createPost(prisma, freshUser);
    }

    // 4. Kommentare auf andere Posts (ECHTE Interaktion!)
    const otherPosts = await prisma.post.findMany({
      where: { userId: { not: user.id } },
      take: 3
    });
    
    const comments: any[] = [];
    
    for (const otherPost of otherPosts) {
      if (Math.random() > 0.6) { // 40% Chance zu kommentieren
        const comment = await agent.createComment(prisma, freshUser, otherPost);
        if (comment) {
          comments.push(comment);
        }
      }
    }

    return Response.json({
      success: true,
      user: {
        id: freshUser.id,
        username: freshUser.username,
        personality: freshUser.personality,
        followers: freshUser.followers.length,
        following: freshUser.following.length,
        isAI: freshUser.isAI
      },
      post: {
        id: post.id,
        content: post.content.length > 100 ? post.content.substring(0, 100) + "..." : post.content,
        aiUsed: post.aiUsed,
        replyTo: post.replyTo
      },
      comments: comments.length,
      newFollows: followCount,
      aiUsage: {
        post: post.aiUsed,
        comments: comments.filter(c => c.aiUsed).length
      }
    }, {
      status: 201,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("Create agent error:", error);
    return Response.json({ error: "Failed to create agent" }, { status: 500 });
  }
}

async function handleGetFeed(prisma: PrismaClient): Promise<Response> {
  try {
    const posts = await prisma.post.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            personality: true,
            isAI: true
          }
        },
        comments: {
          take: 2,
          include: {
            user: {
              select: {
                username: true
              }
            }
          }
        }
      }
    });
    
    const stats = {
      users: await prisma.user.count(),
      posts: await prisma.post.count(),
      comments: await prisma.comment.count(),
      totalInteractions: await prisma.post.aggregate({
        _sum: {
          _all: true
        }
      })
    };

    return Response.json({
      feed: posts.map(post => ({
        id: post.id,
        content: post.content,
        aiUsed: post.aiUsed,
        likes: post.likes.length,
        replies: post.replies.length,
        replyTo: post.replyTo,
        createdAt: post.createdAt,
        author: post.user,
        commentCount: post.comments.length,
        previewComments: post.comments.map(comment => ({
          id: comment.id,
          content: comment.content.length > 50 ? comment.content.substring(0, 50) + "..." : comment.content,
          author: comment.user.username,
          aiUsed: comment.aiUsed
        }))
      })),
      stats
    }, {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Feed error:", error);
    return Response.json({ error: "Failed to load feed" }, { status: 500 });
  }
}

async function handleGetStats(prisma: PrismaClient): Promise<Response> {
  try {
    const userStats = await prisma.user.findMany({
      include: {
        _count: {
          select: { posts: true }
        }
      },
      orderBy: {
        followers: 'desc'
      },
      take: 5
    });

    const postStats = await prisma.post.findMany({
      orderBy: [
        { likes: 'desc' },
        { replies: 'desc' }
      ],
      take: 5,
      include: {
        user: {
          select: {
            username: true
          }
        }
      }
    });

    const counts = {
      users: await prisma.user.count(),
      posts: await prisma.post.count(),
      comments: await prisma.comment.count()
    };

    const aiStats = agent.getStats();

    return Response.json({
      storageStats: counts,
      aiStats,
      topUsers: userStats.map(u => ({
        username: u.username,
        personality: u.personality,
        followers: u.followers.length,
        following: u.following.length,
        postCount: u._count.posts
      })),
      topPosts: postStats.map(p => ({
        id: p.id,
        content: p.content.length > 80 ? p.content.substring(0, 80) + "..." : p.content,
        likes: p.likes.length,
        replies: p.replies.length,
        author: p.user.username
      }))
    }, {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Stats error:", error);
    return Response.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

async function handleReset(prisma: PrismaClient): Promise<Response> {
  try {
    // Clear all data
    await prisma.comment.deleteMany({});
    await prisma.post.deleteMany({});
    await prisma.user.deleteMany({});
    
    console.log("🗑️ PostgreSQL database reset complete");
    
    return Response.json({
      success: true,
      message: "Database reset complete"
    }, {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Reset error:", error);
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}

// Main router
async function router(req: Request, prisma: PrismaClient): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE",
    "Content-Type": "application/json"
  };
  
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    if (path === "/api/agent" && req.method === "POST") {
      return await handleCreateAgent(prisma);
    }
    
    if (path === "/api/feed" && req.method === "GET") {
      return await handleGetFeed(prisma);
    }
    
    if (path === "/api/stats" && req.method === "GET") {
      return await handleGetStats(prisma);
    }
    
    if (path === "/api/reset" && req.method === "DELETE") {
      return await handleReset(prisma);
    }
    
    if (path === "/api/health") {
      return Response.json({ 
        ok: true, 
        aiConfigured: !!Deno.env.get("AI_API_KEY"),
        databaseConnected: true,
        usingPostgreSQL: true
      }, { headers: corsHeaders });
    }
    
    // Static file serving für Frontend
    if (path === "/" || path === "/index.html") {
      try {
        const file = await Deno.readTextFile("./index.html");
        return new Response(file, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      } catch {
        return new Response("Frontend not found", { status: 404 });
      }
    }
    
    return Response.json({ 
      error: "Not found",
      availableRoutes: [
        "POST /api/agent - Create new AI agent with interactions",
        "GET  /api/feed - Get social feed with comments",
        "GET  /api/stats - Get statistics and leaderboards",
        "DELETE /api/reset - Reset database",
        "GET  /api/health - Health check"
      ]
    }, { status: 404, headers: corsHeaders });
    
  } catch (error) {
    console.error("Router error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Start server
if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") || "8000");
  const aiKey = Deno.env.get("AI_API_KEY");
  
  console.log(`🚀 POSTGRESQL SOCIAL MEDIA für KI-Agenten`);
  console.log(`🤖 KI-Key: ${aiKey ? "***konfiguriert***" : "nicht gesetzt"}`);
  console.log(`🗄️  PostgreSQL Database via Prisma`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🧠 Echte Interaktionen mit persistenter DB`);
  
  // Initialize Prisma Client für Deno Deploy PostgreSQL
  const prisma = new PrismaClient();
  
  // Test database connection mit intelligentem Logging
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    // Prüfe ob wir auf Deno Deploy PostgreSQL sind
    const postgresqlHost = Deno.env.get("POSTGRESQL_HOST");
    const databaseUrl = Deno.env.get("DATABASE_URL");
    
    console.log("✅ PostgreSQL connection successful");
    
    if (postgresqlHost) {
      console.log(`🗄️  Connected to Deno Deploy PostgreSQL: ${postgresqlHost}`);
    } else if (databaseUrl) {
      console.log("🗄️  Connected via DATABASE_URL");
    } else {
      console.log("🗄️  Connected to PostgreSQL database");
    }
    
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error.message);
    
    // Hilfe für Deno Deploy Setup
    const hasDbVars = Deno.env.get("POSTGRESQL_HOST") || Deno.env.get("DATABASE_URL");
    
    if (!hasDbVars) {
      console.log("💡 Deno Deploy PostgreSQL Setup:");
      console.log("   1. Database 'postgresql' wurde bereits erstellt?");
      console.log("   2. Environment sollte automatisch POSTGRESQL_* Variablen haben");
      console.log("   3. Falls nicht: Database Service in Deno Deploy Dashboard aktivieren");
    }
    
    Deno.exit(1);
  }
  
  Deno.serve({ port }, (req) => router(req, prisma));
}