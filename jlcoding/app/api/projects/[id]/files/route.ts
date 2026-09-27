import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { languageOf } from '@/lib/utils'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireProjectAccess(req, params.id, { allowPublishedRead: true })
  if (!access.ok) return access.response

  const files = await db.file.findMany({
    where: { projectId: params.id },
    select: { id: true, path: true, language: true, updatedAt: true },
    orderBy: { path: 'asc' },
  })
  return NextResponse.json(files.map((f) => ({ ...f, language: f.language ?? languageOf(f.path) })))
}
