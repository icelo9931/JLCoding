// 回滚 REST 接口：用目标版本快照覆盖当前文件，并 append 一条新版本记录（append-only，历史不丢）。
// 事务逻辑与「对话触发回滚」共享 lib/versions.ts 的 rollbackToVersion（$transaction 四操作原子）。
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'
import { isRunning } from '@/lib/run-registry'
import { rollbackToVersion, sha8 } from '@/lib/versions'

export async function POST(
  req: Request,
  { params }: { params: { id: string; version: string } }
) {
  const access = await requireProjectAccess(req, params.id)
  if (!access.ok) return access.response
  const projectId = params.id
  const v = Number(params.version)

  if (!Number.isInteger(v) || v < 1) {
    return NextResponse.json({ error: '无效的版本号' }, { status: 400 })
  }
  if (isRunning(projectId)) {
    return NextResponse.json({ error: '该项目正在生成中，请先暂停或等待完成' }, { status: 409 })
  }

  const result = await rollbackToVersion({ projectId, targetVersion: v, provider: access.project.provider })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes('不存在') ? 404 : 500 })
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, files: true },
  })
  console.log(`[jlcoding] 回滚 v${v} → 新版本 v${result.nextVersion} · ${sha8(result.sha)}`)
  return NextResponse.json({ project, version: result.nextVersion, sha: result.sha, rolledBackFrom: v })
}
