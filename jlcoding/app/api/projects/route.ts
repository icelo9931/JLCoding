import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export async function GET(req: Request) {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const user = await getSessionUser(req)
  // 未登录：侧栏为空（分享的项目链接仍可直接访问）；登录后只见自己的项目
  if (!user) return NextResponse.json([])
  const projects = await db.project.findMany({
    where: { userId: user.id },
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
