#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

// ECHT SOCIAL MEDIA für KI-Agenten mit Persistenz und echter Interaktion

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

  async createUser(): Promise<User> {
    const personality = this.personalityTypes[Math.floor(Math.random() * this.personalityTypes.length)];
    return {
      id: `u_${Math.random().toString(36).slice(2)}`,
      username: `AI_${["Neo", "Trinity", "Morpheus", "Oracle", "Cypher", "Switch"][Math.floor(Math.random() * 6)]}_${Math.floor(Math.random() * 1000)}`,
      personality,
      followers: [],
      following: [],
      isAI: true,
      createdAt: new Date().toISOString()
    };
  }

  async createPost(user: User, replyTo?: string): Promise<Post> {
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

    return {
      id: `p_${Math.random().toString(36).slice(2)}`,
      userId: user.id,
      content,
      aiUsed,
      likes: [],
      replies: [],
      replyTo: replyTo || null,
      createdAt: new Date().toISOString()
    };
  }

  async createComment(user: User, post: Post): Promise<Comment> {
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

    return {
      id: `c_${Math.random().toString(36).slice(2)}`,
      userId: user.id,
      postId: post.id,
      content,
      aiUsed,
      likes: [],
      createdAt: new Date().toISOString()
    };
  }

  // Neue: Zufällige Follow-Aktionen
  async followRandom(user: User, allUsers: User[]): Promise<string[]> {
    const others = allUsers.filter(u => u.id !== user.id);
    const maxFollows = Math.min(3, others.length);
    const follows: string[] = [];

    for (let i = 0; i < maxFollows; i++) {
      if (Math.random() > 0.6) { // 40% Chance zu folgen
        const target = others[Math.floor(Math.random() * others.length)];
        if (!user.following.includes(target.id)) {
          follows.push(target.id);
        }
      }
    }
    return follows;
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

// Daten-Typen für echte Social Media
interface User {
  id: string;
  username: string;
  personality: string;
  followers: string[];
  following: string[];
  isAI: boolean;
  createdAt: string;
}

interface Post {
  id: string;
  userId: string;
  content: string;
  aiUsed: boolean;
  likes: string[]; // user IDs
  replies: string[]; // post IDs
  replyTo: string | null;
  createdAt: string;
}

interface Comment {
  id: string;
  userId: string;
  postId: string;
  content: string;
  aiUsed: boolean;
  likes: string[];
  createdAt: string;
}

// Persistenter Storage mit JSON-Datei
class SocialStorage {
  private filePath = "./social_data.json";
  private data = {
    users: [] as User[],
    posts: [] as Post[],
    comments: [] as Comment[],
    lastUpdated: new Date().toISOString()
  };

  constructor() {
    this.load();
  }

  private load() {
    try {
      const content = Deno.readTextFileSync(this.filePath);
      this.data = JSON.parse(content);
      console.log(`📂 Geladen: ${this.data.users.length} users, ${this.data.posts.length} posts`);
    } catch {
      console.log("📂 Neue Datenbank erstellt");
      this.save();
    }
  }

  private save() {
    this.data.lastUpdated = new Date().toISOString();
    Deno.writeTextFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  addUser(user: User) {
    this.data.users.push(user);
    this.save();
  }

  addPost(post: Post) {
    this.data.posts.push(post);
    this.save();
  }

  addComment(comment: Comment) {
    if (comment) {
      this.data.comments.push(comment);
      this.save();
    }
  }

  updateUser(userId: string, updates: Partial<User>) {
    const user = this.data.users.find(u => u.id === userId);
    if (user) {
      Object.assign(user, updates);
      this.save();
    }
  }

  getUsers() {
    return [...this.data.users];
  }

  getPosts() {
    return [...this.data.posts].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getComments() {
    return [...this.data.comments];
  }

  getUser(id: string) {
    return this.data.users.find(u => u.id === id);
  }

  getPost(id: string) {
    return this.data.posts.find(p => p.id === id);
  }

  getPostsByUser(userId: string) {
    return this.data.posts.filter(p => p.userId === userId);
  }

  getCommentsForPost(postId: string) {
    return this.data.comments.filter(c => c.postId === postId);
  }

  getFeedForUser(userId: string, limit = 20) {
    const user = this.getUser(userId);
    if (!user) return this.getPosts().slice(0, limit);

    // Posts von gefolgten Usern + eigene Posts
    const followedIds = [...user.following, userId];
    return this.data.posts
      .filter(p => followedIds.includes(p.userId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getStats() {
    return {
      users: this.data.users.length,
      posts: this.data.posts.length,
      comments: this.data.comments.length,
      totalInteractions: this.data.posts.reduce((sum, p) => sum + p.likes.length + p.replies.length, 0) +
                        this.data.comments.reduce((sum, c) => sum + c.likes.length, 0),
      lastUpdated: this.data.lastUpdated
    };
  }
}

const agent = new SocialAgent();
const storage = new SocialStorage();

// API Handlers für echtes Social Media
async function handleCreateAgent(): Promise<Response> {
  try {
    // 1. Neuen User erstellen
    const user = await agent.createUser();
    storage.addUser(user);

    // 2. Zufälligen Folgen (falls andere User existieren)
    const allUsers = storage.getUsers();
    const newFollows = await agent.followRandom(user, allUsers);
    if (newFollows.length > 0) {
      user.following.push(...newFollows);
      storage.updateUser(user.id, { following: user.following });
    }

    // 3. Post erstellen (original oder reply)
    const posts = storage.getPosts();
    let post: Post;
    
    if (posts.length > 0 && Math.random() > 0.7) { // 30% Chance auf Reply
      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      post = await agent.createPost(user, randomPost.content);
      post.replyTo = randomPost.id;
      
      // Reply zum Original-Post hinzufügen
      const originalPost = storage.getPost(randomPost.id);
      if (originalPost) {
        originalPost.replies.push(post.id);
        storage.addPost(post);
        // Original-Post aktualisieren
        const postsData = storage.getPosts();
        const idx = postsData.findIndex(p => p.id === randomPost.id);
        if (idx !== -1) {
          postsData[idx] = originalPost;
          storage.addPost(postsData[idx]); // Überschreibt
        }
      }
    } else {
      post = await agent.createPost(user);
      storage.addPost(post);
    }

    // 4. Kommentare auf andere Posts (ECHTE Interaktion!)
    const otherPosts = storage.getPosts().filter(p => p.userId !== user.id);
    const comments: Comment[] = [];
    
    for (const otherPost of otherPosts.slice(0, 3)) {
      if (Math.random() > 0.6) { // 40% Chance zu kommentieren
        const comment = await agent.createComment(user, otherPost);
        if (comment) {
          storage.addComment(comment);
          comments.push(comment);
        }
      }
    }

    return Response.json({
      success: true,
      user,
      post,
      comments: comments.length,
      newFollows: newFollows.length,
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

async function handleGetFeed(): Promise<Response> {
  const posts = storage.getPosts();
  
  // Erweitere Posts mit User-Infos und Kommentaren
  const feed = posts.map(post => {
    const user = storage.getUser(post.userId);
    const comments = storage.getCommentsForPost(post.id);
    
    return {
      ...post,
      author: user ? { 
        username: user.username, 
        personality: user.personality,
        isAI: user.isAI 
      } : null,
      commentCount: comments.length,
      previewComments: comments.slice(0, 2).map(comment => ({
        id: comment.id,
        content: comment.content.substring(0, 50) + (comment.content.length > 50 ? "..." : ""),
        author: storage.getUser(comment.userId)?.username || "Unknown",
        aiUsed: comment.aiUsed
      }))
    };
  });

  return Response.json({
    feed,
    stats: storage.getStats()
  }, {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function handleGetStats(): Promise<Response> {
  const stats = storage.getStats();
  const aiStats = agent.getStats();
  
  // Top User
  const users = storage.getUsers();
  const topUsers = users
    .map(user => ({
      ...user,
      postCount: storage.getPostsByUser(user.id).length,
      followerCount: user.followers.length
    }))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, 5);

  // Top Posts (meiste Likes + Replies)
  const posts = storage.getPosts();
  const topPosts = posts
    .map(post => ({
      id: post.id,
      content: post.content,
      likes: post.likes.length,
      replies: post.replies.length,
      author: storage.getUser(post.userId)?.username || "Unknown"
    }))
    .sort((a, b) => (b.likes + b.replies) - (a.likes + a.replies))
    .slice(0, 5);

  return Response.json({
    storageStats: stats,
    aiStats,
    topUsers,
    topPosts,
    totalAICalls: stats.posts + stats.comments // Vereinfacht
  }, {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function handleReset(): Promise<Response> {
  try {
    Deno.removeSync("./social_data.json");
    console.log("🗑️ Datenbank zurückgesetzt");
    
    // Leeren Storage neu initialisieren
    const newStorage = new SocialStorage();
    
    return Response.json({
      success: true,
      message: "Database reset complete"
    }, {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return Response.json({ error: "Reset failed" }, { status: 500 });
  }
}

// Main router
async function router(req: Request): Promise<Response> {
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
      return await handleCreateAgent();
    }
    
    if (path === "/api/feed" && req.method === "GET") {
      return await handleGetFeed();
    }
    
    if (path === "/api/stats" && req.method === "GET") {
      return await handleGetStats();
    }
    
    if (path === "/api/reset" && req.method === "DELETE") {
      return await handleReset();
    }
    
    if (path === "/api/health") {
      return Response.json({ 
        ok: true, 
        aiConfigured: !!Deno.env.get("AI_API_KEY"),
        dataFileExists: Deno.statSync("./social_data.json").isFile 
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
  
  console.log(`🚀 ECHT SOCIAL MEDIA für KI-Agenten`);
  console.log(`🤖 KI-Key: ${aiKey ? "***konfiguriert***" : "nicht gesetzt"}`);
  console.log(`📊 Persistente JSON-Datenbank: ./social_data.json`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🧠 Echte Interaktionen: Reply, Follow, Kommentare`);
  
  Deno.serve({ port }, router);
}