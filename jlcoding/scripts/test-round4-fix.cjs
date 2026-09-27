// 验证第四轮修复（打开种子项目）：① 画布有内容（Sandpack 编译完成 或 20s 后自动降级 iframe）
// ② 「线上使用」指向部署页且为计算器 ③ 进度面板四阶段全勾 + 进度 100%
const { chromium } = require('playwright')
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }

  const proj = await db.project.findFirst({ where: { name: '计算器（可交互预览）' }, orderBy: { updatedAt: 'desc' }, include: { user: { select: { email: true } } } })
  if (!proj) throw new Error('找不到种子项目')
  console.log(`项目 [${proj.id.slice(-6)}] owner=${proj.user.email}`)

  // 生成本地合法会话令牌（基于 AUTH_SECRET）
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').replace(/^\uFEFF/, '')
  process.env.AUTH_SECRET = env.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)?.[1]
  const { SignJWT } = require('jose')
  const user = await db.user.findUnique({ where: { email: proj.user.email } })
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'jlcoding_session', value: token, url: BASE }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/project/${proj.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=计算器', { timeout: 30_000 }).catch(() => {})

  // ③ 进度面板四阶段全勾（小白模式：分析需求/设计架构/编写代码/构建校验）
  await page.waitForTimeout(3000)
  const body = await page.locator('body').textContent()
  const stages = ['分析需求', '设计架构', '编写代码', '构建校验']
  const present = stages.filter((s) => body.includes(s))
  ok('进度面板四阶段名称齐全', present.length === 4, present.join('/'))
  // 进度 100%：进度条 / 顶部状态
  ok('页面含「已就绪」（ready 状态）', body.includes('已就绪'))

  // ① 画布有内容：等 Sandpack 编译完成（成功）或自动降级 iframe（25s）
  let canvasOk = false
  let mode = ''
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !canvasOk) {
    const frames = page.frames().filter((f) => f !== page.mainFrame())
    for (const f of frames) {
      try {
        const html = await f.locator('body').innerHTML().catch(() => '')
        const txt = await f.locator('body').textContent().catch(() => '')
        // 计算器特征：数字键 或 加减乘除 或 计算 文案
        if (/[0-9]/.test(txt) && /计算|\+|-|×|÷|＝|=|clear|清除/i.test(txt + html)) { canvasOk = true; mode = 'Sandpack/iframe（含计算器特征）'; break }
        if ((html || '').length > 200) { canvasOk = true; mode = 'iframe 已渲染内容'; break }
      } catch { /* 跨域，跳过 */ }
    }
    if (!canvasOk) {
      const t = await page.locator('body').textContent()
      if (/已切换部署页预览|部署页预览/.test(t)) { mode = '降级提示已出现' }
      await page.waitForTimeout(2000)
    }
  }
  ok('① 画布有内容（Sandpack 渲染 或 自动降级 iframe）', canvasOk, mode)

  // ② 线上使用 = 计算器
  const deploy = await db.deploy.findFirst({ where: { projectId: proj.id }, orderBy: { createdAt: 'desc' } })
  ok('② 存在部署记录', Boolean(deploy), deploy ? 'sha=' + deploy.sha.slice(0, 8) : '无')
  if (deploy) {
    const appRes = await fetch(`${BASE}/app/${proj.id}`)
    const html = await appRes.text()
    // 计算器特征（源码/UI 文案）；排除明显的待办应用标志（mock 待办曾有「我的待办」「TodoItem」）
    const isCalc = /计算|calculator|ac|clear|÷|×|＝/i.test(html) && !/我的待办|待办事项|TodoItem|<h1>我的待办/.test(html)
    ok('② /app/:id 200 且为计算器（含计算特征，非待办）', appRes.status === 200 && isCalc, `${html.length} 字节`)
  }

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== 第四轮修复验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
