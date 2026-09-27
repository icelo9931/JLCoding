// 已部署生成应用的公开访问入口（无需登录——部署链接即分享链接）：
// GET /app/:id → 返回最近一次部署的自包含 HTML（esbuild 打包产物）
import { db } from '@/lib/db'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

const NOT_FOUND = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>未部署 · jlCoding</title>
<style>body{font-family:system-ui;background:#0a0a0a;color:#a1a1aa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}div{text-align:center}h1{color:#e4e4e7;font-size:20px}p{color:#71717a;font-size:13px}</style></head>
<body><div><h1>该应用尚未部署</h1><p>请先在 jlCoding 项目页完成生成并点击「部署」</p></div></body></html>`

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isDbReachable())) {
    return htmlResponse(`<html><body><h1>${dbErrorText()}</h1></body></html>`, 503)
  }
  const [latest] = await db.deploy.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  if (!latest) return htmlResponse(NOT_FOUND, 404)
  return htmlResponse(latest.html)
}
