// 发布/取消发布到「发现」（公开列表）：仅归属人可操作；仅 ready 项目可发布；生成中 409
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'
import { isRunning } from '@/lib/run-registry'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireProjectAccess(req, params.id) // 写操作：必须归属人
  if (!access.ok) return access.response
  if (!access.viewerIsOwner) {
    return NextResponse.json({ error: '无权操作该项目' }, { status: 403 })
  }
  if (isRunning(params.id)) {
    return NextResponse.json({ error: '项目正在生成中，请完成后再发布' }, { status: 409 })
  }

  const { published } = await req.json().catch(() => ({ published: true }))
  const want = published !== false // 默认发布
  if (want && access.project.status !== 'ready') {
    return NextResponse.json({ error: '仅「已就绪」的项目可发布——请先完成生成' }, { status: 400 })
  }

  const project = await db.project.update({
    where: { id: params.id },
    data: { published: want, publishedAt: want ? new Date() : null },
    select: { id: true, name: true, published: true, publishedAt: true },
  })
  console.log(`[jlcoding] ${want ? '发布' : '取消发布'}到发现：${params.id}（${project.name}）`)
  return NextResponse.json(project)
}
