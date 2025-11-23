import { Hono } from 'hono'
import { PrismaClient } from './generated/prisma/edge'
import { withAccelerate } from '@prisma/extension-accelerate'
import jwt from 'jsonwebtoken'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

type Variables = {
  userId: string
}

type Env = {
  DATABASE_URL?: string
  JWT_SECRET?: string
}

const app = new Hono<{ Variables: Variables; Bindings: Env }>()

const prismaClient = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
}).$extends(withAccelerate())

async function hashPassword(password: string) {
  const enc = new TextEncoder()
  const pwKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 10000,
    },
    pwKey,
    256
  )

  return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(derivedBits))}`
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const [saltHex, storedHashHex] = hashedPassword.split(':')
  if (!saltHex || !storedHashHex) return false

  const salt = hexToBytes(saltHex)

  const enc = new TextEncoder()
  const pwKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 10000,
    },
    pwKey,
    256
  )

  const derivedHex = bytesToHex(new Uint8Array(derivedBits))

  return derivedHex === storedHashHex
}

// JWT, headers, middlewares, db(prisma)
app.post('/api/v1/signup', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ message: "Please provide email and password" }, 400)
    }

    try {
      const existingUser = await prismaClient.user.findFirst({
        where: {
          email
        }
      })

      if (existingUser) {
        return c.json({ message: "User already exists" }, 400)
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
    const token = jwt.sign({ userId: existingUser.id }, jwtSecret)
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
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret) as { userId: string }
  } catch {
    return c.json({ message: "Unauthorized" }, 401)
  }

  c.set('userId', decoded.userId)

  return next()
})

app.post('/api/v1/todo', async(c) => {
  try {
    const { title, description, completed } = await c.req.json()
    if (!title || !description) {
      return c.json({ message: "Please provide title and description"}, 400)
    }
    const userId = c.get('userId') as string

    const todo = await prismaClient.todo.create({
      data: {
        title,
        description,
        userId: userId,
        completed: completed || false
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
    const userId = c.get('userId') as string

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
