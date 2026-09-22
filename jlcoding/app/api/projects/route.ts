import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export async function GET(req: Request) {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const user = await getSessionUser(req)
  // 已登录：只看自己的项目；未登录：空列表（可仍通过分享链接访问具体项目）
  const projects = await db.project.findMany({
    where: user ? { userId: user.id } : { userId: null },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { files: true, messages: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: '请先登录或注册' }, { status: 401 })
  }
  const { name, mode, agent } = await req.json().catch(() => ({ name: '', mode: '', agent: '' }))
  const project = await db.project.create({
    data: {
      name: name?.trim() || '未命名项目',
      mode: mode === 'expert' ? 'expert' : 'novice',
      agent: typeof agent === 'string' && agent ? agent : null,
      userId: user.id,
    },
  })
  return NextResponse.json(project, { status: 201 })
}
