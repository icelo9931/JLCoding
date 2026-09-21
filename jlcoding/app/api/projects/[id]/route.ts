import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      files: true,
    },
  })
  if (!project) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 })
  }
  return NextResponse.json(project)
}
