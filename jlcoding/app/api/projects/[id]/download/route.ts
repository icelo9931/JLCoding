import JSZip from 'jszip'
import { db } from '@/lib/db'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await isDbReachable())) {
    return new Response(JSON.stringify({ error: dbErrorText() }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const project = await db.project.findUnique({
    where: { id: params.id },
    include: { files: true },
  })
  if (!project) {
    return new Response(JSON.stringify({ error: '项目不存在' }), { status: 404 })
  }

  const zip = new JSZip()
  for (const file of project.files) {
    zip.file(file.path, file.content)
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = encodeURIComponent(project.name || 'jlcoding-project')

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}.zip`,
    },
  })
}
