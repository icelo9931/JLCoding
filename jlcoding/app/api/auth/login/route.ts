import { createSessionToken, sessionCookie, verifyPassword, findUserByEmail } from '@/lib/auth'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!(await isDbReachable())) {
    return Response.json({ error: dbErrorText() }, { status: 503 })
  }
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return Response.json({ error: '请输入邮箱和密码' }, { status: 400 })
  }
  const user = await findUserByEmail(email)
  if (!user) {
    // 区分场景：邮箱未注册 → 前端自动切换到注册 Tab
    return Response.json(
      { error: '该邮箱尚未注册，已为你切换到注册', notRegistered: true },
      { status: 401 }
    )
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: '密码不正确，请重试' }, { status: 401 })
  }
  const token = await createSessionToken({ id: user.id, email: user.email, name: user.name })
  return Response.json(
    { id: user.id, email: user.email, name: user.name },
    { headers: { 'Set-Cookie': sessionCookie(token) } }
  )
}
