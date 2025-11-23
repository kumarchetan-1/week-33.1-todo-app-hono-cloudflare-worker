# Todo App - Hono Serverless

A serverless Todo application built with Hono framework, deployed on Cloudflare Workers. Features user authentication with JWT and secure password hashing, with a PostgreSQL database managed through Prisma ORM and Prisma Accelerate for edge/serverless optimization.

## 🚀 Features

- **User Authentication**: Sign up and sign in with JWT-based authentication
- **Secure Password Hashing**: PBKDF2 with SHA-256 (10,000 iterations)
- **Todo Management**: Create and retrieve todos for authenticated users
- **Serverless Architecture**: Deployed on Cloudflare Workers for global edge deployment
- **Database**: PostgreSQL with Prisma ORM and Prisma Accelerate for optimized edge queries

## 🛠️ Tech Stack

- **Framework**: [Hono](https://hono.dev/) - Ultrafast web framework for the edge
- **Runtime**: Cloudflare Workers
- **Database**: PostgreSQL
- **ORM**: Prisma with Prisma Accelerate
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: Web Crypto API (PBKDF2)

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or bun
- Cloudflare account
- PostgreSQL database (or Prisma Accelerate connection)
- Wrangler CLI (installed via npm)

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/kumarchetan-1/week-33.1-todo-app-hono-cloudflare-worker.git
cd week-33.1-todo-app-hono-cloudflare-worker
```

2. Install dependencies:
```bash
npm install
```

3. Generate Prisma Client:
```bash
npm run prisma:generate
```

## ⚙️ Configuration

### Environment Variables

The application requires the following environment variables (configured in `wrangler.jsonc`):

- `DATABASE_URL`: Prisma Accelerate connection string or PostgreSQL connection URL
- `JWT_SECRET`: Secret key for signing and verifying JWT tokens

### Cloudflare Bindings

For generating/synchronizing types based on your Worker configuration run:

```bash
npm run cf-typegen
```

This generates TypeScript types for Cloudflare bindings. Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## 🏃 Development

Start the development server:

```bash
npm run dev
```

This will start a local development server using Wrangler, allowing you to test your application locally before deploying.

## 📦 Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

This command deploys your application to Cloudflare Workers with minification enabled.

## 📚 API Endpoints

### Authentication

#### POST `/api/v1/signup`
Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "userId": "uuid"
}
```

#### POST `/api/v1/signin`
Sign in with existing credentials.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "jwt-token"
}
```

### Todos (Protected Routes)

All todo endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

#### POST `/api/v1/todo`
Create a new todo item.

**Request Body:**
```json
{
  "title": "Todo title",
  "description": "Todo description",
  "completed": false
}
```

**Response:**
```json
{
  "todo": {
    "id": "uuid",
    "title": "Todo title",
    "description": "Todo description",
    "completed": false,
    "userId": "uuid",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
}
```

#### GET `/api/v1/todos`
Get all todos for the authenticated user.

**Response:**
```json
{
  "todos": [
    {
      "id": "uuid",
      "title": "Todo title",
      "description": "Todo description",
      "completed": false,
      "userId": "uuid",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
}
```

## 🗄️ Database Schema

The application uses Prisma with the following schema:

- **User**: Stores user accounts with email and hashed password
- **Todo**: Stores todo items linked to users

See `prisma/schema.prisma` for the complete schema definition.

## 📝 Available Scripts

- `npm run dev` - Start development server with Wrangler
- `npm run deploy` - Deploy to Cloudflare Workers (with minification)
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare bindings
- `npm run prisma:generate` - Generate Prisma Client

## 🔒 Security Features

- **Password Hashing**: Uses PBKDF2 with SHA-256, 10,000 iterations, and random salt
- **JWT Authentication**: Secure token-based authentication
- **Protected Routes**: Middleware validates JWT tokens before allowing access to todo endpoints

## 📁 Project Structure

```
.
├── prisma/
│   ├── migrations/          # Database migrations
│   └── schema.prisma        # Prisma schema definition
├── src/
│   ├── generated/
│   │   └── prisma/          # Generated Prisma Client
│   └── index.ts             # Main application file
├── prisma.config.ts         # Prisma configuration
├── wrangler.jsonc           # Cloudflare Workers configuration
└── package.json             # Dependencies and scripts
```

## 🐛 Error Handling

The application includes comprehensive error handling:
- Validation errors for missing required fields
- Database operation error handling
- JWT verification error handling
- User-friendly error messages

## 📄 License

Available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit an issue or a pull request.