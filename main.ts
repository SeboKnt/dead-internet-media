#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

// ECHT SOCIAL MEDIA für KI-Agenten mit PostgreSQL - SIMPLE VERSION ohne Prisma

import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// PostgreSQL Client
async function getPostgresClient() {
  // AUTO-DETECT Deno Deploy PostgreSQL
  const host = Deno.env.get("POSTGRESQL_HOST") || "localhost";
  const username = Deno.env.get("POSTGRESQL_USERNAME") || "postgres";
  const password = Deno.env.get("POSTGRESQL_PASSWORD") || "";
  const database = Deno.env.get("POSTGRESQL_DATABASE") || "postgresql";
  const port = Deno.env.get("POSTGRESQL_PORT") || "5432";

  const client = new Client({
    hostname: host,
    port: parseInt(port),
    user: username,
    password: password,
    database: database,
  });

  await client.connect();
  return client;
}

// Database Setup (wird nur einmal gemacht)
async function setupDatabase(client: Client) {
  try {
    // Prüfe ob Tables existieren
    const result = await client.queryArray`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `;
    
    if (!result.rows[0][0]) {
      console.log("📦 Creating database tables...");
      
      // Users Table
      await client.queryArray`
        CREATE TABLE users (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          username TEXT UNIQUE NOT NULL,
          personality TEXT NOT NULL,
          followers TEXT[] DEFAULT '{}',
          following TEXT[] DEFAULT '{}',
          is_ai BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      // Posts Table
      await client.queryArray`
        CREATE TABLE posts (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT REFERENCES users(id),
          content TEXT NOT NULL,
          ai_used BOOLEAN DEFAULT FALSE,
          likes TEXT[] DEFAULT '{}',
          replies TEXT[] DEFAULT '{}',
          reply_to TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      // Comments Table
      await client.queryArray`
        CREATE TABLE comments (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT REFERENCES users(id),
          post_id TEXT REFERENCES posts(id),
          content TEXT NOT NULL,
          ai_used BOOLEAN DEFAULT FALSE,
          likes TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      console.log("✅ Database tables created");
    } else {
      console.log("✅ Database tables already exist");
    }
  } catch (error) {
    console.error("Database setup error:", error.message);
    throw error;
  }
}

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

  async createUser(client: Client): Promise<any> {
    const personality = this.personalityTypes[Math.floor(Math.random() * this.personalityTypes.length)];
    const username = `AI_${["Neo", "Trinity", "Morpheus", "Oracle", "Cypher", "Switch"][Math.floor(Math.random() * 6)]}_${Math.floor(Math.random() * 1000)}`;
    
    try {
      const result = await client.queryArray`
        INSERT INTO users (username, personality) 
        VALUES (${username}, ${personality})
        RETURNING id, username, personality, followers, following, is_ai, created_at
      `;
      
      return {
        id: result.rows[0][0],
        username: result.rows[0][1],
        personality: result.rows[0][2],
        followers: result.rows[0][3],
        following: result.rows[0][4],
        isAI: result.rows[0][5],
        createdAt: result.rows[0][6]
      };
    } catch (error: any) {
      // Username might be taken, try again with different suffix
      const retryUsername = `${username}_${Date.now().toString().slice(-4)}`;
      const result = await client.queryArray`
        INSERT INTO users (username, personality) 
        VALUES (${retryUsername}, ${personality})
        RETURNING id, username, personality, followers, following, is_ai, created_at
      `;
      
      return {
        id: result.rows[0][0],
        username: result.rows[0][1],
        personality: result.rows[0][2],
        followers: result.rows[0][3],
        following: result.rows[0][4],
        isAI: result.rows[0][5],
        createdAt: result.rows[0][6]
      };
    }
  }

  async createPost(client: Client, user: any, replyTo?: string): Promise<any> {
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

    const result = await client.queryArray`
      INSERT INTO posts (user_id, content, ai_used, reply_to)
      VALUES (${user.id}, ${content}, ${aiUsed}, ${replyTo || null})
      RETURNING id, user_id, content, ai_used, likes, replies, reply_to, created_at
    `;
    
    return {
      id: result.rows[0][0],
      userId: result.rows[0][1],
      content: result.rows[0][2],
      aiUsed: result.rows[0][3],
      likes: result.rows[0][4],
      replies: result.rows[0][5],
      replyTo: result.rows[0][6],
      createdAt: result.rows[0][7]
    };
  }

  async createComment(client: Client, user: any, post: any): Promise<any> {
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

    const result = await client.queryArray`
      INSERT INTO comments (user_id, post_id, content, ai_used)
      VALUES (${user.id}, ${post.id}, ${content}, ${aiUsed})
      RETURNING id, user_id, post_id, content, ai_used, likes, created_at
    `;
    
    return {
      id: result.rows[0][0],
      userId: result.rows[0][1],
      postId: result.rows[0][2],
      content: result.rows[0][3],
      aiUsed: result.rows[0][4],
      likes: result.rows[0][5],
      createdAt: result.rows[0][6]
    };
  }

  // Neue: Zufällige Follow-Aktionen
  async followRandom(client: Client, user: any): Promise<number> {
    const result = await client.queryArray`
      SELECT id FROM users WHERE id != ${user.id} LIMIT 10
    `;
    
    let followCount = 0;
    
    for (const row of result.rows) {
      const otherUserId = row[0];
      if (Math.random() > 0.6) { // 40% Chance zu folgen
        if (!user.following.includes(otherUserId)) {
          // Update current user's following
          await client.queryArray`
            UPDATE users 
            SET following = array_append(following, ${otherUserId})
            WHERE id = ${user.id}
          `;
          
          // Update other user's followers
          await client.queryArray`
            UPDATE users 
            SET followers = array_append(followers, ${user.id})
            WHERE id = ${otherUserId}
          `;
          
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

async function handleCreateAgent(client: Client): Promise<Response> {
  try {
    // 1. Database setup (falls nötig)
    await setupDatabase(client);

    // 2. Neuen User erstellen
    const user = await agent.createUser(client);

    // 3. Zufälligen Folgen (falls andere User existieren)
    const followCount = await agent.followRandom(client, user);

    // 4. Post erstellen (original oder reply)
    const postsResult = await client.queryArray`
      SELECT id, content FROM posts ORDER BY created_at DESC LIMIT 10
    `;
    
    let post: any;
    const posts = postsResult.rows;
    
    if (posts.length > 0 && Math.random() > 0.7) { // 30% Chance auf Reply
      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      post = await agent.createPost(client, user, randomPost[1]);
      
      // Reply zum Original-Post hinzufügen
      await client.queryArray`
        UPDATE posts 
        SET replies = array_append(replies, ${post.id})
        WHERE id = ${randomPost[0]}
      `;
    } else {
      post = await agent.createPost(client, user);
    }

    // 5. Kommentare auf andere Posts
    const otherPostsResult = await client.queryArray`
      SELECT id, content FROM posts WHERE user_id != ${user.id} LIMIT 3
    `;
    
    let commentCount = 0;
    for (const row of otherPostsResult.rows) {
      const otherPost = { id: row[0], content: row[1] };
      if (Math.random() > 0.6) { // 40% Chance zu kommentieren
        const comment = await agent.createComment(client, user, otherPost);
        if (comment) commentCount++;
      }
    }

    return Response.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        personality: user.personality,
        followers: user.followers.length,
        following: user.following.length,
        isAI: user.isAI
      },
      post: {
        id: post.id,
        content: post.content.length > 100 ? post.content.substring(0, 100) + "..." : post.content,
        aiUsed: post.aiUsed,
        replyTo: post.replyTo
      },
      comments: commentCount,
      newFollows: followCount
    }, {
      status: 201,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("Create agent error:", error);
    return Response.json({ error: "Failed to create agent" }, { status: 500 });
  }
}

async function handleGetFeed(client: Client): Promise<Response> {
  try {
    await setupDatabase(client);
    
    const postsResult = await client.queryArray`
      SELECT p.*, u.username, u.personality, u.is_ai
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 20
    `;
    
    const statsResult = await client.queryArray`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM posts) as posts,
        (SELECT COUNT(*) FROM comments) as comments
    `;

    return Response.json({
      feed: postsResult.rows.map(row => ({
        id: row[0],
        content: row[2],
        aiUsed: row[3],
        likes: row[4]?.length || 0,
        replies: row[5]?.length || 0,
        replyTo: row[6],
        createdAt: row[8],
        author: {
          username: row[9],
          personality: row[10],
          isAI: row[11]
        }
      })),
      stats: {
        users: Number(statsResult.rows[0][0]),
        posts: Number(statsResult.rows[0][1]),
        comments: Number(statsResult.rows[0][2])
      }
    }, {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Feed error:", error);
    return Response.json({ error: "Failed to load feed" }, { status: 500 });
  }
}

async function handleReset(client: Client): Promise<Response> {
  try {
    await client.queryArray`DELETE FROM comments`;
    await client.queryArray`DELETE FROM posts`;
    await client.queryArray`DELETE FROM users`;
    
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
async function router(req: Request, client: Client): Promise<Response> {
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
      return await handleCreateAgent(client);
    }
    
    if (path === "/api/feed" && req.method === "GET") {
      return await handleGetFeed(client);
    }
    
    if (path === "/api/reset" && req.method === "DELETE") {
      return await handleReset(client);
    }
    
    if (path === "/api/health") {
      return Response.json({ 
        ok: true, 
        aiConfigured: !!Deno.env.get("AI_API_KEY"),
        databaseConnected: true,
        usingPostgreSQL: true,
        simplified: true
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
        "GET  /api/feed - Get social feed",
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
  
  console.log(`🚀 SIMPLE POSTGRESQL SOCIAL MEDIA für KI-Agenten`);
  console.log(`🤖 KI-Key: ${aiKey ? "***konfiguriert***" : "nicht gesetzt"}`);
  console.log(`🗄️  PostgreSQL Database via deno-postgres`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🧠 Echte Interaktionen ohne Prisma Abhängigkeit`);
  
  try {
    // PostgreSQL Client initialisieren
    const client = await getPostgresClient();
    console.log("✅ PostgreSQL connection successful");
    
    // Setup database wenn nötig
    await setupDatabase(client);
    
    Deno.serve({ port }, (req) => router(req, client));
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error.message);
    console.log("💡 Deno Deploy sollte POSTGRESQL_* Variablen automatisch setzen");
    Deno.exit(1);
  }
}