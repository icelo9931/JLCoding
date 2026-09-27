// 项目级统一访问控制：所有项目作用域接口（详情/文件/ZIP/chat/后续版本与部署）共用，
// 保证账号权限边界一致：503（DB 不可达）/ 404（不存在）/ 401（未登录）/ 403（非归属人）。
// userId 为空的遗留项目放行（历史迁移数据，见 README 权限模型说明）。
import { db } from '@/lib/db'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import type { Project } from '@prisma/client'
import { NextResponse } from 'next/server'

export type AccessResult =
  | { ok: true; project: Project; user: SessionUser | null; viewerIsOwner: boolean }
  | { ok: false; response: NextResponse }

// allowPublishedRead：已发布到「发现」的项目对所有人开放**只读**（写操作必须仍传 false）
export async function requireProjectAccess(
  req: Request,
  projectId: string,
  opts?: { allowPublishedRead?: boolean }
): Promise<AccessResult> {
  if (!(await isDbReachable())) {
    return { ok: false, response: NextResponse.json({ error: dbErrorText() }, { status: 503 }) }
  }
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return { ok: false, response: NextResponse.json({ error: '项目不存在' }, { status: 404 }) }
  }
  const user = await getSessionUser(req)
  const viewerIsOwner = Boolean(user && project.userId && user.id === project.userId)
  if (project.userId) {
    if (viewerIsOwner) return { ok: true, project, user, viewerIsOwner: true }
    // 非归属人：已发布 + 允许公开只读 → 放行（只读）；未发布 → 401/403
    if (opts?.allowPublishedRead && project.published) {
      return { ok: true, project, user, viewerIsOwner: false }
    }
    if (!user) {
      return { ok: false, response: NextResponse.json({ error: '请先登录归属账号' }, { status: 401 }) }
    }
    return { ok: false, response: NextResponse.json({ error: '无权访问该项目' }, { status: 403 }) }
  }
  return { ok: true, project, user, viewerIsOwner: false }
}

// 邮箱脱敏（发现列表展示发布者）：前缀前 3 位 + ***，如 jl9*** ；前缀不足 3 位时保留 1 位
export function maskEmail(email: string): string {
  const prefix = (email.split('@')[0] ?? '').trim()
  if (!prefix) return '***'
  return `${prefix.slice(0, Math.min(3, prefix.length))}***`
}
