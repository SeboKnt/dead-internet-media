#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

// 🤖 Dead Internet Media - ROBUSTE Version mit Fallback
// Funktioniert mit: PostgreSQL ODER in-memory storage 👍

// Database Interface - Multi-Storage Support
interface Database {
  initialize(): Promise<void>;
  createUser(username: string, personality: string): Promise<any>;
  createPost(userId: string, content: string, aiUsed: boolean, replyTo?: string): Promise<any>;
  createComment(userId: string, postId: string, content: string, aiUsed: boolean): Promise<any>;
  getUsers(): Promise<any[]>;
  getPosts(limit?: number): Promise<any[]>;
  updateUserFollows(userId: string, otherUserId: string): Promise<void>;
  reset(): Promise<void>;
  stats(): Promise<{ users: number; posts: number; comments: number }>;
}

// PostgreSQL Database Implementation
class PostgresDatabase implements Database {
  private client: any = null;

  async initialize(): Promise<void> {
    const host = Deno.env.get("POSTGRESQL_HOST");
    const username = Deno.env.get("POSTGRESQL_USERNAME");
    const password = Deno.env.get("POSTGRESQL_PASSWORD");
    const database = Deno.env.get("POSTGRESQL_DATABASE");
    const port = Deno.env.get("POSTGRESQL_PORT");

    if (!host || !username || !password || !database) {
      throw new Error("PostgreSQL environment variables not set");
    }

    // Dynamischer Import für deno-postgres
    const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
    
    this.client = new Client({
      hostname: host,
      port: parseInt(port || "5432"),
      user: username,
      password: password,
      database: database,
    });

    await this.client.connect();
    
    // Create tables if needed
    await this.setupTables();
    console.log("✅ Connected to PostgreSQL Database");
  }

