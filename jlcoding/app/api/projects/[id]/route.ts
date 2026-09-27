import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess, maskEmail } from '@/lib/access'
import { isRunning, BUILDING_STALE_MS } from '@/lib/run-registry'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  // allowPublishedRead：已发布到「发现」的项目对所有人公开只读
  const access = await requireProjectAccess(req, params.id, { allowPublishedRead: true })
  if (!access.ok) return access.response

  // building 陈旧自愈：本进程已无活跃运行且超过阈值（服务重启残留 / 异常中断）
  // → 降级为 paused，用户可从断点续跑，前端不会永远显示「构建中」
  if (access.project.status === 'building' && !isRunning(params.id)) {
    const stale =
      !access.project.runStartedAt ||
      Date.now() - new Date(access.project.runStartedAt).getTime() > BUILDING_STALE_MS
    if (stale) {
      await db.project.update({ where: { id: params.id }, data: { status: 'paused' } })
    }
  }

  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      files: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!project) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 })
  }
  // 附带最新部署信息（仅 sha，不含大字段 html）——前端据此默认走零 CDN 部署页预览
  const latestDeploy = await db.deploy.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    select: { sha: true },
  })
  return NextResponse.json({
    ...project,
    deploy: latestDeploy ? { sha: latestDeploy.sha, url: `/app/${params.id}` } : null,
    // 只读/权限与发布者信息（发现模式展示「发布者 xxx」徽章）
    viewerIsOwner: access.viewerIsOwner,
    author: project.user ? { name: project.user.name, maskedEmail: maskEmail(project.user.email) } : null,
  })
}

// 删除项目：owner 鉴权 + 生成中拒删（409）。Prisma 级联删除
// messages / files / versions / deploys（schema 均 onDelete: Cascade），部署链接 /app/:id 随之 404。
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireProjectAccess(req, params.id)
  if (!access.ok) return access.response
  const projectId = params.id

  if (isRunning(projectId)) {
    return NextResponse.json({ error: '该项目正在生成中，请先暂停或等待完成后再删除' }, { status: 409 })
  }

  const counts = {
    messages: await db.message.count({ where: { projectId } }),
    files: await db.file.count({ where: { projectId } }),
    versions: await db.projectVersion.count({ where: { projectId } }),
    deploys: await db.deploy.count({ where: { projectId } }),
  }
  await db.project.delete({ where: { id: projectId } })
  console.log(`[jlcoding] 删除项目 ${projectId}（级联：${counts.messages} 消息 / ${counts.files} 文件 / ${counts.versions} 版本 / ${counts.deploys} 部署）`)
  return NextResponse.json({ ok: true, deleted: counts })
}
