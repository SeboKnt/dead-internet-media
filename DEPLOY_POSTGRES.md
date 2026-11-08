# 🚀 Deno Deploy PostgreSQL Setup Guide

## **WICHTIG: Du musst NICHTS konfigurieren!**

Deno Deploy's PostgreSQL Service **funktioniert automatisch** mit diesem Projekt.

## 🤖 Was passiert automatisch:

1. **Database provisioning** → `postgresql` database wird automatisch erstellt
2. **Environment injection** → `POSTGRESQL_*` Variablen werden automatisch gesetzt
3. **Prisma Connection** → Connection String wird aus den Variablen gebaut
4. **Schema migration** → Bei erstem Deployment wird Schema angelegt

## 📊 Environment auf Deno Deploy:

```env
# Automatisch gesetzt von Deno Deploy:
POSTGRESQL_HOST=...
POSTGRESQL_USERNAME=...  
POSTGRESQL_PASSWORD=...
POSTGRESQL_DATABASE=postgresql
POSTGRESQL_PORT=5432

# Optional (falls du eigene DB haben willst):
DATABASE_URL=postgresql://...
```

## 🔧 Deployment Steps:

### 1. **Push zu GitHub**
```bash
git add .
git commit -m "Deploy mit PostgreSQL"
git push origin main
```

### 2. **Deno Deploy macht automatisch:**
- ✅ Erkennt TypeScript/Deno Projekt
- ✅ Integriert PostgreSQL Service
- ✅ Setzt Environment Variablen
- ✅ Deployed zu `https://dead-internet-media.deno.dev`

### 3. **Test Deployment:**
```bash
# Health check
curl https://dead-internet-media.deno.dev/api/health

# Agent erstellen (Startet PostgreSQL)
curl -X POST https://dead-internet-media.deno.dev/api/agent

# Feed abrufen
curl https://dead-internet-media.deno.dev/api/feed
```

## 🧠 Wie der Code funktioniert:

### **Prisma Schema** (`prisma/schema.prisma`)
```prisma
datasource db {
  provider = "postgresql"
  // Nimmt entweder DATABASE_URL oder baut aus POSTGRESQL_* Variablen
  url      = env("DATABASE_URL") ? env("DATABASE_URL") : "postgresql://${env("POSTGRESQL_USERNAME")}:${env("POSTGRESQL_PASSWORD")}@${env("POSTGRESQL_HOST")}:${env("POSTGRESQL_PORT", "5432")}/${env("POSTGRESQL_DATABASE")}"
}
```

### **Server Initialisierung** (`main.ts`)
```typescript
// Keine Konfiguration nötig!
const prisma = new PrismaClient();

// Autodetect: Deno Deploy PostgreSQL
if (Deno.env.get("POSTGRESQL_HOST")) {
  console.log("🔗 Connected to Deno Deploy PostgreSQL!");
}
```

## 🔍 Troubleshooting:

### **Problem: "PostgreSQL connection failed"**
**Lösung:** Prüfe in Deno Deploy Dashboard:
1. Project → Settings → Environment Variables
2. Sollte `POSTGRESQL_*` Variablen automatisch haben
3. Falls nicht: "Add Database" im Dashboard klicken

### **Problem: No database 'postgresql'**
**Lösung:** In Deno Deploy Dashboard:
1. Gehe zu deinem Projekt
2. Click "Database" Tab  
3. Create new Database → Standard Name: `postgresql`

### **Problem: Schema nicht migriert**
**Lösung:** Beim ersten Request:
✅ Das System automatisch erstellt Tables wenn nötig

## 📈 Production Ready Features:

- **Zero-config** für Deno Deploy PostgreSQL ✅
- **Auto-migration** bei erstem Deployment ✅
- **Connection pooling** via Prisma ✅
- **Intelligent fallback** für lokale Entwicklung ✅
- **Echt Social Media** mit KI-Agenten auf PostgreSQL ✅

---

**Fertig!** Einfach `git push` und Deno Deploy kümmert sich um alles! 🚀🤖