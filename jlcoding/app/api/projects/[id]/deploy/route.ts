// 部署：esbuild 真实打包 → 自包含单文件 HTML → 存 Deploy 表 → 公开链接 /app/:id + bundle SHA-256。
// 部署范围（如实）：React 纯前端应用可网页部署；Python 生成物为桌面应用，不支持网页部署（明确报错说明）。
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/access'
import { isRunning } from '@/lib/run-registry'
import { isPythonProject } from '@/lib/app-meta'
import { bundleReactApp } from '@/lib/bundler'
import { sha8 } from '@/lib/versions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireProjectAccess(req, params.id)
  if (!access.ok) return access.response
  const projectId = params.id

  if (isRunning(projectId)) {
    return NextResponse.json({ error: '该项目正在生成中，请先暂停或等待完成' }, { status: 409 })
  }

  const files = await db.file.findMany({ where: { projectId } })
  if (!files.length) {
    return NextResponse.json({ error: '项目暂无生成结果，请先完成一次生成' }, { status: 400 })
  }
  const paths = files.map((f) => f.path)
  if (isPythonProject(paths)) {
    return NextResponse.json(
      { error: 'Python 桌面应用不支持网页部署（线上部署范围仅限 React 应用）；可下载 ZIP 在本机 python main.py 运行' },
      { status: 400 }
    )
  }

  try {
    const { html, sha, entry } = await bundleReactApp(
      files.map((f) => ({ path: f.path, content: f.content })),
      access.project.name
    )
    await db.deploy.create({ data: { projectId, html, sha } })
    console.log(`[jlcoding] 部署 ${projectId} · ${sha8(sha)}（入口 ${entry}，${html.length} 字节）`)
    return NextResponse.json({
      url: `/app/${projectId}`,
      sha,
      entry,
      size: html.length,
    })
  } catch (e) {
    console.error('[jlcoding] 部署打包失败:', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: `打包失败：${e instanceof Error ? e.message : String(e)}（可重试，或下载 ZIP 本地运行）` },
      { status: 500 }
    )
  }
}
