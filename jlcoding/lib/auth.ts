import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export interface SessionUser {
  id: string
  email: string
  name: string
}

const COOKIE_NAME = 'jlcoding_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 天

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET 未配置')
  return new TextEncoder().encode(s)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  if (!match) return null
  try {
    const { payload } = await jwtVerify(match[1], secret())
    return { id: String(payload.sub), email: String(payload.email), name: String(payload.name) }
  } catch {
    return null
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
}
