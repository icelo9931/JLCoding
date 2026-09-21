import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { languageOf } from '@/lib/utils'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const files = await db.file.findMany({
    where: { projectId: params.id },
    select: { id: true, path: true, language: true, updatedAt: true },
    orderBy: { path: 'asc' },
  })
  return NextResponse.json(files.map((f) => ({ ...f, language: f.language ?? languageOf(f.path) })))
}
