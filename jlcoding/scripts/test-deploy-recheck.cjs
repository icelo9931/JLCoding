// 复测：把现有「复核-贪吃蛇」项目的文件（含 .tsx，曾导致部署失败的结构）复制到新项目并部署，
// 验证打包器的 TS 支持修复——无需重新生成。
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }

  // 1. 取贪吃蛇源文件
  const snake = await db.project.findFirst({
    where: { name: '复核-贪吃蛇' },
    orderBy: { updatedAt: 'desc' },
    include: { files: true },
  })
  if (!snake) throw new Error('找不到复核-贪吃蛇项目（先跑 test-review-e2e.cjs）')
  const hasTsx = snake.files.some((f) => f.path.endsWith('.tsx'))
  ok('源项目含 .tsx（复现原失败结构）', hasTsx, `${snake.files.length} 文件`)

  // 2. 新用户 + 新项目 + 直接写入文件（模拟 ready 状态，跳过生成）
  const email = `dp${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123456' }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '贪吃蛇部署复测' }),
  })
  const pid = (await res.json()).id
  await db.file.createMany({
    data: snake.files.map((f) => ({ projectId: pid, path: f.path, content: f.content })),
  })
  await db.project.update({ where: { id: pid }, data: { status: 'ready' } })
  ok('文件已复制到新项目', true, pid.slice(-6))

  // 3. 部署（修复验证的核心断言）
  res = await fetch(`${base}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie } })
  const dep = await res.json()
  ok('TSX 项目部署成功（原结构复测）', res.status === 200 && /^[0-9a-f]{64}$/.test(dep.sha ?? ''),
    `sha=${String(dep.sha).slice(0, 8)} 入口=${dep.entry} ${String(dep.size ?? 0)} 字节`)

  const appRes = await fetch(`${base}/app/${pid}`)
  const html = await appRes.text()
  ok('/app/:id 200 自包含（root + script + react 运行时）',
    appRes.status === 200 && html.includes('id="root"') && html.includes('<script>') && /react/i.test(html),
    `${html.length} 字节`)

  console.log(fail === 0 ? `=== 部署复测通过（${pass} 项） ===` : `=== 失败（${fail} 项） ===`)
  await db.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
