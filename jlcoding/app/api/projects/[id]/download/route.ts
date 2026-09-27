import JSZip from 'jszip'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireProjectAccess(req, params.id, { allowPublishedRead: true })
  if (!access.ok) return access.response

  const files = await db.file.findMany({ where: { projectId: params.id } })
  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.path, file.content)
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = encodeURIComponent(access.project.name || 'jlcoding-project')

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}.zip`,
    },
  })
}
