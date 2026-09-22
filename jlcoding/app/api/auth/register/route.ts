import { db } from '@/lib/db'
import { hashPassword, createSessionToken, sessionCookie, findUserByEmail } from '@/lib/auth'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!(await isDbReachable())) {
    return Response.json({ error: dbErrorText() }, { status: 503 })
  }
  const { email, password, name } = await req.json().catch(() => ({}))
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return Response.json({ error: '密码至少 6 位' }, { status: 400 })
  }
  const normalized = email.toLowerCase().trim()
  if (await findUserByEmail(normalized)) {
    return Response.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 })
  }
  const user = await db.user.create({
    data: {
      email: normalized,
      passwordHash: await hashPassword(password),
      name: (name?.trim() || normalized.split('@')[0]).slice(0, 24),
    },
  })
  const token = await createSessionToken({ id: user.id, email: user.email, name: user.name })
  return Response.json(
    { id: user.id, email: user.email, name: user.name },
    { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } }
  )
}
