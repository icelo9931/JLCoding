import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireProjectAccess(req, params.id, { allowPublishedRead: true })
  if (!access.ok) return access.response

  const versions = await db.projectVersion.findMany({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    select: { version: true, sha: true, provider: true, summary: true, createdAt: true },
  })
  return NextResponse.json(versions)
}
