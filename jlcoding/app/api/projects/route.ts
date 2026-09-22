import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export async function GET() {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { files: true, messages: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const { name, mode, agent } = await req.json().catch(() => ({ name: '', mode: '', agent: '' }))
  const project = await db.project.create({
    data: {
      name: name?.trim() || '未命名项目',
      mode: mode === 'expert' ? 'expert' : 'novice',
      agent: typeof agent === 'string' && agent ? agent : null,
    },
  })
  return NextResponse.json(project, { status: 201 })
}
