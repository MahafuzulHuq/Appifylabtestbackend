# ORM & Database Migration Documentation

## Overview

This document provides comprehensive details about the Object-Relational Mapping (ORM) setup and database migration strategy for the application backend. The project uses **Prisma** as the ORM and **PostgreSQL** as the primary database.

---

## 1. ORM Setup: Prisma

### What is Prisma?

Prisma is a next-generation ORM that provides:
- **Type-safe database access** with auto-generated TypeScript types
- **Intuitive data modeling** with declarative schema
- **Automated migrations** with version control
- **Real-time database introspection**
- **Built-in query builder** with IDE autocomplete

### Current Configuration

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

#### Key Components:
- **Generator Client:** Generates the Prisma Client library for database access
- **Datasource DB:** Specifies PostgreSQL as the database provider
- **DATABASE_URL:** Connection string from environment variables (typically in `.env`)

### Installation & Setup

#### Prerequisites:
- Node.js (v14 or higher)
- PostgreSQL database instance
- `.env` file with `DATABASE_URL` variable

#### Initial Setup:

```bash
# Install Prisma CLI and Client
npm install @prisma/client
npm install -D prisma

# Initialize Prisma in existing project
npx prisma init

# Push schema to database (for new projects)
npx prisma db push

# Or generate migrations
npx prisma migrate dev --name init
```

---

## 2. Database Schema

### Data Models Overview

The application follows a **social media feed structure** with the following entities:

#### 2.1 User Model

Represents application users with authentication details.

```prisma
model User {
  id            String         @id @default(cuid())
  firstName     String
  lastName      String
  email         String         @unique
  passwordHash  String
  avatarUrl     String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
  posts         Post[]
  comments      Comment[]
  likes         Like[]
}
```

**Fields:**
- `id`: Unique identifier (CUID format)
- `firstName`, `lastName`: User's name
- `email`: Unique email for authentication
- `passwordHash`: Hashed password (never store plain text)
- `avatarUrl`: Optional profile picture URL
- `createdAt`: Account creation timestamp
- `updatedAt`: Last update timestamp
- **Relations:** Has many posts, comments, likes, and refresh tokens

**Indexes:**
- Email is unique and indexed for fast lookups

---

#### 2.2 RefreshToken Model

Manages JWT refresh tokens for user sessions.

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

**Fields:**
- `id`: Unique token identifier
- `token`: The actual refresh token string
- `userId`: Foreign key to User
- `expiresAt`: Token expiration time
- `createdAt`: Token creation time

**Purpose:** Enable secure session management with JWT refresh token rotation

---

#### 2.3 Post Model

Represents user-created posts in the social feed.

```prisma
model Post {
  id         String    @id @default(cuid())
  authorId   String
  author     User      @relation(fields: [authorId], references: [id])
  content    String
  imageUrl   String?
  visibility String    @default("public")
  createdAt  DateTime  @default(now())
  comments   Comment[]
  likes      Like[]

  @@index([createdAt], name: "Post_createdAt_idx")
  @@index([authorId], name: "Post_authorId_idx")
  @@index([visibility], name: "Post_visibility_idx")
}
```

**Fields:**
- `id`: Unique post identifier
- `authorId`: Foreign key to User (post creator)
- `content`: Post text content
- `imageUrl`: Optional image attachment URL
- `visibility`: Privacy level (public/private/friends)
- `createdAt`: Post creation timestamp
- **Relations:** Has many comments and likes

**Indexes:**
- `Post_createdAt_idx`: For timeline queries (ordered by newest)
- `Post_authorId_idx`: For fetching user's posts
- `Post_visibility_idx`: For filtering by privacy level

---

#### 2.4 Comment Model

Represents comments on posts with support for nested replies.

```prisma
model Comment {
  id        String    @id @default(cuid())
  postId    String
  post      Post      @relation(fields: [postId], references: [id])
  authorId  String
  author    User      @relation(fields: [authorId], references: [id])
  parentId  String?
  parent    Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies   Comment[] @relation("CommentReplies")
  content   String
  createdAt DateTime  @default(now())
  likes     Like[]

  @@index([postId, createdAt], name: "Comment_postId_createdAt_idx")
  @@index([parentId], name: "Comment_parentId_idx")
}
```

**Fields:**
- `id`: Unique comment identifier
- `postId`: Foreign key to Post
- `authorId`: Foreign key to User (comment author)
- `parentId`: Optional self-referential foreign key for nested replies
- `content`: Comment text
- `createdAt`: Comment creation timestamp
- **Relations:** Can have child replies (self-relation), can be liked

**Indexes:**
- `Comment_postId_createdAt_idx`: For fetching comments on a post
- `Comment_parentId_idx`: For fetching nested replies

---

#### 2.5 Like Model

Represents likes/upvotes on posts or comments.

