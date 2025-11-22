import { Hono } from 'hono'
import { PrismaClient } from './generated/prisma/edge'
import { withAccelerate } from '@prisma/extension-accelerate'
import jwt from 'jsonwebtoken'
import { scrypt } from '@noble/hashes/scrypt.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

type Variables = {
  userId: string
}

type Env = {
  DATABASE_URL?: string
  JWT_SECRET?: string
}

const app = new Hono<{ Variables: Variables; Bindings: Env }>()

// Initialize Prisma Client with Accelerate extension
// For Cloudflare Workers, create per-request to ensure proper runtime initialization
function getPrismaClient(env?: Env) {
  // Get DATABASE_URL from Cloudflare Workers env
  const dbUrl = env?.DATABASE_URL || process.env.DATABASE_URL
  
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set. Please configure it in wrangler.jsonc or environment variables.')
  }
  
  // CRITICAL: Set DATABASE_URL in process.env BEFORE creating PrismaClient
  // Prisma Client reads from process.env.DATABASE_URL during initialization
  if (typeof process !== 'undefined') {
    if (!process.env) {
      // @ts-ignore - process.env might not be typed in edge runtime
      process.env = {}
    }
    process.env.DATABASE_URL = dbUrl
  }
  
  try {
    // Ensure Prisma runtime is available before creating client
    // The edge client uses WebAssembly runtime which needs to be loaded
    if (typeof PrismaClient === 'undefined') {
      throw new Error('PrismaClient is not available. Check if Prisma runtime is properly bundled.')
    }
    
    // Create Prisma Edge Client - designed for Cloudflare Workers and edge runtimes
    // The edge client uses WebAssembly and is optimized for serverless environments
    // Creating per-request ensures the runtime is properly initialized
    const baseClient = new PrismaClient()
    
    // Verify client was created successfully
    if (!baseClient || typeof baseClient !== 'object') {
      throw new Error('PrismaClient creation returned invalid object')
    }
    
    // Extend with Accelerate extension
    // Accelerate provides connection pooling and caching for edge environments
    const client = baseClient.$extends(withAccelerate())
    return client
  } catch (error: any) {
    console.error('Failed to create Prisma Client:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      dbUrl: dbUrl ? 'set' : 'NOT SET',
      hasProcess: typeof process !== 'undefined',
      hasProcessEnv: typeof process !== 'undefined' && !!process.env,
      prismaClientType: typeof PrismaClient
    })
    throw error
  }
}

// Password hashing utilities using scrypt
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = scrypt(password, salt, { N: 2 ** 16, r: 8, p: 1, dkLen: 32 })
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const [saltHex, hashHex] = hashedPassword.split(':')
  if (!saltHex || !hashHex) return false
  
  const salt = hexToBytes(saltHex)
  const hash = scrypt(password, salt, { N: 2 ** 16, r: 8, p: 1, dkLen: 32 })
  return bytesToHex(hash) === hashHex
}

// JWT, headers, middlewares, db(prisma)

app.post('/api/v1/signup', async(c) => {
 try {
  const { email, password } = await c.req.json()
  
  if (!email || !password) {
    return c.json({ message: "Please provide email and password"}, 400)
  }

  let prismaClient
  try {
    prismaClient = getPrismaClient(c.env)
    
    // Verify client is properly initialized before use
    if (!prismaClient || !prismaClient.user) {
      throw new Error('Prisma Client not properly initialized')
    }
  } catch (prismaError: any) {
    console.error('Prisma Client initialization error:', prismaError)
    console.error('Stack:', prismaError?.stack)
    return c.json({ 
      message: "Database connection error", 
      error: prismaError?.message || 'Failed to initialize database client',
      details: process.env.NODE_ENV === 'development' ? prismaError?.stack : undefined
    }, 500)
  }

  try {
    const existingUser = await prismaClient.user.findFirst({
      where:{
        email
      }
    })

    if (existingUser) {
      return c.json({ message: "User already exists"}, 400)
    }

    const hashedPassword = await hashPassword(password)

    const user = await prismaClient.user.create({ 
      data: {
        email,
        password: hashedPassword
      }
    })

    return c.json({
      userId: user.id
    })
  } catch (dbError: any) {
    console.error('Database operation error:', dbError)
    throw dbError
  }
 } catch (error: any) {
  console.error('Signup error:', error)
  return c.json({ 
    message: "Internal server error", 
    error: error?.message || 'Unknown error' 
  }, 500)
 }
})

app.post('/api/v1/signin', async(c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) {
      return c.json({ message: "Please provide email and password"}, 400)
    }

    const prismaClient = getPrismaClient(c.env)
    const existingUser = await prismaClient.user.findFirst({
      where:{
        email
      }
    })
    
    if (!existingUser) {
      return c.json({ message: "user doesn't exist"}, 400)
    }

    const isPasswordCorrect = await verifyPassword(password, existingUser.password)
    if (!isPasswordCorrect) {
      return c.json({ message: "Invalid password"}, 400)
    }

    const jwtSecret = c.env?.JWT_SECRET || process.env.JWT_SECRET || ''
    const token = await jwt.sign({ userId: existingUser.id }, jwtSecret)
    return c.json({ token: token })
  } catch (error: any) {
    console.error('Signin error:', error)
    return c.json({ 
      message: "Internal server error", 
      error: error?.message || 'Unknown error' 
    }, 500)
  }
})

// Auth Middleware
app.use(async(c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) {
    return c.json({ message: "Unauthorized"}, 401)
  }

  const jwtSecret = (c.env as Env)?.JWT_SECRET || process.env.JWT_SECRET || ''
  const decoded = jwt.verify(token, jwtSecret) as { userId: string }

  if (!decoded) {
    return c.json({ message: "Unauthorized"}, 401)
  }

  c.set('userId', decoded.userId)
  
  return next()
})

app.post('/api/v1/todo', async(c) => {
  try {
    const { title, description } = await c.req.json()
    if (!title || !description) {
      return c.json({ message: "Please provide title and description"}, 400)
    }
    const userId = c.get('userId') as string
    
    const prismaClient = getPrismaClient(c.env)
    const todo = await prismaClient.todo.create({
      data: {
        title,
        description,
        userId: userId
      }
    })
    return c.json({ todo })
  } catch (error: any) {
    console.error('Create todo error:', error)
    return c.json({ 
      message: "Internal server error", 
      error: error?.message || 'Unknown error' 
    }, 500)
  }
})

app.get('/api/v1/todos', async(c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1]
    if (!token) {
      return c.json({ message: "Unauthorized"}, 401)
    }
    const userId = c.get('userId') as string
    
    const prismaClient = getPrismaClient(c.env)
    const todos = await prismaClient.todo.findMany({
      where: {
        userId: userId
      }
    })

    return c.json({ todos })
  } catch (error: any) {
    console.error('Get todos error:', error)
    return c.json({ 
      message: "Internal server error", 
      error: error?.message || 'Unknown error' 
    }, 500)
  }
})

export default app
