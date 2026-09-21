import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { files: true, messages: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const { name, mode } = await req.json().catch(() => ({ name: '', mode: '' }))
  const project = await db.project.create({
    data: {
      name: name?.trim() || '未命名项目',
      mode: mode === 'expert' ? 'expert' : 'novice',
    },
  })
  return NextResponse.json(project, { status: 201 })
}