```prisma
model Like {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  postId    String?
  post      Post?    @relation(fields: [postId], references: [id])
  commentId String?
  comment   Comment? @relation(fields: [commentId], references: [id])
  createdAt DateTime @default(now())

  @@index([postId], name: "Like_postId_idx")
  @@index([commentId], name: "Like_commentId_idx")
  @@unique([userId, postId], name: "Like_userId_postId_key")
  @@unique([userId, commentId], name: "Like_userId_commentId_key")
}
```

**Fields:**
- `id`: Unique like identifier
- `userId`: Foreign key to User (who liked)
- `postId`: Optional foreign key to Post
- `commentId`: Optional foreign key to Comment
- `createdAt`: Like timestamp
- **Relations:** References either a post or comment

**Indexes & Constraints:**
- `Like_postId_idx`: For counting/fetching post likes
- `Like_commentId_idx`: For counting/fetching comment likes
- `Like_userId_postId_key`: Unique constraint (user can like post only once)
- `Like_userId_commentId_key`: Unique constraint (user can like comment only once)

---

## 3. Database Migrations

### Migration File Structure

Located in: `prisma/migrations/`

Each migration folder contains:
```
20260609123950_init/
├── migration.sql       # Actual SQL statements
└── migration_lock.toml # Lock file for consistency
```

### Initial Migration: `20260609123950_init`

**Timestamp:** 2026-06-09 at 12:39:50
**Description:** Initial database schema creation

**SQL Operations:**
1. Creates all 5 tables: User, RefreshToken, Post, Comment, Like
2. Establishes all foreign key relationships
3. Creates indexes for performance optimization
4. Sets up unique constraints for data integrity

---

## 4. Common Prisma Commands

### Development Workflow

```bash
# Create a new migration after schema changes
npx prisma migrate dev --name <migration_name>

# Push schema changes without creating a migration file
npx prisma db push

# Reset database (development only - DESTRUCTIVE!)
npx prisma migrate reset

# Show migration status
npx prisma migrate status
```

### Schema Management

```bash
# Generate Prisma Client after schema changes
npx prisma generate

# Open Prisma Studio (visual database browser)
npx prisma studio

# Format schema file
npx prisma format
```

### Deployment

```bash
# Apply all pending migrations (production)
npx prisma migrate deploy

# Resolve migration issues
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## 5. Prisma Client Usage Examples

### Basic Queries

```typescript
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Create
const user = await prisma.user.create({
  data: {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    passwordHash: "hashed_password",
  },
});

// Read
const user = await prisma.user.findUnique({
  where: { email: "john@example.com" },
});

// Update
const updated = await prisma.user.update({
  where: { id: "user_id" },
  data: { avatarUrl: "new_url" },
});

// Delete
await prisma.user.delete({
  where: { id: "user_id" },
});
```

### Advanced Queries with Relations

```typescript
// Get user with all posts
const userWithPosts = await prisma.user.findUnique({
  where: { id: "user_id" },
  include: {
    posts: true,
    comments: true,
  },
});

// Get post with author and comments
const postWithDetails = await prisma.post.findUnique({
  where: { id: "post_id" },
  include: {
    author: true,
    comments: {
      include: {
        author: true,
        replies: true,
      },
    },
    likes: true,
  },
});

// Complex filtering and sorting
const posts = await prisma.post.findMany({
  where: {
    visibility: "public",
    createdAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    },
  },
  include: {
    author: true,
    _count: {
      select: { comments: true, likes: true },
    },
  },
  orderBy: { createdAt: "desc" },
  take: 20, // Pagination
  skip: 0,
});
```

---

## 6. Best Practices

### 1. **Database Connection Management**

```typescript
// Singleton pattern for PrismaClient
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

export default prisma;
```

### 2. **Proper Error Handling**

```typescript
import { Prisma } from "@prisma/client";

try {
  const user = await prisma.user.create({
    data: { /* ... */ },
  });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {  
    }
  }
}
```

### 3. **Use Transactions for Complex Operations**

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Multiple operations in single transaction
  const post = await tx.post.create({
    data: { /* ... */ },
  });

  const like = await tx.like.create({
    data: { /* ... */ },
  });

  return { post, like };
});
```

### 4. **Password Security**

- **Never store plain text passwords**
- Always hash passwords using bcrypt or similar before storage
- Use `passwordHash` field, never expose to client

```typescript
import bcrypt from "bcrypt";

// On registration
const passwordHash = await bcrypt.hash(password, 10);

// On login
const isValid = await bcrypt.compare(plainPassword, user.passwordHash);
```

### 5. **Performance Optimization**

```typescript
// Use select to fetch only needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    firstName: true,
  },
});

// Use take/skip for pagination
const page1 = await prisma.post.findMany({
  take: 10,
  skip: 0,
});

// Use _count for relation counts
const posts = await prisma.post.findMany({
  include: {
    _count: {
      select: { comments: true, likes: true },
    },
  },
});
```

