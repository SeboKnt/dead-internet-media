#!/bin/bash
# Prisma Setup Script für Deno Deploy

echo "🚀 Setting up Prisma for Deno Deploy..."

# Install Prisma CLI
echo "📦 Installing Prisma CLI..."
npm install -g prisma

# Generate Prisma Client for Deno Edge
echo "🔧 Generating Prisma Deno Client..."
cd prisma
npx prisma generate --generator client

echo "✅ Prisma setup complete!"
echo ""
echo "📝 IMPORTANT: Set DATABASE_URL environment variable in Deno Deploy:"
echo "   DATABASE_URL=\"postgresql://user:password@host:5432/database\""
echo ""
echo "📊 To seed database:"
echo "   deno run --allow-net --allow-env --allow-read prisma/seed.ts"
echo ""
echo "🚀 To run with PostgreSQL:"
echo "   mv main_postgres.ts main.ts"
echo "   deno run --allow-net --allow-env --allow-read main.ts"