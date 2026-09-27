// 「发现」公开列表（无需登录）：已发布项目 + 作者（用户名/脱敏邮箱）+ 规模统计 + 模型/部署信息
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { maskEmail } from '@/lib/access'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isDbReachable())) {
    return NextResponse.json({ error: dbErrorText() }, { status: 503 })
  }
  const projects = await db.project.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: 60,
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true, files: true, versions: true } },
      deploys: { select: { sha: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      author: { name: p.user?.name ?? '匿名', maskedEmail: p.user?.email ? maskEmail(p.user.email) : '***' },
      publishedAt: p.publishedAt,
      model: p.model,
      provider: p.provider,
      status: p.status,
      rounds: p._count.messages,
      files: p._count.files,
      versions: p._count.versions,
      hasDeploy: p.deploys.length > 0,
      deploySha: p.deploys[0]?.sha ?? null,
    }))
  )
}