---

## 7. Migration Strategy for Future Changes

### Adding a New Field

```bash
# 1. Update schema.prisma
# model User {
#   ...
#   bio String?
# }

# 2. Create migration
npx prisma migrate dev --name add_user_bio

# 3. Migration is automatically applied
```

### Removing a Field (Careful!)

```bash
# 1. Update schema.prisma (remove the field)

# 2. Create migration
npx prisma migrate dev --name remove_user_bio

# 3. WARNING: Data in that column will be lost!
```

### Renaming a Field

```bash
# 1. Update schema.prisma
# @rename("oldName") decorator for data preservation

# 2. Create migration
npx prisma migrate dev --name rename_user_field

# 3. Migration preserves existing data
```

---

## 8. Environment Configuration

### .env File Setup

```env
# Database connection string
DATABASE_URL="postgresql://user:password@localhost:5432/social_feed?schema=public"

# Node environment
NODE_ENV="development"
```

### Database URL Format

```
postgresql://[user[:password]@][host][:port][/database][?params]
```

**Example:**
```
postgresql://myuser:mypassword@localhost:5432/my_database?schema=public
```

---

## 9. Troubleshooting

### Common Issues

#### Issue: "Can't reach database server"

```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Verify PostgreSQL is running
# For local: ensure PostgreSQL service is active
# For cloud: check connection string and firewall rules
```

#### Issue: Migration fails

```bash
# Check migration status
npx prisma migrate status

# View pending migrations
npx prisma migrate resolve --rolled-back <migration_name>
```

#### Issue: Prisma Client out of sync

```bash
# Regenerate Prisma Client
npx prisma generate

# Clear cache
rm -rf node_modules/.prisma
npm install
```

#### Issue: Type errors in TypeScript

```bash
# Ensure Prisma types are generated
npx prisma generate

# Clear TypeScript cache
rm -rf dist/
npm run build
```

---

## 10. Database Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Database Schema                   │
└─────────────────────────────────────────────────────┘

          ┌──────────────┐
          │     User     │
          ├──────────────┤
          │ id (PK)      │◄───┐
          │ email (UQ)   │    │
          │ firstName    │    │
          │ lastName     │    ├─── (1:N) ───┬─► Post (authorId)
          │ passwordHash │    │             ├─► Comment (authorId)
          │ avatarUrl    │    │             ├─► Like (userId)
          │ createdAt    │    │             └─► RefreshToken (userId)
          │ updatedAt    │    │
          └──────────────┘    │
                              │
          ┌──────────────────────────┐
          │     RefreshToken         │
          ├──────────────────────────┤
          │ id (PK)                  │
          │ token (UQ)               │
          │ userId (FK) ─────────────┘
          │ expiresAt                │
          │ createdAt                │
          └──────────────────────────┘

          ┌──────────────────────────┐
          │         Post             │
          ├──────────────────────────┤
          │ id (PK)                  │
          │ authorId (FK) ───────────────►(User)
          │ content                  │
          │ imageUrl                 │
          │ visibility               │
          │ createdAt                │
          └──────────────────────────┘
                    │
                    ├─── (1:N) ───► Comment (postId)
                    └─── (1:N) ───► Like (postId)

          ┌──────────────────────────┐
          │       Comment            │
          ├──────────────────────────┤
          │ id (PK)                  │
          │ postId (FK) ─────────────────► (Post)
          │ authorId (FK) ─────────────► (User)
          │ parentId (FK, self) ─────────► (Comment)
          │ content                  │
          │ createdAt                │
          └──────────────────────────┘
                    │
                    └─── (1:N) ───► Like (commentId)

          ┌──────────────────────────┐
          │         Like             │
          ├──────────────────────────┤
          │ id (PK)                  │
          │ userId (FK) ────────────────► (User)
          │ postId (FK, nullable) ──────► (Post)
          │ commentId (FK, nullable) ────► (Comment)
          │ createdAt                │
          │ UQ(userId, postId)       │
          │ UQ(userId, commentId)    │
          └──────────────────────────┘
```

---

## 11. Quick Reference

| Command | Purpose |
|---------|---------|
| `npx prisma migrate dev --name <name>` | Create and apply migration |
| `npx prisma db push` | Sync schema without migration history |
| `npx prisma studio` | Open database GUI |
| `npx prisma generate` | Generate Prisma Client types |
| `npx prisma migrate deploy` | Apply migrations (production) |
| `npx prisma migrate reset` | Reset database (dev only) |
| `npx prisma format` | Format schema file |

---

## Resources

- **Prisma Documentation:** https://www.prisma.io/docs/
- **Prisma Schema Reference:** https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
- **PostgreSQL Documentation:** https://www.postgresql.org/docs/
- **JWT Best Practices:** https://tools.ietf.org/html/rfc8725

---

**Last Updated:** 2026-06-11
**Maintained By:** Development Team