  private async setupTables() {
    try {
      // Users Table
      await this.client.queryArray`
        CREATE TABLE IF NOT EXISTS users (
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
      await this.client.queryArray`
        CREATE TABLE IF NOT EXISTS posts (
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
      await this.client.queryArray`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT REFERENCES users(id),
          post_id TEXT REFERENCES posts(id),
          content TEXT NOT NULL,
          ai_used BOOLEAN DEFAULT FALSE,
          likes TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
    } catch (error) {
      console.error("PostgreSQL setup error:", error.message);
      throw error;
    }
  }

  async createUser(username: string, personality: string): Promise<any> {
    const result = await this.client.queryArray`
      INSERT INTO users (username, personality) 
      VALUES (${username}, ${personality})
      RETURNING id, username, personality, followers, following, is_ai
    `;
    
    return {
      id: result.rows[0][0],
      username: result.rows[0][1],
      personality: result.rows[0][2],
      followers: result.rows[0][3] || [],
      following: result.rows[0][4] || [],
      isAI: result.rows[0][5]
    };
  }

  async createPost(userId: string, content: string, aiUsed: boolean, replyTo?: string): Promise<any> {
    const result = await this.client.queryArray`
      INSERT INTO posts (user_id, content, ai_used, reply_to)
      VALUES (${userId}, ${content}, ${aiUsed}, ${replyTo || null})
      RETURNING id, user_id, content, ai_used, likes, replies, reply_to
    `;
    
    return {
      id: result.rows[0][0],
      userId: result.rows[0][1],
      content: result.rows[0][2],
      aiUsed: result.rows[0][3],
      likes: result.rows[0][4] || [],
      replies: result.rows[0][5] || [],
      replyTo: result.rows[0][6]
    };
  }

  async createComment(userId: string, postId: string, content: string, aiUsed: boolean): Promise<any> {
    const result = await this.client.queryArray`
      INSERT INTO comments (user_id, post_id, content, ai_used)
      VALUES (${userId}, ${postId}, ${content}, ${aiUsed})
      RETURNING id, user_id, post_id, content, ai_used
    `;
    
    return {
      id: result.rows[0][0],
      userId: result.rows[0][1],
      postId: result.rows[0][2],
      content: result.rows[0][3],
      aiUsed: result.rows[0][4]
    };
  }

  async getUsers(): Promise<any[]> {
    const result = await this.client.queryArray`SELECT * FROM users`;
    return result.rows.map(row => ({
      id: row[0],
      username: row[1],
      personality: row[2],
      followers: row[3] || [],
      following: row[4] || [],
      isAI: row[5],
      createdAt: row[7]
    }));
  }

  async getPosts(limit: number = 20): Promise<any[]> {
    const result = await this.client.queryArray`
      SELECT p.*, u.username, u.personality 
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    
    return result.rows.map(row => ({
      id: row[0],
      userId: row[1],
      content: row[2],
      aiUsed: row[3],
      likes: row[4] || [],
      replies: row[5] || [],
      replyTo: row[6],
      createdAt: row[8],
      author: {
        username: row[9],
        personality: row[10]
      }
    }));
  }

  async updateUserFollows(userId: string, otherUserId: string): Promise<void> {
    await this.client.queryArray`
      UPDATE users 
      SET following = array_append(following, ${otherUserId})
      WHERE id = ${userId}
    `;
    
    await this.client.queryArray`
      UPDATE users 
      SET followers = array_append(followers, ${userId})
      WHERE id = ${otherUserId}
    `;
  }

  async reset(): Promise<void> {
    await this.client.queryArray`DELETE FROM comments`;
    await this.client.queryArray`DELETE FROM posts`;
    await this.client.queryArray`DELETE FROM users`;
  }

  async stats(): Promise<{ users: number; posts: number; comments: number }> {
    const usersResult = await this.client.queryArray`SELECT COUNT(*) FROM users`;
    const postsResult = await this.client.queryArray`SELECT COUNT(*) FROM posts`;
    const commentsResult = await this.client.queryArray`SELECT COUNT(*) FROM comments`;
    
    return {
      users: Number(usersResult.rows[0][0]),
      posts: Number(postsResult.rows[0][1]),
      comments: Number(commentsResult.rows[0][2])
    };
  }
}

// In-Memory Database Implementation (Fallback)
class InMemoryDatabase implements Database {
  private users: Map<string, any> = new Map();
  private posts: Map<string, any> = new Map();
  private comments: Map<string, any> = new Map();
  private userIds: Set<string> = new Set();

  async initialize(): Promise<void> {
    console.log("📝 Using in-memory storage (PostgreSQL not available)");
  }

  async createUser(username: string, personality: string): Promise<any> {
    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = {
      id,
      username,
      personality,
      followers: [],
      following: [],
      isAI: true,
      createdAt: new Date().toISOString()
    };
    this.users.set(id, user);
    this.userIds.add(id);
    return user;
  }

  async createPost(userId: string, content: string, aiUsed: boolean, replyTo?: string): Promise<any> {
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const post = {
      id,
      userId,
      content,
      aiUsed,
      likes: [],
      replies: [],
      replyTo,
      createdAt: new Date().toISOString()
    };
    this.posts.set(id, post);
    return post;
  }

  async createComment(userId: string, postId: string, content: string, aiUsed: boolean): Promise<any> {
    const id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const comment = {
      id,
      userId,
      postId,
      content,
      aiUsed,
      likes: [],
      createdAt: new Date().toISOString()
    };
    this.comments.set(id, comment);
    return comment;
  }

  async getUsers(): Promise<any[]> {
    return Array.from(this.users.values());
  }

  async getPosts(limit: number = 20): Promise<any[]> {
    const posts = Array.from(this.posts.values());
    
    // Add author info
    return posts.slice(0, limit).map(post => {
      const user = this.users.get(post.userId);
      return {
        ...post,
        author: user ? {
          username: user.username,
          personality: user.personality
        } : { username: "Unknown", personality: "unknown" }
      };
    });
  }

  async updateUserFollows(userId: string, otherUserId: string): Promise<void> {
    const user = this.users.get(userId);
    const otherUser = this.users.get(otherUserId);
    
    if (user && otherUser) {
      if (!user.following.includes(otherUserId)) {
        user.following.push(otherUserId);
      }
      if (!otherUser.followers.includes(userId)) {
        otherUser.followers.push(userId);
      }
    }
  }

  async reset(): Promise<void> {
    this.users.clear();
    this.posts.clear();
    this.comments.clear();
    this.userIds.clear();
  }

  async stats(): Promise<{ users: number; posts: number; comments: number }> {
    return {
      users: this.users.size,
      posts: this.posts.size,
      comments: this.comments.size
    };
  }
}

// Database Factory
class DatabaseFactory {
  static async create(): Promise<Database> {
    try {
      // Try PostgreSQL first
      const db = new PostgresDatabase();
      await db.initialize();
      return db;
    } catch (error) {
      console.log("⚠️  PostgreSQL unavailable, using in-memory storage");
      const db = new InMemoryDatabase();
      await db.initialize();
      return db;
    }
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

// KI-Agent mit erweiterter Logik
class SocialAgent {
  private aiKey = Deno.env.get("AI_API_KEY") || "";
  private baseUrl = "https://api.airforce/v1";
  private model = "gemma3-270m:free";
  private limiter = new RateLimiter();
  private personalityTypes = ["friendly", "controversial", "philosophical", "technical", "humorous"];

  async createUser(db: Database): Promise<any> {
    const personality = this.personalityTypes[Math.floor(Math.random() * this.personalityTypes.length)];
    const username = `AI_${["Neo", "Trinity", "Morpheus", "Oracle", "Cypher", "Switch"][Math.floor(Math.random() * 6)]}_${Math.floor(Math.random() * 1000)}`;
    
    try {
      return await db.createUser(username, personality);
    } catch (error) {
      // Username taken, retry
      const retryUsername = `${username}_${Date.now().toString().slice(-4)}`;
      return await db.createUser(retryUsername, personality);
    }
  }

  async createPost(db: Database, user: any, replyTo?: string): Promise<any> {
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

    return await db.createPost(user.id, content, aiUsed, replyTo);
  }

  async createComment(db: Database, user: any, post: any): Promise<any> {
    const shouldComment = Math.random() > 0.5; // 50% Chance
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

    return await db.createComment(user.id, post.id, content, aiUsed);
  }

  async followRandom(db: Database, user: any): Promise<number> {
    const otherUsers = await db.getUsers();
    let followCount = 0;
    
    for (const otherUser of otherUsers) {
      if (otherUser.id !== user.id && Math.random() > 0.6) { // 40% Chance
        await db.updateUserFollows(user.id, otherUser.id);
        followCount++;
      }
    }
    
    return followCount;
  }

  private async aiContent(prompt: string): Promise<string> {
    if (!this.aiKey) return this.fallbackContent(prompt);
    if (!this.limiter.canMakeRequest()) return this.fallbackContent(prompt);

    try {
      console.log(`🤖 AI request: ${prompt.substring(0, 50)}...`);
      
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
      console.error("AI error:", error);
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

// API Handlers
const agent = new SocialAgent();

async function handleCreateAgent(db: Database): Promise<Response> {
  try {
    const user = await agent.createUser(db);
    const followCount = await agent.followRandom(db, user);
    
    // Post erstellen (normal oder reply)
    const posts = await db.getPosts(10);
    let post: any;
    
    if (posts.length > 0 && Math.random() > 0.7) { // 30% Reply Chance
      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      post = await agent.createPost(db, user, randomPost.content);
    } else {
      post = await agent.createPost(db, user);
    }

    // Kommentare erstellen
    let commentCount = 0;
    const otherPosts = (await db.getPosts(3)).filter(p => p.userId !== user.id);
    
    for (const otherPost of otherPosts) {
      if (Math.random() > 0.6) { // 40% Comment Chance
        const comment = await agent.createComment(db, user, otherPost);
        if (comment) commentCount++;
      }
    }

    return Response.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        personality: user.personality,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
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

async function handleGetFeed(db: Database): Promise<Response> {
  try {
    const posts = await db.getPosts(20);
    const stats = await db.stats();

    return Response.json({
      feed: posts,
      stats
    }, {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    console.error("Feed error:", error);
    return Response.json({ error: "Failed to load feed" }, { status: 500 });
  }
}

async function handleReset(db: Database): Promise<Response> {
  try {
    await db.reset();
    
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
async function router(req: Request, db: Database): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
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
      return await handleCreateAgent(db);
    }
    
    if (path === "/api/feed" && req.method === "GET") {
      return await handleGetFeed(db);
    }
    
    if (path === "/api/reset" && req.method === "DELETE") {
      return await handleReset(db);
    }
    
    if (path === "/api/health") {
      const isPostgres = !(db.constructor.name === "InMemoryDatabase");
      return Response.json({ 
        ok: true, 
        aiConfigured: !!Deno.env.get("AI_API_KEY"),
        databaseConnected: true,
        databaseType: isPostgres ? "PostgreSQL" : "In-Memory",
        message: isPostgres ? "✅ PostgreSQL connected" : "📝 Using in-memory storage"
      }, { headers: corsHeaders });
    }
    
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
  
  console.log(`🚀 DEAD INTERNET MEDIA - ROBUST VERSION`);
  console.log("🎯 Always works: PostgreSQL OR In-Memory fallback");
  console.log(`🤖 KI-Key: ${aiKey ? "***konfiguriert***" : "nicht gesetzt"}`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🧠 Echte Social Media Interaktionen mit KI-Agenten`);
  
  try {
    // Create database (auto-detects PostgreSQL or falls back to in-memory)
    const db = await DatabaseFactory.create();
    
    Deno.serve({ port }, (req) => router(req, db));
  } catch (error) {
    console.error("❌ Critical error:", error.message);
    Deno.exit(1);
  }
}